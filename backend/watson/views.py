import json
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.utils import timezone

from .models import WatsonChecklist, ChecklistGroup, ChecklistItem
from .serializers import WatsonChecklistSerializer, ChecklistItemSerializer
from .engine.factory import get_watson_engine
from changes.models import ChangeRequest, ActivityLog, ChangeTask

logger = logging.getLogger(__name__)

# Phases where re-derive is allowed
REDERIVE_ALLOWED_STATUSES = {'NEW', 'ASSESS'}


# ── Payload builder ────────────────────────────────────────────────────────

def _build_payload(change):
    """
    Build the dict passed to the Watson engine.
    Caps long text fields to keep prompt tokens under control.
    Primary CI is determined by Django (not Watson) for P5 authority checks.
    """
    affected_cis = change.change_cis.select_related('ci').filter(role='Affected')
    primary_ci = None
    for cc in affected_cis:
        if primary_ci is None:
            primary_ci = cc.ci
        elif cc.ci.business_criticality in ('Critical', 'High') and \
             primary_ci.business_criticality not in ('Critical', 'High'):
            primary_ci = cc.ci

    return {
        'ticket_number':      change.ticket_number,
        'short_description':  change.short_description,
        'description':        (change.description or '')[:500],
        'change_type':        change.change_type,
        'category':           change.category,
        'service':            change.service,
        'priority':           change.priority,
        'risk_level':         change.risk_level,
        'impact':             change.impact,
        'implementation_plan': (change.implementation_plan or '')[:600],
        'rollback_plan':      (change.rollback_plan or '')[:300],
        'test_plan':          (change.test_plan or '')[:300],

        # P1 temporal proof — use CAB-approved window
        'change_window_start': str(change.change_window_start) if change.change_window_start else 'Not specified',
        'change_window_end':   str(change.change_window_end)   if change.change_window_end   else 'Not specified',
        'planned_start':       str(change.planned_start)       if change.planned_start       else 'Not specified',
        'planned_end':         str(change.planned_end)         if change.planned_end         else 'Not specified',

        # P5 authority — Django knows CI risk, Watson shouldn't guess
        'primary_ci_name': primary_ci.name        if primary_ci else 'Not specified',
        'primary_ci_env':  primary_ci.environment if primary_ci else '',

        'tasks': [
            {
                'id':                t.id,
                'short_description': t.short_description,
                'description':       (t.description or '')[:1000],
                'status':            t.status,
                'order':             t.order,
                'ci_name':           t.ci.name    if t.ci else '',
                'ci_type':           t.ci.ci_type if t.ci else '',
            }
            for t in change.tasks.order_by('order').select_related('ci')
        ],
        'cis': [
            {
                'name':                 cc.ci.name,
                'ci_type':              cc.ci.ci_type,
                'os':                   cc.ci.os or '',
                'environment':          cc.ci.environment,
                'business_criticality': cc.ci.business_criticality,
                'ip_address':           str(cc.ci.ip_address or ''),
                'role':                 cc.role,
            }
            for cc in change.change_cis.select_related('ci').all()
        ],
        'attachments': [
            {'filename': a.filename, 'attachment_type': a.attachment_type}
            for a in change.attachments.all()
        ],
        'attachments_with_paths': [
            {
                'filename':        a.filename,
                'attachment_type': a.attachment_type,
                'file_path':       a.file.path if a.file else '',
            }
            for a in change.attachments.all()
        ],
        'activity': [
            {
                'message':     al.message,
                'action_type': al.action_type,
                'created_at':  str(al.created_at),
            }
            for al in change.activity_logs.order_by('-created_at')[:50]
        ],
    }


# ── Effective criteria resolver ────────────────────────────────────────────

def _resolve_effective_criteria(item: ChecklistItem) -> str:
    """
    Resolve the criteria Phase 2 should validate against.

    Priority order:
      1. If item is MODIFIED and acceptance_note is non-empty → use human's note
         (senior engineer has explicitly overridden the AI criteria)
      2. If technical_criteria is set → use AI-generated criteria
      3. Fall back to description as a last resort

    This ensures human corrections in Authorize phase are honoured by
    Phase 2 validation rather than ignored.
    """
    if item.acceptance == 'MODIFIED' and item.acceptance_note.strip():
        return item.acceptance_note.strip()
    if item.technical_criteria.strip():
        return item.technical_criteria.strip()
    return item.description


# ── Correction examples for future checklist generation ───────────────────

def _build_correction_examples(domain: str) -> str:
    """
    Find past human corrections for AI-generated items.
    Injects them as few-shot examples to improve future generations.
    Only used when enough corrections exist to be meaningful.
    """
    try:
        corrections = ChecklistItem.objects.filter(
            confidence_flag='AI-GENERATED',
            acceptance='MODIFIED',
        ).exclude(
            acceptance_note=''
        ).select_related(
            'group__checklist'
        ).order_by('-accepted_at')[:8]

        if corrections.count() < 3:
            return ''

        lines = ['=== PAST HUMAN CORRECTIONS — learn from these ===']
        for item in corrections:
            lines.append(
                f"Description: {item.description}\n"
                f"AI criteria: {item.technical_criteria}\n"
                f"Human corrected to: {item.acceptance_note}\n"
            )
        return '\n'.join(lines)
    except Exception:
        return ''


# ── Checklist persistence helper ───────────────────────────────────────────

def _persist_checklist(change, result, user):
    """
    Save a Watson result dict to the database.
    Returns the created WatsonChecklist instance.
    """
    checklist = WatsonChecklist.objects.create(
        change        = change,
        status        = WatsonChecklist.Status.DRAFT,
        generated_by  = result.get('model', 'watson'),
        confidence    = result.get('confidence'),
        source_notes  = result.get('source_notes', ''),
        json_artifact = result,
    )

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
                group              = group,
                code               = item['code'],
                description        = item['description'],
                rationale          = item.get('rationale', ''),
                command_hint       = item.get('command_hint', ''),
                caution            = item.get('caution', ''),
                technical_criteria = item.get('technical_criteria', ''),
                confidence_flag    = item.get('confidence_flag', 'HIGH'),
                order              = item.get('order', i_order),
            )

    total = sum(len(g.get('items', [])) for g in result.get('groups', []))
    ActivityLog.objects.create(
        change      = change,
        user        = user,
        action_type = 'WATSON_ACTION',
        message     = (
            f"Watson derived checklist: {total} items across "
            f"{len(result.get('groups', []))} groups. "
            f"Domain: {result.get('domain', 'unknown')}."
        ),
        metadata = {
            'model':      result.get('model'),
            'confidence': result.get('confidence'),
            'domain':     result.get('domain'),
        }
    )
    return checklist


def _supersede_existing(change):
    """Delete items/groups from superseded checklists and mark them superseded."""
    old_checklists = WatsonChecklist.objects.filter(change=change).exclude(
        status=WatsonChecklist.Status.SUPERSEDED
    )
    for old_cl in old_checklists:
        ChecklistGroup.objects.filter(checklist=old_cl).delete()
    old_checklists.update(status=WatsonChecklist.Status.SUPERSEDED)


# ── Views ──────────────────────────────────────────────────────────────────

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

        if change.status not in REDERIVE_ALLOWED_STATUSES:
            return Response({
                'error': (
                    f'Checklist cannot be re-derived once the change is in '
                    f'{change.status} phase. '
                    f'The accepted checklist is now the governing document.'
                )
            }, status=400)

        _supersede_existing(change)

        # Optional JSON override upload
        json_override = None
        uploaded = request.FILES.get('json_file')
        if uploaded:
            try:
                json_override = json.loads(uploaded.read().decode('utf-8'))
            except Exception:
                return Response({'error': 'Invalid JSON file'}, status=400)

        if json_override:
            json_override.setdefault('model', 'manual-upload')
            json_override.setdefault('confidence', 1.0)
            json_override.setdefault('source_notes', f'Uploaded: {uploaded.name}')
            checklist = _persist_checklist(change, json_override, request.user)
            return Response(WatsonChecklistSerializer(checklist).data, status=201)

        # IBM Watson generation
        try:
            payload = _build_payload(change)

            # Inject past human corrections as few-shot examples
            domain = payload.get('category', 'generic').lower()
            correction_examples = _build_correction_examples(domain)
            if correction_examples:
                payload['correction_examples'] = correction_examples

            engine = get_watson_engine()
            result = engine.generate_checklist(payload)
        except Exception as e:
            logger.exception(
                f"Checklist generation failed for {change.ticket_number}: {e}"
            )
            return Response({
                'error':  'Watson checklist generation failed.',
                'detail': str(e)[:300],
                'hint':   (
                    'Common causes: token limit (increase WATSON_MAX_TOKENS), '
                    'network timeout, or invalid project ID. '
                    'Check Django logs for the full traceback.'
                ),
            }, status=502)

        checklist = _persist_checklist(change, result, request.user)
        return Response(WatsonChecklistSerializer(checklist).data, status=201)


class ChecklistDetailView(APIView):
    """GET /api/watson/changes/<pk>/checklist/"""

    def get(self, request, pk):
        qs = WatsonChecklist.objects.filter(
            change_id=pk
        ).exclude(
            status=WatsonChecklist.Status.SUPERSEDED
        ).prefetch_related(
            'groups__items__accepted_by', 'groups__task'
        ).order_by('-generated_at')

        if not qs.exists():
            return Response(None)
        return Response(WatsonChecklistSerializer(qs.first()).data)


class ChecklistItemAcceptView(APIView):
    """PATCH /api/watson/items/<pk>/accept/"""

    def patch(self, request, pk):
        try:
            item = ChecklistItem.objects.select_related(
                'group__checklist__change'
            ).get(pk=pk)
        except ChecklistItem.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        change = item.group.checklist.change
        if change.status != 'AUTHORIZE':
            return Response({
                'error': 'Items can only be accepted/rejected during the Authorize phase.'
            }, status=400)

        acceptance = request.data.get('acceptance')
        if acceptance not in ('ACCEPTED', 'REJECTED', 'MODIFIED'):
            return Response({
                'error': 'acceptance must be ACCEPTED, REJECTED, or MODIFIED'
            }, status=400)

        note = request.data.get('note', '')

        item.acceptance      = acceptance
        item.acceptance_note = note
        item.accepted_by     = request.user
        item.accepted_at     = timezone.now()

        # When a human modifies an item, their note becomes the effective
        # technical_criteria for Phase 2 validation.
        # This ensures the human's specific instructions are honoured,
        # not the AI's original criteria.
        if acceptance == 'MODIFIED' and note.strip():
            item.technical_criteria = note.strip()
            logger.info(
                f"Item {item.code} technical_criteria overridden by "
                f"{request.user.username}: {note[:80]}"
            )

        item.save()

        # Promote checklist status
        checklist  = item.group.checklist
        all_items  = ChecklistItem.objects.filter(group__checklist=checklist)
        pending    = all_items.filter(acceptance='PENDING').count()

        if pending == 0:
            checklist.status      = WatsonChecklist.Status.ACCEPTED
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
    Watson reads the activity stream and scores accepted checklist items.
    Called manually by the implementer via the UI "Validate Now" button.
    """

    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.prefetch_related(
                'tasks', 'attachments', 'change_cis__ci', 'activity_logs'
            ).get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        if change.status != 'IMPLEMENT':
            return Response({
                'error': 'Passive scoring only runs during IMPLEMENT phase.'
            }, status=400)

        checklist = WatsonChecklist.objects.filter(
            change=change
        ).exclude(
            status=WatsonChecklist.Status.SUPERSEDED
        ).prefetch_related(
            'groups__items', 'groups__task'
        ).order_by('-generated_at').first()

        if not checklist:
            return Response({'error': 'No active checklist found.'}, status=404)

        # Build items payload — resolve effective criteria per item
        items_payload = []
        for group in checklist.groups.all():
            linked_task_status = group.task.status if group.task else None
            for item in group.items.all():
                # Resolve effective criteria:
                # MODIFIED items use the human's acceptance_note as criteria.
                # This is the core of the human-override feedback loop.
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
                    'linked_task_status': linked_task_status,
                    'caution':            item.caution,
                })

        eligible = [
            i for i in items_payload
            if i['acceptance'] in ('ACCEPTED', 'MODIFIED')
            and i['impl_result'] in ('NOT_RUN', 'CAUTION')
        ]

        if not eligible:
            return Response({
                'scored': 0,
                'message': 'No eligible items to score. All accepted items have already been validated.',
                'checklist': WatsonChecklistSerializer(
                    WatsonChecklist.objects.prefetch_related(
                        'groups__items__accepted_by', 'groups__task'
                    ).get(pk=checklist.pk)
                ).data
            })

        payload = _build_payload(change)

        try:
            engine  = get_watson_engine()
            results = engine.passive_score(payload, items_payload)
        except Exception as e:
            logger.exception(
                f"Passive scoring failed for {change.ticket_number}: {e}"
            )
            return Response({
                'error':  'Watson scoring failed.',
                'detail': str(e)[:300],
                'hint':   (
                    'Common causes: rate limit (add delay between items), '
                    'network timeout, or token limit. '
                    'Check Django logs for full traceback.'
                ),
            }, status=502)

        # Persist results
        updated = []
        for r in results:
            try:
                item = ChecklistItem.objects.get(id=r['item_id'])
                item.impl_result       = r['result']
                item.impl_watson_note  = r['watson_note']
                item.impl_evidence     = json.dumps(
                    r.get('principles_checked', {})
                )[:500]
                item.impl_validated_at = timezone.now()
                item.impl_auto_scored  = r.get('auto_scored', True)
                item.save()
                updated.append(item.id)
            except ChecklistItem.DoesNotExist:
                pass

        if updated:
            ActivityLog.objects.create(
                change      = change,
                user        = request.user,
                action_type = 'WATSON_ACTION',
                message     = (
                    f'Watson scored {len(updated)} checklist item(s) '
                    f'from activity stream.'
                ),
                metadata = {'scored_ids': updated}
            )

        checklist.refresh_from_db()
        return Response({
            'scored': len(updated),
            'eligible': len(eligible),
            'checklist': WatsonChecklistSerializer(
                WatsonChecklist.objects.prefetch_related(
                    'groups__items__accepted_by', 'groups__task'
                ).get(pk=checklist.pk)
            ).data
        })


class ExportChecklistJSON(APIView):
    """GET /api/watson/changes/<pk>/export/"""

    def get(self, request, pk):
        try:
            change    = ChangeRequest.objects.get(pk=pk)
            checklist = WatsonChecklist.objects.filter(
                change=change
            ).exclude(
                status=WatsonChecklist.Status.SUPERSEDED
            ).prefetch_related(
                'groups__items'
            ).latest('generated_at')
        except Exception:
            return Response({'error': 'No checklist found'}, status=404)

        export = {
            'format':        't-rails-checklist-v1',
            'change_number': change.ticket_number,
            'generated_by':  checklist.generated_by,
            'confidence':    checklist.confidence,
            'source_notes':  checklist.source_notes,
            'groups': [
                {
                    'code':       g.code,
                    'title':      g.title,
                    'phase':      g.phase,
                    'group_type': g.group_type,
                    'task_ref':   g.task_id,
                    'items': [
                        {
                            'code':               i.code,
                            'description':        i.description,
                            'rationale':          i.rationale,
                            'command_hint':       i.command_hint,
                            'caution':            i.caution,
                            'technical_criteria': i.technical_criteria,
                            'confidence_flag':    i.confidence_flag,
                            'acceptance':         i.acceptance,
                            'impl_result':        i.impl_result,
                            'impl_watson_note':   i.impl_watson_note,
                        }
                        for i in g.items.all()
                    ]
                }
                for g in checklist.groups.prefetch_related('items').all()
            ]
        }

        from django.http import HttpResponse
        resp = HttpResponse(
            json.dumps(export, indent=2),
            content_type='application/json'
        )
        resp['Content-Disposition'] = (
            f'attachment; filename="t-rails-{change.ticket_number}.json"'
        )
        return resp