from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from .models import WatsonChecklist, ChecklistItem
from .serializers import WatsonChecklistSerializer
from .engine.factory import get_watson_engine
from changes.models import ChangeRequest, ActivityLog
from changes.serializers import ChangeRequestSerializer

class GenerateChecklistView(APIView):
    """POST /api/watson/changes/<pk>/generate-checklist/  phase=AUTHORIZE|IMPLEMENT"""
    def post(self, request, pk):
        change = ChangeRequest.objects.prefetch_related('tasks', 'attachments', 'activity_logs').get(pk=pk)
        phase = request.data.get('phase', 'AUTHORIZE')

        # Build context payload for Watson
        change_data = {
            'title': change.title,
            'description': change.description,
            'change_type': change.change_type,
            'priority': change.priority,
            'risk_level': change.risk_level,
            'impact': change.impact,
            'rollback_plan': change.rollback_plan,
            'tasks': [{'title': t.title, 'description': t.description, 'status': t.status} for t in change.tasks.all()],
            'attachments': [{'filename': a.filename, 'attachment_type': a.attachment_type} for a in change.attachments.all()],
        }

        engine = get_watson_engine()
        result = engine.generate_authorize_checklist(change_data)

        # Store checklist
        checklist, created = WatsonChecklist.objects.get_or_create(
            change=change, phase=phase,
            defaults={'raw_watson_response': result}
        )
        if not created:
            checklist.raw_watson_response = result
            checklist.approved_by = None
            checklist.approved_at = None
            checklist.save()
            checklist.items.all().delete()

        for item_data in result.get('items', []):
            ChecklistItem.objects.create(checklist=checklist, **item_data)

        ActivityLog.objects.create(change=change, user=request.user, action_type='WATSON_ACTION',
            message=f'Watson.ai generated {phase} checklist with {len(result["items"])} items.',
            metadata={'phase': phase, 'model': result.get('model'), 'confidence': result.get('confidence')})

        return Response(WatsonChecklistSerializer(checklist).data, status=201)


class EvaluateChecklistView(APIView):
    """POST /api/watson/changes/<pk>/evaluate/  — runs at IMPLEMENT phase"""
    def post(self, request, pk):
        change = ChangeRequest.objects.prefetch_related('tasks', 'attachments', 'activity_logs').get(pk=pk)
        checklist = WatsonChecklist.objects.prefetch_related('items').get(change=change, phase='AUTHORIZE')

        evidence = {
            'comments': [{'message': log.message, 'action_type': log.action_type} for log in change.activity_logs.all()],
            'attachments': [{'filename': a.filename, 'attachment_type': a.attachment_type} for a in change.attachments.all()],
        }
        checklist_data = {
            'items': [{'id': item.id, 'description': item.description, 'category': item.category} for item in checklist.items.all()]
        }

        engine = get_watson_engine()
        result = engine.evaluate_implementation({}, checklist_data, evidence)

        for res in result.get('results', []):
            item = checklist.items.get(id=res['id'])
            item.result = res['result']
            item.evidence_note = res['evidence_note']
            item.reviewed_at = timezone.now()
            item.save()

        ActivityLog.objects.create(change=change, user=request.user, action_type='WATSON_ACTION',
            message=f'Watson.ai evaluated implementation checklist.',
            metadata={'model': result.get('model'), 'confidence': result.get('confidence')})

        return Response(WatsonChecklistSerializer(checklist).data)


class ApproveChecklistView(APIView):
    """POST /api/watson/checklists/<pk>/approve/  — CAB approval"""
    def post(self, request, pk):
        checklist = WatsonChecklist.objects.get(pk=pk)
        if not request.user.is_cab:
            return Response({'error': 'Only CAB members can approve checklists.'}, status=403)
        checklist.approved_by = request.user
        checklist.approved_at = timezone.now()
        checklist.save()
        ActivityLog.objects.create(change=checklist.change, user=request.user, action_type='CAB_DECISION',
            message=f'CAB member {request.user.get_full_name()} approved the Watson checklist.',
            metadata={'checklist_id': checklist.id})
        return Response(WatsonChecklistSerializer(checklist).data)


class ChecklistDetailView(APIView):
    def get(self, request, pk):
        change = ChangeRequest.objects.get(pk=pk)
        checklists = WatsonChecklist.objects.filter(change=change).prefetch_related('items')
        return Response(WatsonChecklistSerializer(checklists, many=True).data)
