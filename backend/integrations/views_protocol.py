"""
Protocol API endpoints — the external-facing surface of T-Rails.
These endpoints accept the canonical change object from any source system
and return the canonical result object. They are source-system agnostic.

Authentication: Bearer token (API key)
Base path: /api/v1/assurance/
"""
import time
import logging
import json

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone

from .auth import APIKeyAuthentication
from .models import IntegrationApp, AssuranceRequest
from .schema import validate_canonical_change, normalise_canonical_change, build_result_object
from watson.engine.factory import get_watson_engine
from watson.models import WatsonChecklist, ChecklistGroup, ChecklistItem
from watson.views import _persist_checklist, _supersede_existing, _resolve_effective_criteria

logger = logging.getLogger(__name__)


def _get_or_error(source_change_id: str, app: IntegrationApp):
    """
    Retrieve the active checklist for a source_change_id.
    Returns (checklist, None) or (None, Response error).
    """
    checklist = WatsonChecklist.objects.filter(
        source_change_id=source_change_id,
        integration_app=app,
    ).exclude(
        status=WatsonChecklist.Status.SUPERSEDED
    ).order_by('-generated_at').first()

    if not checklist:
        return None, Response({
            'error': f"No active checklist found for change_id '{source_change_id}'.",
            'hint':  'Call POST /api/v1/assurance/generate first.',
        }, status=404)

    return checklist, None


class ProtocolGenerateView(APIView):
    """
    POST /api/v1/assurance/generate/
    Step 1 + 2 of the protocol.
    """
    authentication_classes = [APIKeyAuthentication]
    permission_classes     = []

    def post(self, request):
        app     = request.user
        api_key = request.auth

        data   = request.data
        errors = validate_canonical_change(data)
        if errors:
            return Response({'error': 'Schema validation failed.', 'errors': errors}, status=400)

        source_change_id = data['change_id']
        start_time = time.time()

        req_log = AssuranceRequest.objects.create(
            app              = app,
            api_key          = api_key,
            request_type     = AssuranceRequest.RequestType.GENERATE,
            source_change_id = source_change_id,
            status           = AssuranceRequest.ResultStatus.PENDING,
            request_payload  = {k: v for k, v in data.items() if k not in ('attachments_with_paths',)},
        )

        try:
            WatsonChecklist.objects.filter(
                source_change_id=source_change_id,
                integration_app=app,
            ).exclude(
                status=WatsonChecklist.Status.SUPERSEDED
            ).update(status=WatsonChecklist.Status.SUPERSEDED)

            payload = normalise_canonical_change(data)
            engine  = get_watson_engine(app=app)
            result  = engine.generate_checklist(payload)

            checklist = WatsonChecklist.objects.create(
                change           = None,
                source_change_id = source_change_id,
                integration_app  = app,
                status           = WatsonChecklist.Status.DRAFT,
                generated_by     = result.get('model', 'watson'),
                confidence       = result.get('confidence'),
                source_notes     = result.get('source_notes', ''),
                json_artifact    = result,
            )

            for g_order, gd in enumerate(result.get('groups', [])):
                group = ChecklistGroup.objects.create(
                    checklist  = checklist,
                    code       = gd['code'],
                    title      = gd['title'],
                    phase      = gd.get('phase', ''),
                    group_type = gd.get('group_type', 'PRE'),
                    task       = None,
                    order      = g_order,
                )
                for i_order, item in enumerate(gd.get('items', [])):
                    ChecklistItem.objects.create(
                        group              = group,
                        code               = item['code'],
                        description        = item['description'],
                        rationale          = item.get('rationale', ''),
                        command_hint       = item.get('command_hint', ''),
                        caution            = item.get('caution', ''),
                        technical_criteria = item.get('technical_criteria', ''),
                        confidence_flag    = item.get('confidence_flag', 'HIGH'),
                        order              = i_order,
                    )

            output = build_result_object(checklist, source_change_id)

            duration = int((time.time() - start_time) * 1000)
            req_log.status           = AssuranceRequest.ResultStatus.SUCCESS
            req_log.response_payload = {'result_id': str(checklist.id), 'overall_verdict': output['overall_verdict']}
            req_log.duration_ms      = duration
            req_log.checklist        = checklist
            req_log.save()

            _fire_webhook(app, 'generate.complete', output)
            return Response(output, status=201)

        except Exception as e:
            logger.exception(f"Protocol generate failed for {source_change_id}: {e}")
            req_log.status        = AssuranceRequest.ResultStatus.FAILED
            req_log.error_message = str(e)[:500]
            req_log.duration_ms   = int((time.time() - start_time) * 1000)
            req_log.save()
            return Response({
                'error':  'Checklist generation failed.',
                'detail': str(e)[:200],
            }, status=502)


class ProtocolAcceptView(APIView):
    """
    PATCH /api/v1/assurance/accept/
    Step 3 + 4 of the protocol.

    Body: {
        change_id: str,
        decisions: [
            {
                item_code: str,
                acceptance: ACCEPTED|REJECTED|MODIFIED,
                note: str,
                criteria_override: str  (optional — replaces technical_criteria)
            }
        ]
    }
    """
    authentication_classes = [APIKeyAuthentication]
    permission_classes     = []

    def patch(self, request):
        app  = request.user
        data = request.data

        source_change_id = data.get('change_id')
        if not source_change_id:
            return Response({'error': 'change_id is required.'}, status=400)

        decisions = data.get('decisions', [])
        if not decisions:
            return Response({'error': 'decisions array is required and must not be empty.'}, status=400)

        checklist, err = _get_or_error(source_change_id, app)
        if err:
            return err

        valid_decisions = {'ACCEPTED', 'REJECTED', 'MODIFIED'}
        updated = []
        errors  = []

        for d in decisions:
            code       = d.get('item_code')
            acceptance = d.get('acceptance', '').upper()
            note       = d.get('note', '')
            override   = d.get('criteria_override', '')

            if not code:
                errors.append('item_code is required in each decision')
                continue
            if acceptance not in valid_decisions:
                errors.append(f"Invalid acceptance '{acceptance}' for item '{code}'.")
                continue

            try:
                item = ChecklistItem.objects.get(group__checklist=checklist, code=code)
                item.acceptance      = acceptance
                item.acceptance_note = note
                item.accepted_at     = timezone.now()

                # Human criteria override — explicit criteria_override field
                # takes highest priority, followed by note on MODIFIED items
                if override:
                    item.technical_criteria = override
                elif acceptance == 'MODIFIED' and note.strip():
                    # When MODIFIED with a note, the note becomes the
                    # effective criteria for Phase 2 validation
                    item.technical_criteria = note.strip()

                item.save()
                updated.append(code)
            except ChecklistItem.DoesNotExist:
                errors.append(f"Item '{code}' not found in checklist.")

        # Promote checklist status
        all_items = ChecklistItem.objects.filter(group__checklist=checklist)
        if all_items.filter(acceptance='PENDING').count() == 0:
            checklist.status = WatsonChecklist.Status.ACCEPTED
            checklist.save()
        elif checklist.status == WatsonChecklist.Status.DRAFT:
            checklist.status = WatsonChecklist.Status.REVIEWING
            checklist.save()

        output = build_result_object(checklist, source_change_id)

        AssuranceRequest.objects.create(
            app=app, api_key=request.auth,
            request_type=AssuranceRequest.RequestType.ACCEPT,
            source_change_id=source_change_id,
            status=AssuranceRequest.ResultStatus.SUCCESS,
            checklist=checklist,
            request_payload={'decisions_count': len(decisions)},
            response_payload={'updated': updated, 'errors': errors},
        )

        return Response({
            'updated': updated,
            'errors':  errors,
            'result':  output,
        })


class ProtocolValidateView(APIView):
    """
    POST /api/v1/assurance/validate/
    Step 5 + 6 of the protocol.
    Can be called incrementally — only NOT_RUN and CAUTION items are re-scored.
    """
    authentication_classes = [APIKeyAuthentication]
    permission_classes     = []

    def post(self, request):
        app  = request.user
        data = request.data

        source_change_id = data.get('change_id')
        if not source_change_id:
            return Response({'error': 'change_id is required.'}, status=400)

        checklist, err = _get_or_error(source_change_id, app)
        if err:
            return err

        if checklist.status not in (
            WatsonChecklist.Status.ACCEPTED,
            WatsonChecklist.Status.REVIEWING,
        ):
            return Response({
                'error': f"Checklist is in '{checklist.status}' status. "
                         f"Items must be accepted before validation.",
                'hint':  'Call PATCH /api/v1/assurance/accept/ first.',
            }, status=400)

        start_time = time.time()

        # Build items payload — resolve effective criteria per item
        items_payload = []
        for group in checklist.groups.prefetch_related('items').all():
            for item in group.items.all():
                # Use _resolve_effective_criteria so human overrides
                # from the accept step are honoured in validation
                effective_criteria = _resolve_effective_criteria(item)

                items_payload.append({
                    'id':                 item.id,
                    'code':               item.code,
                    'description':        item.description,
                    'rationale':          item.rationale,
                    'technical_criteria': effective_criteria,
                    'confidence_flag':    item.confidence_flag,
                    'acceptance':         item.acceptance,
                    'impl_result':        item.impl_result,
                    'linked_task_status': None,
                    'caution':            item.caution,
                })

        eligible = [
            i for i in items_payload
            if i['acceptance'] in ('ACCEPTED', 'MODIFIED')
            and i['impl_result'] in ('NOT_RUN', 'CAUTION')
        ]

        if not eligible:
            return Response({
                'scored':          0,
                'eligible':        0,
                'overall_verdict': build_result_object(checklist, source_change_id)['overall_verdict'],
                'message':         'No eligible items to score.',
                'result':          build_result_object(checklist, source_change_id),
            })

        errors = validate_canonical_change(data)
        evidence_errors = [e for e in errors if 'activity' in e or 'change_window' in e]
        if evidence_errors:
            return Response({'error': 'Schema validation failed.', 'errors': evidence_errors}, status=400)

        payload = normalise_canonical_change(data)

        try:
            engine  = get_watson_engine(app=app)
            results = engine.passive_score(payload, items_payload)
        except Exception as e:
            logger.exception(f"Protocol validate failed for {source_change_id}: {e}")
            return Response({'error': 'Scoring failed.', 'detail': str(e)[:200]}, status=502)

        updated = []
        for r in results:
            try:
                item = ChecklistItem.objects.get(id=r['item_id'])
                item.impl_result       = r['result']
                item.impl_watson_note  = r['watson_note']
                item.impl_evidence     = json.dumps(r.get('principles_checked', {}))[:500]
                item.impl_validated_at = timezone.now()
                item.impl_auto_scored  = True
                item.save()
                updated.append(r['item_id'])
            except ChecklistItem.DoesNotExist:
                pass

        checklist.refresh_from_db()
        output = build_result_object(checklist, source_change_id)

        duration = int((time.time() - start_time) * 1000)
        AssuranceRequest.objects.create(
            app=app, api_key=request.auth,
            request_type=AssuranceRequest.RequestType.VALIDATE,
            source_change_id=source_change_id,
            status=AssuranceRequest.ResultStatus.SUCCESS,
            checklist=checklist,
            duration_ms=duration,
            request_payload={'activity_count': len(data.get('activity', []))},
            response_payload={'scored': len(updated), 'verdict': output['overall_verdict']},
        )

        _fire_webhook(app, 'validate.complete', output)

        return Response({
            'scored':   len(updated),
            'eligible': len(eligible),
            'result':   output,
        })


class ProtocolResultView(APIView):
    """GET /api/v1/assurance/result/<change_id>/"""
    authentication_classes = [APIKeyAuthentication]
    permission_classes     = []

    def get(self, request, change_id):
        app = request.user
        checklist, err = _get_or_error(change_id, app)
        if err:
            return err
        return Response(build_result_object(checklist, change_id))


class ProtocolSchemaView(APIView):
    """GET /api/v1/assurance/schema/ — public, no auth required"""
    authentication_classes = []
    permission_classes     = []

    def get(self, request):
        return Response({
            'schema_version': '1.0',
            'documentation':  'https://github.com/your-org/t-rails/wiki/protocol',
            'input_schema': {
                'description': 'Canonical Change Object — send this to /generate and /validate',
                'required_fields': list(sorted([
                    'change_id', 'ticket_number', 'short_description',
                    'change_type', 'priority', 'risk_level',
                    'change_window_start', 'change_window_end',
                ])),
                'optional_fields': [
                    'description', 'implementation_plan', 'rollback_plan', 'test_plan',
                    'category', 'service', 'impact', 'planned_start', 'planned_end',
                    'tasks', 'cis', 'activity', 'attachments',
                ],
                'enums': {
                    'change_type':             ['Normal', 'Standard', 'Emergency'],
                    'priority':                ['1', '2', '3', '4'],
                    'risk_level':              ['High', 'Medium', 'Low'],
                    'ci.environment':          ['Production', 'Staging', 'UAT', 'Development', 'DR'],
                    'ci.business_criticality': ['Critical', 'High', 'Medium', 'Low'],
                    'ci.role':                 ['Affected', 'Impacted'],
                    'activity.action_type':    ['COMMENT', 'TASK_UPDATE', 'ATTACHMENT', 'STATUS_CHANGE'],
                },
            },
            'output_schema': {
                'description': 'Canonical Result Object — returned from all protocol endpoints',
                'top_level_fields': [
                    'schema_version', 'result_id', 'source_change_id',
                    'generated_at', 'model', 'domain', 'confidence',
                    'status', 'overall_verdict', 'stats', 'groups',
                ],
                'overall_verdict_values': ['PASS', 'FAIL', 'PARTIAL', 'PENDING'],
                'item_result_values':     ['NOT_RUN', 'PASS', 'FAIL', 'CAUTION', 'SKIPPED'],
                'confidence_flag_values': ['HIGH', 'AI-GENERATED', 'UNSURE'],
            },
            'endpoints': {
                'POST /api/v1/assurance/generate/':          'Step 1+2: submit change, get checklist',
                'PATCH /api/v1/assurance/accept/':           'Step 3+4: submit human decisions',
                'POST /api/v1/assurance/validate/':          'Step 5+6: submit evidence, get scores',
                'GET /api/v1/assurance/result/<change_id>/': 'Retrieve current result anytime',
                'GET /api/v1/assurance/schema/':             'This endpoint — schema documentation',
            },
        })


# ── Webhook helper ─────────────────────────────────────────────────────────

def _fire_webhook(app: IntegrationApp, event: str, payload: dict):
    """Fire webhook to app's registered URL if configured. Non-blocking."""
    if not app.webhook_url:
        return
    import threading
    import requests
    import hmac
    import hashlib

    def _send():
        try:
            body    = json.dumps({'event': event, 'payload': payload})
            headers = {'Content-Type': 'application/json', 'X-TRails-Event': event}
            if app.webhook_secret:
                sig = hmac.new(
                    app.webhook_secret.encode(),
                    body.encode(),
                    hashlib.sha256,
                ).hexdigest()
                headers['X-TRails-Signature'] = f'sha256={sig}'
            requests.post(app.webhook_url, data=body, headers=headers, timeout=10)
        except Exception as e:
            logger.warning(f"Webhook delivery failed for {app.name}: {e}")

    threading.Thread(target=_send, daemon=True).start()