from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q
from .models import ChangeRequest, ChangeTask, Attachment, ActivityLog
from .serializers import (ChangeRequestSerializer, ChangeRequestCreateSerializer,
                           ChangeTaskSerializer, ChangeTaskCreateSerializer,
                           AttachmentSerializer, ActivityLogSerializer)

VALID_TRANSITIONS = {
    'NEW':       ['ASSESS', 'CANCELLED'],
    'ASSESS':    ['AUTHORIZE', 'CANCELLED'],
    'AUTHORIZE': ['SCHEDULED', 'ASSESS', 'CANCELLED'],
    'SCHEDULED': ['IMPLEMENT', 'CANCELLED'],
    'IMPLEMENT': ['REVIEW', 'CANCELLED'],
    'REVIEW':    ['CLOSED', 'IMPLEMENT'],
    'CLOSED':    [],
    'CANCELLED': [],
}

# Role-based permissions per transition
# Format: { 'TO_STATUS': [allowed_roles] }  — empty list = any authenticated user
TRANSITION_ROLE_REQUIRED = {
    'ASSESS':    ['REQUESTER', 'IMPLEMENTER', 'CAB_MEMBER', 'CAB_MANAGER', 'ADMIN'],  # Requester submits their own change
    'AUTHORIZE': ['CAB_MEMBER', 'CAB_MANAGER', 'ADMIN'],
    'SCHEDULED': ['CAB_MANAGER', 'ADMIN'],
    'IMPLEMENT': ['IMPLEMENTER', 'CAB_MANAGER', 'ADMIN'],
    'REVIEW':    ['IMPLEMENTER', 'CAB_MANAGER', 'ADMIN'],
    'CLOSED':    ['CAB_MANAGER', 'ADMIN'],
    'CANCELLED': ['IMPLEMENTER', 'CAB_MANAGER', 'ADMIN'],
}


def all_tasks_closed(change):
    """True if every task is Completed, Skipped, or Cancelled."""
    open_tasks = change.tasks.exclude(status__in=['Completed', 'Skipped', 'Cancelled'])
    return not open_tasks.exists()


class ChangeListCreateView(generics.ListCreateAPIView):
    def get_serializer_class(self):
        return ChangeRequestCreateSerializer if self.request.method == 'POST' else ChangeRequestSerializer

    def get_queryset(self):
        qs = ChangeRequest.objects.select_related('requester', 'assigned_to').prefetch_related('tasks', 'attachments')
        q = self.request.query_params.get('q', '')
        if q:
            qs = qs.filter(
                Q(ticket_number__icontains=q) |
                Q(short_description__icontains=q) |
                Q(assignment_group__icontains=q) |
                Q(category__icontains=q)
            )
        status_f = self.request.query_params.get('status', '')
        if status_f:
            qs = qs.filter(status=status_f)
        return qs

    def perform_create(self, serializer):
        change = serializer.save(requester=self.request.user)
        ActivityLog.objects.create(
            change=change, user=self.request.user,
            action_type='STATUS_CHANGE',
            message=f'Change request {change.ticket_number} created.',
            metadata={'new_status': 'NEW'}
        )


class ChangeDetailView(generics.RetrieveUpdateAPIView):
    queryset = ChangeRequest.objects.select_related('requester', 'assigned_to').prefetch_related('tasks', 'attachments', 'activity_logs', 'change_cis__ci')

    def get_serializer_class(self):
        return ChangeRequestCreateSerializer if self.request.method in ['PUT', 'PATCH'] else ChangeRequestSerializer

    def perform_update(self, serializer):
        serializer.save()
        ActivityLog.objects.create(
            change=serializer.instance, user=self.request.user,
            action_type='STATUS_CHANGE',
            message='Change request updated.',
            metadata={}
        )


class ChangeTransitionView(APIView):
    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        new_status = request.data.get('status')
        allowed = VALID_TRANSITIONS.get(change.status, [])

        if new_status not in allowed:
            return Response({'error': f'Cannot transition from {change.status} to {new_status}.'}, status=400)

        # ── Role check ──────────────────────────────────────────────
        required_roles = TRANSITION_ROLE_REQUIRED.get(new_status, [])
        user_role = getattr(request.user, 'role', '')
        if required_roles and user_role not in required_roles:
            return Response({
                'error': f'Your role ({user_role}) cannot move a change to {new_status}. Required: {required_roles}'
            }, status=403)

        # ── Block CLOSED until all tasks are done (issue #4) ────────
        if new_status == 'CLOSED' and not all_tasks_closed(change):
            open_tasks = change.tasks.exclude(status__in=['Completed', 'Skipped', 'Cancelled'])
            return Response({
                'error': f'Cannot close change: {open_tasks.count()} task(s) are still open. '
                         f'Complete, skip, or cancel all tasks before closing.'
            }, status=400)

        old_status = change.status
        change.status = new_status

        # ── Auto-timestamps on change (issue #6) ───────────────────
        if new_status == 'IMPLEMENT' and not change.actual_start:
            change.actual_start = timezone.now()
        if new_status in ['CLOSED', 'CANCELLED']:
            change.actual_end = timezone.now()

        change.save()

        ActivityLog.objects.create(
            change=change, user=request.user,
            action_type='STATUS_CHANGE',
            message=f'Status changed from {old_status} to {new_status}.',
            metadata={'old_status': old_status, 'new_status': new_status}
        )

        # Auto-generate Watson checklist when entering AUTHORIZE (if none exists)
        if new_status == 'AUTHORIZE':
            try:
                from watson.models import WatsonChecklist
                from watson.engine.factory import get_watson_engine
                active_cl = WatsonChecklist.objects.filter(
                    change=change
                ).exclude(status=WatsonChecklist.Status.SUPERSEDED).first()

                if not active_cl:
                    # Reload change with full relations for watson payload
                    change_full = ChangeRequest.objects.prefetch_related(
                        'tasks', 'attachments', 'change_cis__ci', 'activity_logs'
                    ).get(pk=change.pk)

                    from watson.views import _build_payload
                    payload = _build_payload(change_full)
                    engine  = get_watson_engine()
                    result  = engine.generate_checklist(payload)

                    from watson.models import ChecklistGroup, ChecklistItem
                    cl = WatsonChecklist.objects.create(
                        change=change, status=WatsonChecklist.Status.DRAFT,
                        generated_by=result.get('model', 'watson-auto'),
                        confidence=result.get('confidence'),
                        source_notes=result.get('source_notes', ''),
                        json_artifact=result,
                    )
                    task_map = {t.id: t for t in change_full.tasks.all()}
                    for g_order, gd in enumerate(result.get('groups', [])):
                        task_obj = task_map.get(gd.get('task_ref'))
                        grp = ChecklistGroup.objects.create(
                            checklist=cl, code=gd['code'], title=gd['title'],
                            phase=gd.get('phase',''), group_type=gd.get('group_type','PRE'),
                            task=task_obj, order=g_order,
                        )
                        for i_order, item in enumerate(gd.get('items',[])):
                            ChecklistItem.objects.create(
                                group=grp, code=item['code'], description=item['description'],
                                rationale=item.get('rationale',''), command_hint=item.get('command_hint',''),
                                caution=item.get('caution',''), order=item.get('order', i_order),
                            )
                    ActivityLog.objects.create(
                        change=change, user=request.user, action_type='WATSON_ACTION',
                        message=f'Watson auto-generated checklist on entering Authorize phase.',
                        metadata={'model': result.get('model'), 'confidence': result.get('confidence')}
                    )
            except Exception as e:
                # Never block the transition due to Watson errors
                pass

        from .serializers import ChangeRequestSerializer as S
        return Response(S(change).data)


class ChangeTaskListCreateView(generics.ListCreateAPIView):
    def get_serializer_class(self):
        return ChangeTaskCreateSerializer if self.request.method == 'POST' else ChangeTaskSerializer

    def get_queryset(self):
        return ChangeTask.objects.filter(change_id=self.kwargs['pk']).select_related('assigned_to', 'ci')

    def perform_create(self, serializer):
        change = ChangeRequest.objects.get(pk=self.kwargs['pk'])
        existing_count = ChangeTask.objects.filter(change=change).count()
        task = serializer.save(change=change, order=existing_count + 1)
        ActivityLog.objects.create(
            change=change, user=self.request.user,
            action_type='TASK_UPDATE',
            message=f'Task created: {task.short_description}',
            metadata={'task_id': task.id, 'task_number': task.task_number}
        )


class ChangeTaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = ChangeTask.objects.select_related('ci', 'assigned_to', 'change').prefetch_related('task_cis__ci')

    def get_serializer_class(self):
        return ChangeTaskCreateSerializer if self.request.method in ['PUT', 'PATCH'] else ChangeTaskSerializer

    def perform_update(self, serializer):
        old = self.get_object()
        old_status = old.status
        new_status = serializer.validated_data.get('status', old_status)

        # Tasks can only be moved to terminal states during IMPLEMENT phase
        terminal = ['Completed', 'Skipped', 'Cancelled']
        if new_status in terminal and old_status not in terminal:
            change_status = old.change.status
            if change_status != 'IMPLEMENT':
                from rest_framework.exceptions import ValidationError
                raise ValidationError(
                    f'Tasks can only be completed during the Implementation phase. '
                    f'Current change status is {change_status}. '
                    f'Move the change to Implement first.'
                )

        task = serializer.save()

        # ── Auto actual_start / actual_end on task (issue #5) ──────
        if old_status != 'In Progress' and new_status == 'In Progress' and not task.actual_start:
            task.actual_start = timezone.now()
            task.save(update_fields=['actual_start'])
            # Also set change actual_start if not already set (issue #6)
            if not task.change.actual_start:
                task.change.actual_start = task.actual_start
                task.change.save(update_fields=['actual_start'])

        if old_status not in ['Completed', 'Skipped', 'Cancelled'] and \
           new_status in ['Completed', 'Skipped', 'Cancelled'] and not task.actual_end:
            task.actual_end = timezone.now()
            task.save(update_fields=['actual_end'])

            # If this was the last open task — set change actual_end (issue #6)
            change = task.change
            if all_tasks_closed(change) and not change.actual_end:
                change.actual_end = task.actual_end
                change.save(update_fields=['actual_end'])

        ActivityLog.objects.create(
            change=task.change, user=self.request.user,
            action_type='TASK_UPDATE',
            message=f'Task {task.task_number} updated: {old_status} → {new_status}' if old_status != new_status else f'Task {task.task_number} updated.',
            metadata={'task_id': task.id, 'old_status': old_status, 'new_status': new_status}
        )


class AttachmentUploadView(APIView):
    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        task_id = request.data.get('task_id')
        task = ChangeTask.objects.get(pk=task_id) if task_id else None
        f = request.FILES.get('file')
        if not f:
            return Response({'error': 'No file provided'}, status=400)
        attachment = Attachment.objects.create(
            change=change, task=task,
            uploaded_by=request.user,
            file=f, filename=f.name,
            attachment_type=request.data.get('attachment_type', 'OTHER')
        )
        ActivityLog.objects.create(
            change=change, user=request.user,
            action_type='ATTACHMENT',
            message=f'Attachment uploaded: {f.name}',
            metadata={'attachment_id': attachment.id}
        )
        return Response(AttachmentSerializer(attachment).data, status=201)


class CommentCreateView(APIView):
    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        message = request.data.get('message', '').strip()
        if not message:
            return Response({'error': 'Message is required'}, status=400)
        log = ActivityLog.objects.create(
            change=change, user=request.user,
            action_type='COMMENT', message=message
        )
        return Response(ActivityLogSerializer(log).data, status=201)


class ActivityLogListView(generics.ListAPIView):
    serializer_class = ActivityLogSerializer
    def get_queryset(self):
        return ActivityLog.objects.filter(change_id=self.kwargs['pk'])


# ── CI management ──────────────────────────────────────────────────────────
from .models import ChangeCI
from .serializers import ChangeCISerializer
from cmdb.models import ConfigurationItem


class ChangeCIListCreateView(APIView):
    def get(self, request, pk):
        cis = ChangeCI.objects.filter(change_id=pk).select_related('ci')
        return Response(ChangeCISerializer(cis, many=True).data)

    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.get(pk=pk)
            ci     = ConfigurationItem.objects.get(pk=request.data.get('ci_id'))
        except (ChangeRequest.DoesNotExist, ConfigurationItem.DoesNotExist) as e:
            return Response({'error': str(e)}, status=400)

        role = request.data.get('role', 'Affected')
        ChangeCI.objects.get_or_create(change=change, ci=ci, role=role)

        ActivityLog.objects.create(
            change=change, user=request.user,
            action_type='STATUS_CHANGE',
            message=f'CI attached as {role}: {ci.name} ({ci.ci_id})',
            metadata={'ci_id': ci.id, 'role': role}
        )

        if role == 'Affected':
            raw_depth = change.ci_impact_depth
            max_depth = None if raw_depth == 'full' else int(raw_depth)
            impacted = ci.get_all_impacted(max_depth=max_depth)
            seen_ids = set(ChangeCI.objects.filter(change=change).values_list('ci_id', flat=True))
            for imp_ci in impacted:
                if imp_ci.pk not in seen_ids:
                    ChangeCI.objects.get_or_create(change=change, ci=imp_ci, role='Impacted')
                    seen_ids.add(imp_ci.pk)

        all_cis = ChangeCI.objects.filter(change_id=pk).select_related('ci')
        return Response(ChangeCISerializer(all_cis, many=True).data, status=201)


class ChangeCIDeleteView(APIView):
    def delete(self, request, pk):
        try:
            cci = ChangeCI.objects.get(pk=pk)
        except ChangeCI.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        cci.delete()
        return Response(status=204)


# ── Task Transition View ────────────────────────────────────────────────────

TASK_VALID_TRANSITIONS = {
    'Open':        ['In Progress', 'Skipped', 'Cancelled'],
    'In Progress': ['Completed', 'Cancelled'],
    'Completed':   [],
    'Skipped':     [],
    'Cancelled':   ['Open'],  # allow reopen
}

class ChangeTaskTransitionView(APIView):
    def post(self, request, pk):
        try:
            task = ChangeTask.objects.select_related('change').get(pk=pk)
        except ChangeTask.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        new_status = request.data.get('status')
        old_status = task.status
        allowed = TASK_VALID_TRANSITIONS.get(old_status, [])

        if new_status not in allowed:
            return Response({'error': f'Cannot move task from {old_status} to {new_status}.'}, status=400)

        # Enforce: terminal states only during IMPLEMENT
        terminal = ['Completed', 'Skipped', 'Cancelled']
        if new_status in terminal and task.change.status != 'IMPLEMENT':
            return Response({
                'error': f'Tasks can only be completed during the Implementation phase. '
                         f'Change is currently in {task.change.status}.'
            }, status=400)

        task.status = new_status

        if old_status != 'In Progress' and new_status == 'In Progress' and not task.actual_start:
            task.actual_start = timezone.now()
            if not task.change.actual_start:
                task.change.actual_start = task.actual_start
                task.change.save(update_fields=['actual_start'])

        if new_status in terminal and not task.actual_end:
            task.actual_end = timezone.now()
            if all_tasks_closed(task.change) and not task.change.actual_end:
                task.change.actual_end = task.actual_end
                task.change.save(update_fields=['actual_end'])

        task.save()

        ActivityLog.objects.create(
            change=task.change, user=request.user,
            action_type='TASK_UPDATE',
            message=f'Task {task.task_number}: {old_status} → {new_status}',
            metadata={'task_id': task.id, 'old_status': old_status, 'new_status': new_status}
        )
        from .serializers import ChangeTaskSerializer as TS
        return Response(TS(task).data)


# ── Task CI management ──────────────────────────────────────────────────────

from .models import TaskCI
from .serializers import TaskCISerializer

class TaskCIListCreateView(APIView):
    """GET/POST /api/changes/tasks/<pk>/cis/"""
    def get(self, request, pk):
        cis = TaskCI.objects.filter(task_id=pk).select_related('ci')
        return Response(TaskCISerializer(cis, many=True).data)

    def post(self, request, pk):
        try:
            task = ChangeTask.objects.get(pk=pk)
            ci   = ConfigurationItem.objects.get(pk=request.data.get('ci_id'))
        except (ChangeTask.DoesNotExist, ConfigurationItem.DoesNotExist) as e:
            return Response({'error': str(e)}, status=400)

        tci, _ = TaskCI.objects.get_or_create(task=task, ci=ci,
                                              defaults={'notes': request.data.get('notes','')})
        ActivityLog.objects.create(
            change=task.change, user=request.user,
            action_type='TASK_UPDATE',
            message=f'CI {ci.name} linked to task {task.task_number}',
            metadata={'ci_id': ci.id, 'task_id': task.id}
        )
        return Response(TaskCISerializer(TaskCI.objects.filter(task=task).select_related('ci'), many=True).data, status=201)


class TaskCIDeleteView(APIView):
    """DELETE /api/changes/tasks/<task_pk>/cis/<pk>/"""
    def delete(self, request, task_pk, pk):
        try:
            TaskCI.objects.get(pk=pk, task_id=task_pk).delete()
        except TaskCI.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(status=204)
