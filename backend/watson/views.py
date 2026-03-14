import json
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.utils import timezone
from .models import WatsonChecklist, ChecklistGroup, ChecklistItem
from .serializers import WatsonChecklistSerializer, ChecklistItemSerializer
from .engine.factory import get_watson_engine
from changes.models import ChangeRequest, ActivityLog, ChangeTask


# Phases where re-derive is allowed (before AUTHORIZE it gets locked)
REDERIVE_ALLOWED_STATUSES = {'NEW', 'ASSESS'}


def _build_payload(change):
    return {
        'short_description':  change.short_description,
        'description':        change.description,
        'change_type':        change.change_type,
        'category':           change.category,
        'service':            change.service,
        'priority':           change.priority,
        'risk_level':         change.risk_level,
        'impact':             change.impact,
        'implementation_plan': change.implementation_plan,
        'rollback_plan':      change.rollback_plan,
        'tasks': [
            {'id': t.id, 'short_description': t.short_description,
             'description': t.description, 'status': t.status, 'order': t.order,
             'ci_name': t.ci.name if t.ci else '',
             'ci_type': t.ci.ci_type if t.ci else ''}
            for t in change.tasks.order_by('order').select_related('ci')
        ],
        'cis': [
            {'name': cc.ci.name, 'ci_type': cc.ci.ci_type,
             'os': cc.ci.os or '', 'environment': cc.ci.environment}
            for cc in change.change_cis.select_related('ci').all()
        ],
        'attachments': [
            {'filename': a.filename, 'attachment_type': a.attachment_type}
            for a in change.attachments.all()
        ],
        # Full paths for IBM engine text extraction
        'attachments_with_paths': [
            {'filename': a.filename, 'attachment_type': a.attachment_type,
             'file_path': a.file.path if a.file else ''}
            for a in change.attachments.all()
        ],
        'ticket_number': change.ticket_number,
        'activity': [
            {'message': al.message, 'action_type': al.action_type,
             'created_at': str(al.created_at)}
            for al in change.activity_logs.order_by('-created_at')[:50]
        ],
    }


class GenerateChecklistView(APIView):
    """POST /api/watson/changes/<pk>/generate/"""
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.prefetch_related(
                'tasks', 'attachments', 'change_cis__ci', 'activity_logs'
            ).get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({'error': 'Change not found'}, status=404)

        # Lock re-derive once change reaches AUTHORIZE or beyond
        if change.status not in REDERIVE_ALLOWED_STATUSES:
            return Response({
                'error': f'Checklist cannot be re-derived once the change is in {change.status} phase. '
                         f'The accepted checklist is now the governing document.'
            }, status=400)

        # Supersede prior checklists
        WatsonChecklist.objects.filter(change=change).exclude(
            status=WatsonChecklist.Status.SUPERSEDED
        ).update(status=WatsonChecklist.Status.SUPERSEDED)

        # Check for uploaded JSON artifact
        json_override = None
        uploaded = request.FILES.get('json_file')
        if uploaded:
            try:
                json_override = json.loads(uploaded.read().decode('utf-8'))
            except Exception:
                return Response({'error': 'Invalid JSON file'}, status=400)

        payload = _build_payload(change)
        engine  = get_watson_engine()
        result  = json_override if json_override else engine.generate_checklist(payload)

        if json_override:
            result.setdefault('model', 'manual-upload')
            result.setdefault('confidence', 1.0)
            result.setdefault('source_notes', f'Uploaded: {uploaded.name}')

        checklist = WatsonChecklist.objects.create(
            change       = change,
            status       = WatsonChecklist.Status.DRAFT,
            generated_by = result.get('model', 'watson-mock-v1'),
            confidence   = result.get('confidence'),
            source_notes = result.get('source_notes', ''),
            json_artifact = result,
        )

        # Build task lookup
        task_map = {t.id: t for t in change.tasks.all()}

        for g_order, gd in enumerate(result.get('groups', [])):
            task_obj = None
            if gd.get('task_ref') and gd['task_ref'] in task_map:
                task_obj = task_map[gd['task_ref']]

            group = ChecklistGroup.objects.create(
                checklist  = checklist,
                code       = gd['code'],
                title      = gd['title'],
                phase      = gd.get('phase', ''),
                group_type = gd.get('group_type', 'PRE'),
                task       = task_obj,
                order      = g_order,
            )
            for i_order, item in enumerate(gd.get('items', [])):
                ChecklistItem.objects.create(
                    group        = group,
                    code         = item['code'],
                    description  = item['description'],
                    rationale    = item.get('rationale', ''),
                    command_hint = item.get('command_hint', ''),
                    caution      = item.get('caution', ''),
                    order        = item.get('order', i_order),
                )

        total = sum(len(g.get('items', [])) for g in result.get('groups', []))
        ActivityLog.objects.create(
            change=change, user=request.user, action_type='WATSON_ACTION',
            message=f'Watson derived checklist: {total} items across {len(result.get("groups",[]))} groups. Domain: {result.get("domain","unknown")}.',
            metadata={'model': result.get('model'), 'confidence': result.get('confidence')}
        )

        return Response(WatsonChecklistSerializer(checklist).data, status=201)


class ChecklistDetailView(APIView):
    """GET /api/watson/changes/<pk>/checklist/"""
    def get(self, request, pk):
        qs = WatsonChecklist.objects.filter(
            change_id=pk
        ).exclude(status=WatsonChecklist.Status.SUPERSEDED).prefetch_related(
            'groups__items__accepted_by', 'groups__task'
        ).order_by('-generated_at')
        if not qs.exists():
            return Response(None)
        return Response(WatsonChecklistSerializer(qs.first()).data)


class ChecklistItemAcceptView(APIView):
    """PATCH /api/watson/items/<pk>/accept/"""
    def patch(self, request, pk):
        try:
            item = ChecklistItem.objects.select_related('group__checklist__change').get(pk=pk)
        except ChecklistItem.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        # Only allowed during AUTHORIZE phase
        change = item.group.checklist.change
        if change.status != 'AUTHORIZE':
            return Response({'error': 'Items can only be accepted/rejected during the Authorize phase.'}, status=400)

        acceptance = request.data.get('acceptance')
        if acceptance not in ('ACCEPTED', 'REJECTED', 'MODIFIED'):
            return Response({'error': 'acceptance must be ACCEPTED, REJECTED, or MODIFIED'}, status=400)

        item.acceptance      = acceptance
        item.acceptance_note = request.data.get('note', '')
        item.accepted_by     = request.user
        item.accepted_at     = timezone.now()
        item.save()

        checklist = item.group.checklist
        all_items = ChecklistItem.objects.filter(group__checklist=checklist)
        if all_items.filter(acceptance='PENDING').count() == 0:
            checklist.status     = WatsonChecklist.Status.ACCEPTED
            checklist.accepted_by = request.user
            checklist.accepted_at = timezone.now()
            checklist.save()
        elif checklist.status == WatsonChecklist.Status.DRAFT:
            checklist.status = WatsonChecklist.Status.REVIEWING
            checklist.save()

        return Response(ChecklistItemSerializer(item).data)


class PassiveScoreView(APIView):
    """
    POST /api/watson/changes/<pk>/passive-score/
    Watson reads the activity stream and auto-scores accepted items.
    Called by the frontend periodically during IMPLEMENT phase.
    No implementer action required.
    """
    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.prefetch_related(
                'tasks', 'attachments', 'change_cis__ci', 'activity_logs'
            ).get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        if change.status != 'IMPLEMENT':
            return Response({'error': 'Passive scoring only runs during IMPLEMENT phase.'}, status=400)

        checklist = WatsonChecklist.objects.filter(
            change=change
        ).exclude(status=WatsonChecklist.Status.SUPERSEDED).prefetch_related(
            'groups__items', 'groups__task'
        ).order_by('-generated_at').first()

        if not checklist:
            return Response({'error': 'No active checklist found.'}, status=404)

        # Build item list with linked task status
        items_payload = []
        for group in checklist.groups.all():
            linked_task_status = group.task.status if group.task else None
            for item in group.items.all():
                items_payload.append({
                    'id':                 item.id,
                    'description':        item.description,
                    'acceptance':         item.acceptance,
                    'impl_result':        item.impl_result,
                    'linked_task_status': linked_task_status,
                    'caution':            item.caution,
                })

        payload = _build_payload(change)
        engine  = get_watson_engine()
        results = engine.passive_score(payload, items_payload)

        updated = []
        for r in results:
            try:
                item = ChecklistItem.objects.get(id=r['item_id'])
                item.impl_result       = r['result']
                item.impl_watson_note  = r['watson_note']
                item.impl_evidence     = r.get('evidence_used', '')[:500]
                item.impl_validated_at = timezone.now()
                item.impl_auto_scored  = r.get('auto_scored', True)
                item.save()
                updated.append(item.id)
            except ChecklistItem.DoesNotExist:
                pass

        if updated:
            ActivityLog.objects.create(
                change=change, user=request.user, action_type='WATSON_ACTION',
                message=f'Watson passively scored {len(updated)} checklist item(s) from activity stream.',
                metadata={'scored_ids': updated}
            )

        # Return fresh checklist
        checklist.refresh_from_db()
        return Response({
            'scored': len(updated),
            'checklist': WatsonChecklistSerializer(
                WatsonChecklist.objects.prefetch_related('groups__items__accepted_by', 'groups__task')
                .get(pk=checklist.pk)
            ).data
        })


class ExportChecklistJSON(APIView):
    """GET /api/watson/changes/<pk>/export/"""
    def get(self, request, pk):
        try:
            change    = ChangeRequest.objects.get(pk=pk)
            checklist = WatsonChecklist.objects.filter(
                change=change
            ).exclude(status=WatsonChecklist.Status.SUPERSEDED).prefetch_related(
                'groups__items'
            ).latest('generated_at')
        except Exception:
            return Response({'error': 'No checklist found'}, status=404)

        export = {
            'format': 't-rails-checklist-v1',
            'change_number': change.ticket_number,
            'generated_by':  checklist.generated_by,
            'confidence':    checklist.confidence,
            'groups': [
                {
                    'code': g.code, 'title': g.title, 'phase': g.phase,
                    'group_type': g.group_type,
                    'task_ref': g.task_id,
                    'items': [
                        {'code': i.code, 'description': i.description,
                         'rationale': i.rationale, 'command_hint': i.command_hint,
                         'caution': i.caution, 'acceptance': i.acceptance}
                        for i in g.items.all()
                    ]
                }
                for g in checklist.groups.prefetch_related('items').all()
            ]
        }
        from django.http import HttpResponse
        resp = HttpResponse(json.dumps(export, indent=2), content_type='application/json')
        resp['Content-Disposition'] = f'attachment; filename="t-rails-{change.ticket_number}.json"'
        return resp
