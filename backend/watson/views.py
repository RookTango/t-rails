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
    
class GenerateChecklistDeepView(APIView):
    """POST /api/watson/changes/<pk>/generate-deep/
    Generates checklist using Llama 3.3 70B for demo/comparison.
    Does NOT supersede the active checklist — result is display-only.
    """
    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.prefetch_related(
                'tasks', 'attachments', 'change_cis__ci', 'activity_logs'
            ).get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({'error': 'Change not found'}, status=404)

        try:
            payload = _build_payload(change)
            engine  = get_watson_engine()

            if not hasattr(engine, 'generate_checklist_deep'):
                return Response({
                    'error': 'Deep analysis requires IBM Watson engine.',
                    'hint':  'Set WATSON_MODE=ibm in .env'
                }, status=400)

            result = engine.generate_checklist_deep(payload)
            # Return raw result — NOT saved to DB, display only
            return Response(result, status=200)

        except Exception as e:
            logger.exception(f"Deep analysis failed for {change.ticket_number}: {e}")
            return Response({
                'error':  'Deep analysis failed.',
                'detail': str(e)[:200],
            }, status=502)
        

#------- Deep Laama ----
def _apply_jury_logic(standard_items, deep_results: list) -> list:
    """
    Compare Granite and Llama scoring results.
    Returns jury analysis: where models agree, disagree, or partially disagree.
    
    Disagreement rule:
      - Granite PASS + Llama FAIL = CAUTION: Model Disagreement (escalate for review)
      - Granite FAIL + Llama PASS = CAUTION: Model Disagreement (escalate for review)
      - Both PASS = AGREE
      - Both FAIL = AGREE
      - Any CAUTION involved = PARTIAL
    """
    # Build lookup of deep results by item_id
    deep_by_id = {r['item_id']: r for r in deep_results}
    jury = []
 
    for std_item in standard_items:
        item_id    = std_item.get('id')
        deep_result = deep_by_id.get(item_id)
        if not deep_result:
            continue
 
        std_verdict   = std_item.get('impl_result', 'NOT_RUN')
        llama_verdict = deep_result.get('result', 'NOT_RUN')
 
        if std_verdict == llama_verdict:
            agreement = 'AGREE'
        elif 'CAUTION' in (std_verdict, llama_verdict):
            agreement = 'PARTIAL'
        elif {std_verdict, llama_verdict} == {'PASS', 'FAIL'}:
            agreement = 'DISAGREE'
        else:
            agreement = 'PARTIAL'
 
        jury.append({
            'item_id':       item_id,
            'item_code':     std_item.get('code', ''),
            'granite_result': std_verdict,
            'llama_result':   llama_verdict,
            'llama_note':     deep_result.get('watson_note', ''),
            'agreement':      agreement,
            # Flag disagreements for human review
            'needs_review':   agreement == 'DISAGREE',
        })
 
    return jury
 
 
class GenerateChecklistDeepView(APIView):
    """
    POST /api/watson/changes/<pk>/generate-deep/
    
    Generates a deep analysis checklist using Llama 3.3 70B.
    Saved as a separate WatsonChecklist with is_deep_analysis=True.
    Does NOT supersede the active Granite checklist.
    """
    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.prefetch_related(
                'tasks', 'attachments', 'change_cis__ci', 'activity_logs'
            ).get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({"error": "Change not found"}, status=404)
 
        # Supersede any previous deep analysis for this change
        WatsonChecklist.objects.filter(
            change=change,
            is_deep_analysis=True,
        ).exclude(
            status=WatsonChecklist.Status.SUPERSEDED
        ).update(status=WatsonChecklist.Status.SUPERSEDED)
 
        try:
            payload = _build_payload(change)
            engine  = get_watson_engine()
 
            if not hasattr(engine, "generate_checklist_deep"):
                return Response({
                    "error": "Deep analysis requires IBM Watson engine.",
                    "hint":  "Set WATSON_MODE=ibm in .env"
                }, status=400)
 
            result = engine.generate_checklist_deep(payload)
 
        except Exception as e:
            logger.exception(f"Deep analysis failed for {change.ticket_number}: {e}")
            return Response({
                "error":  "Deep analysis generation failed.",
                "detail": str(e)[:200],
            }, status=502)
 
        # Save deep analysis checklist — separate from standard checklist
        checklist = WatsonChecklist.objects.create(
            change           = change,
            status           = WatsonChecklist.Status.DRAFT,
            generated_by     = result.get("model", "meta-llama/llama-3-3-70b-instruct"),
            confidence       = result.get("confidence"),
            source_notes     = result.get("source_notes", ""),
            json_artifact    = result,
            is_deep_analysis = True,
            deep_model       = result.get("model", "meta-llama/llama-3-3-70b-instruct"),
        )
 
        task_map = {t.id: t for t in change.tasks.all()}
        for g_order, gd in enumerate(result.get("groups", [])):
            task_obj = task_map.get(gd.get("task_ref"))
            group = ChecklistGroup.objects.create(
                checklist  = checklist,
                code       = gd["code"],
                title      = gd["title"],
                phase      = gd.get("phase", ""),
                group_type = gd.get("group_type", "PRE"),
                task       = task_obj,
                order      = g_order,
            )
            for i_order, item in enumerate(gd.get("items", [])):
                ChecklistItem.objects.create(
                    group              = group,
                    code               = item["code"],
                    description        = item["description"],
                    rationale          = item.get("rationale", ""),
                    command_hint       = item.get("command_hint", ""),
                    caution            = item.get("caution", ""),
                    technical_criteria = item.get("technical_criteria", ""),
                    confidence_flag    = item.get("confidence_flag", "HIGH"),
                    order              = i_order,
                )
 
        ActivityLog.objects.create(
            change      = change,
            user        = request.user,
            action_type = "WATSON_ACTION",
            message     = (
                f"Deep analysis (Llama 3.3 70B) generated: "
                f"{sum(len(g.get('items',[])) for g in result.get('groups',[]))} items. "
                f"Domain: {result.get('domain','unknown')}."
            ),
            metadata = {"model": result.get("model"), "deep_analysis": True}
        )
 
        return Response(WatsonChecklistSerializer(checklist).data, status=201)
 
 
class ChecklistDeepDetailView(APIView):
    """GET /api/watson/changes/<pk>/checklist-deep/"""
    def get(self, request, pk):
        qs = WatsonChecklist.objects.filter(
            change_id=pk,
            is_deep_analysis=True,
        ).exclude(
            status=WatsonChecklist.Status.SUPERSEDED
        ).prefetch_related(
            "groups__items__accepted_by", "groups__task"
        ).order_by("-generated_at")
 
        if not qs.exists():
            return Response(None)
        return Response(WatsonChecklistSerializer(qs.first()).data)
 
 
class PassiveScoreDeepView(APIView):
    """
    POST /api/watson/changes/<pk>/passive-score-deep/
    
    Runs Llama 3.3 70B Naysayer scoring and compares with Granite results.
    Returns jury analysis showing where models agree or disagree.
    Disagreements are flagged for human review.
    """
    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.prefetch_related(
                "tasks", "attachments", "change_cis__ci", "activity_logs"
            ).get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({"error": "Not found"}, status=404)
 
        if change.status != "IMPLEMENT":
            return Response({
                "error": "Deep scoring only runs during IMPLEMENT phase."
            }, status=400)
 
        # Get the standard (Granite) checklist
        standard_checklist = WatsonChecklist.objects.filter(
            change=change,
            is_deep_analysis=False,
        ).exclude(
            status=WatsonChecklist.Status.SUPERSEDED
        ).order_by("-generated_at").first()
 
        if not standard_checklist:
            return Response({"error": "No standard checklist found. Generate one first."}, status=404)
 
        # Build items payload from standard checklist
        items_payload = []
        std_items_for_jury = []
        for group in standard_checklist.groups.prefetch_related("items").all():
            linked_task_status = group.task.status if group.task else None
            for item in group.items.all():
                from watson.views import _resolve_effective_criteria
                effective_criteria = _resolve_effective_criteria(item)
                item_dict = {
                    "id":                 item.id,
                    "code":               item.code,
                    "description":        item.description,
                    "rationale":          item.rationale,
                    "technical_criteria": effective_criteria,
                    "confidence_flag":    item.confidence_flag,
                    "acceptance":         item.acceptance,
                    "impl_result":        item.impl_result,
                    "linked_task_status": linked_task_status,
                    "caution":            item.caution,
                }
                items_payload.append(item_dict)
                std_items_for_jury.append(item_dict)
 
        eligible = [
            i for i in items_payload
            if i["acceptance"] in ("ACCEPTED", "MODIFIED")
            and i["impl_result"] not in ("NOT_RUN",)  # score even already-scored items for comparison
        ]
 
        if not eligible:
            return Response({
                "jury": [],
                "message": "No accepted items to compare.",
            })
 
        payload = _build_payload(change)
 
        try:
            engine = get_watson_engine()
            if not hasattr(engine, "passive_score_deep"):
                return Response({
                    "error": "Deep scoring requires IBM Watson engine."
                }, status=400)
            deep_results = engine.passive_score_deep(payload, eligible)
        except Exception as e:
            logger.exception(f"Deep scoring failed for {change.ticket_number}: {e}")
            return Response({
                "error":  "Deep scoring failed.",
                "detail": str(e)[:200],
            }, status=502)
 
        # Apply jury logic — compare Granite vs Llama
        jury = _apply_jury_logic(std_items_for_jury, deep_results)
 
        # Count agreements
        agree_count    = sum(1 for j in jury if j["agreement"] == "AGREE")
        disagree_count = sum(1 for j in jury if j["agreement"] == "DISAGREE")
        partial_count  = sum(1 for j in jury if j["agreement"] == "PARTIAL")
 
        # Update standard checklist jury_verdict summary
        if disagree_count > 0:
            verdict = "DISAGREE"
        elif partial_count > 0:
            verdict = "PARTIAL"
        else:
            verdict = "AGREE"
 
        WatsonChecklist.objects.filter(pk=standard_checklist.pk).update(
            jury_verdict=verdict
        )
 
        ActivityLog.objects.create(
            change      = change,
            user        = request.user,
            action_type = "WATSON_ACTION",
            message     = (
                f"Jury analysis complete: {agree_count} agree, "
                f"{disagree_count} disagree, {partial_count} partial."
            ),
            metadata = {
                "agree": agree_count,
                "disagree": disagree_count,
                "partial": partial_count,
                "verdict": verdict,
            }
        )
 
        return Response({
            "jury":          jury,
            "summary": {
                "agree":    agree_count,
                "disagree": disagree_count,
                "partial":  partial_count,
                "verdict":  verdict,
            },
            "needs_human_review": disagree_count > 0,
        })

#----------------- CAB ------------------------
class GenerateCABBriefView(APIView):
    """
    POST /api/watson/changes/<pk>/cab-brief/
 
    Generates a CAB Intelligence Brief for non-technical board members.
    Available during AUTHORIZE phase (when CAB is reviewing).
    Also available in ASSESS for preview.
 
    NOT persisted — generated on demand each time.
    Returns plain markdown text.
    """
 
    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.prefetch_related(
                'tasks', 'attachments', 'change_cis__ci', 'activity_logs'
            ).get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({'error': 'Change not found'}, status=404)
 
        if change.status not in ('ASSESS', 'AUTHORIZE', 'SCHEDULED'):
            return Response({
                'error': f'CAB brief is available during ASSESS and AUTHORIZE phases. Current: {change.status}',
            }, status=400)
 
        # Load existing checklist context — avoid re-deriving what we already know
        checklist_context = {'domain': 'unknown', 'confidence': 0, 'technical_flags': []}
        active_checklist = WatsonChecklist.objects.filter(
            change=change
        ).exclude(
            status=WatsonChecklist.Status.SUPERSEDED
        ).order_by('-generated_at').first()
 
        if active_checklist:
            checklist_context['domain']     = active_checklist.json_artifact.get('domain', 'unknown')
            checklist_context['confidence'] = float(active_checklist.confidence or 0)
 
            # Extract technical flags from checklist items
            # AI-GENERATED and UNSURE items are risk signals for CAB
            from watson.models import ChecklistItem
            flagged_items = ChecklistItem.objects.filter(
                group__checklist=active_checklist,
                confidence_flag__in=('AI-GENERATED', 'UNSURE'),
            ).values_list('description', flat=True)[:5]
 
            checklist_context['technical_flags'] = [
                f"Uncertain: {desc[:80]}" for desc in flagged_items
            ]
 
        # Add requester info to payload
        payload = _build_payload(change)
        payload['requester'] = (
            f"{change.requester.first_name} {change.requester.last_name}".strip()
            if change.requester else 'Not specified'
        )
 
        try:
            engine = get_watson_engine()
 
            if not hasattr(engine, 'generate_cab_brief'):
                return Response({
                    'error': 'CAB brief requires IBM Watson engine.',
                    'hint':  'Set WATSON_MODE=ibm in .env'
                }, status=400)
 
            brief = engine.generate_cab_brief(payload, checklist_context)
 
            # Log the generation
            ActivityLog.objects.create(
                change      = change,
                user        = request.user,
                action_type = 'WATSON_ACTION',
                message     = f'CAB Intelligence Brief generated for {change.ticket_number}.',
                metadata    = {'generated_by': request.user.username}
            )
 
            return Response({
                'brief':      brief,
                'change':     change.ticket_number,
                'status':     change.status,
                'generated_at': timezone.now().isoformat(),
                'has_checklist': active_checklist is not None,
                'domain':     checklist_context['domain'],
            })
 
        except Exception as e:
            logger.exception(f"CAB brief failed for {change.ticket_number}: {e}")
            return Response({
                'error':  'CAB brief generation failed.',
                'detail': str(e)[:200],
            }, status=502)

import json
import logging
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
 
from .models import WatsonChecklist, ChecklistGroup, ChecklistItem, CABChallenge
from .engine.factory import get_watson_engine
from changes.models import ChangeRequest, ActivityLog
 
logger = logging.getLogger(__name__)
 
 
# ── Serialiser helper ──────────────────────────────────────────────────────
 
def _serialise_challenge(c):
    return {
        'id':                   c.id,
        'source_type':          c.source_type,
        'source_ref':           c.source_ref,
        'finding':              c.finding,
        'severity':             c.severity,
        'acceptance_criteria':  c.acceptance_criteria,
        'status':               c.status,
        'justification':        c.justification,
        'resolution_note':      c.resolution_note,
        'resolved_at':          c.resolved_at.isoformat() if c.resolved_at else None,
        'resolved_by':          c.resolved_by.get_full_name() if c.resolved_by else None,
        'resubmit_count':       c.resubmit_count,
        'linked_item_code':     c.linked_item.code if c.linked_item else None,
        'checklist_hint':       '',
    }
 
 
# ── View 1 — Generate interrogation ───────────────────────────────────────
 
class GenerateInterrogationView(APIView):
    """
    POST /api/watson/changes/<pk>/cab-interrogate/
 
    Generates a structured list of CABChallenge objects for a change.
    Supersedes any previous challenges for this change.
    Available during ASSESS, AUTHORIZE, SCHEDULED.
    """
 
    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.prefetch_related(
                'tasks', 'attachments', 'change_cis__ci', 'activity_logs'
            ).get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({'error': 'Change not found'}, status=404)
 
        if change.status not in ('ASSESS', 'AUTHORIZE', 'SCHEDULED'):
            return Response({
                'error': f'CAB interrogation is available during ASSESS, AUTHORIZE, and SCHEDULED phases. Current: {change.status}'
            }, status=400)
 
        # Supersede previous challenges
        CABChallenge.objects.filter(change=change).delete()
 
        # Load existing checklist context
        checklist_context = {'domain': 'unknown', 'confidence': 0, 'technical_flags': []}
        active_checklist = WatsonChecklist.objects.filter(
            change=change,
            is_deep_analysis=False,
        ).exclude(
            status=WatsonChecklist.Status.SUPERSEDED
        ).order_by('-generated_at').first()
 
        if active_checklist:
            checklist_context['domain']     = active_checklist.json_artifact.get('domain', 'unknown')
            checklist_context['confidence'] = float(active_checklist.confidence or 0)
            flagged = ChecklistItem.objects.filter(
                group__checklist=active_checklist,
                confidence_flag__in=('AI-GENERATED', 'UNSURE'),
            ).values_list('description', flat=True)[:5]
            checklist_context['technical_flags'] = [f"Uncertain: {d[:80]}" for d in flagged]
 
        payload = _build_payload(change)
        payload['requester'] = (
            f"{change.requester.first_name} {change.requester.last_name}".strip()
            if change.requester else 'Not specified'
        )
 
        try:
            engine = get_watson_engine()
            if not hasattr(engine, 'generate_cab_interrogation'):
                return Response({
                    'error': 'CAB interrogation requires IBM Watson engine.',
                    'hint':  'Set WATSON_MODE=ibm in .env'
                }, status=400)
 
            result = engine.generate_cab_interrogation(payload, checklist_context)
 
        except Exception as e:
            logger.exception(f"CAB interrogation failed for {change.ticket_number}: {e}")
            return Response({
                'error':  'CAB interrogation generation failed.',
                'detail': str(e)[:200],
            }, status=502)
 
        # Persist challenges
        challenges_data = result.get('challenges', [])
        saved = []
 
        # Build checklist item map for linking
        item_map = {}
        if active_checklist:
            for item in ChecklistItem.objects.filter(
                group__checklist=active_checklist
            ).select_related('group'):
                item_map[item.code] = item
 
        for i, cd in enumerate(challenges_data):
            linked_item = None
            hint = cd.get('checklist_hint', '')
            if hint and hint in item_map:
                linked_item = item_map[hint]
 
            challenge = CABChallenge.objects.create(
                change               = change,
                source_type          = cd.get('source_type', 'GENERAL'),
                source_ref           = cd.get('source_ref', 'General'),
                finding              = cd.get('finding', ''),
                severity             = cd.get('severity', 'MEDIUM'),
                acceptance_criteria  = cd.get('acceptance_criteria', ''),
                order                = i,
                linked_item          = linked_item,
            )
            saved.append(_serialise_challenge(challenge))
 
        ActivityLog.objects.create(
            change      = change,
            user        = request.user,
            action_type = 'WATSON_ACTION',
            message     = f"CAB Interrogation generated: {len(saved)} challenges. Overall risk: {result.get('overall_risk', 'UNKNOWN')}.",
            metadata    = {
                'overall_risk':       result.get('overall_risk'),
                'risk_justification': result.get('risk_justification'),
            }
        )
 
        return Response({
            'overall_risk':       result.get('overall_risk', 'HIGH'),
            'risk_justification': result.get('risk_justification', ''),
            'challenges':         saved,
            'challenge_count':    len(saved),
        }, status=201)
 
 
# ── View 2 — Evaluate a single justification ──────────────────────────────
 
class EvaluateJustificationView(APIView):
    """
    POST /api/watson/cab-challenges/<pk>/evaluate/
 
    Takes a justification text and evaluates it against the challenge's
    acceptance criteria. Updates challenge status to SATISFIED or ESCALATED.
    On SATISFIED, optionally updates the linked ChecklistItem.
    """
 
    def post(self, request, pk):
        try:
            challenge = CABChallenge.objects.select_related(
                'change', 'linked_item', 'linked_item__group'
            ).get(pk=pk)
        except CABChallenge.DoesNotExist:
            return Response({'error': 'Challenge not found'}, status=404)
 
        justification = request.data.get('justification', '').strip()
        if not justification:
            return Response({'error': 'justification is required.'}, status=400)
 
        if len(justification) < 20:
            return Response({
                'error': 'Justification is too brief. Provide specific evidence addressing each acceptance criterion.'
            }, status=400)
 
        try:
            engine = get_watson_engine()
            if not hasattr(engine, 'evaluate_cab_justification'):
                return Response({
                    'error': 'Evaluation requires IBM Watson engine.'
                }, status=400)
 
            result = engine.evaluate_cab_justification(
                finding             = challenge.finding,
                source_ref          = challenge.source_ref,
                acceptance_criteria = challenge.acceptance_criteria,
                justification       = justification,
            )
 
        except Exception as e:
            logger.exception(f"CAB evaluation failed for challenge {pk}: {e}")
            return Response({
                'error':  'Evaluation failed.',
                'detail': str(e)[:200],
            }, status=502)
 
        # Update challenge
        challenge.justification   = justification
        challenge.resolution_note = result.get('verdict', '')
        challenge.resolved_by     = request.user
        challenge.resolved_at     = timezone.now()
        challenge.resubmit_count  += 1
 
        if result.get('result') == 'SATISFIED':
            challenge.status = CABChallenge.Status.SATISFIED
 
            # Update linked checklist item if present
            # The accepted justification becomes stronger technical criteria
            if challenge.linked_item:
                item = challenge.linked_item
                existing = item.technical_criteria or ''
                item.technical_criteria = (
                    f"{existing}\n\nCAB APPROVED CRITERIA: {justification}"
                ).strip()
                item.acceptance_note = f"CAB Challenge satisfied: {result.get('verdict', '')}"
                item.save(update_fields=['technical_criteria', 'acceptance_note'])
 
        else:
            challenge.status = CABChallenge.Status.ESCALATED
 
        challenge.save()
 
        return Response({
            'result':           result.get('result'),
            'verdict':          result.get('verdict', ''),
            'criteria_results': result.get('criteria_results', []),
            'challenge':        _serialise_challenge(challenge),
        })
 
 
# ── View 3 — List challenges for a change ─────────────────────────────────
 
class CABChallengeListView(APIView):
    """GET /api/watson/changes/<pk>/cab-challenges/"""
 
    def get(self, request, pk):
        try:
            change = ChangeRequest.objects.get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
 
        challenges = CABChallenge.objects.filter(
            change=change
        ).select_related('resolved_by', 'linked_item').order_by('order', '-severity')
 
        total      = challenges.count()
        open_count = challenges.filter(status=CABChallenge.Status.OPEN).count()
        justified  = challenges.filter(status=CABChallenge.Status.JUSTIFIED).count()
        satisfied  = challenges.filter(status=CABChallenge.Status.SATISFIED).count()
        escalated  = challenges.filter(status=CABChallenge.Status.ESCALATED).count()
 
        return Response({
            'stats': {
                'total':     total,
                'open':      open_count,
                'justified': justified,
                'satisfied': satisfied,
                'escalated': escalated,
                'resolved':  satisfied + escalated,
            },
            'challenges': [_serialise_challenge(c) for c in challenges],
        })
 
 
# ── View 4 — Generate final brief ─────────────────────────────────────────
 
class GenerateFinalBriefView(APIView):
    """
    POST /api/watson/changes/<pk>/cab-final-brief/
 
    Generates the final printable CAB brief after interrogation is complete.
    Summarises what was challenged, what was accepted, what escalated.
    Available when at least one challenge exists.
    """
 
    def post(self, request, pk):
        try:
            change = ChangeRequest.objects.get(pk=pk)
        except ChangeRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
 
        challenges = CABChallenge.objects.filter(
            change=change
        ).order_by('order')
 
        if not challenges.exists():
            return Response({
                'error': 'No challenges found. Run the CAB interrogation first.'
            }, status=400)
 
        # Build summary for prompt
        lines = []
        for c in challenges:
            status_sym = '✓' if c.status == CABChallenge.Status.SATISFIED else (
                '✗' if c.status == CABChallenge.Status.ESCALATED else '○'
            )
            lines.append(
                f"{status_sym} [{c.source_ref}] {c.severity} — {c.finding}"
            )
            if c.justification:
                lines.append(f"   Presenter: {c.justification[:200]}")
            if c.resolution_note:
                lines.append(f"   Watson: {c.resolution_note[:200]}")
 
        challenges_summary = '\n'.join(lines)
 
        satisfied = challenges.filter(status=CABChallenge.Status.SATISFIED).count()
        escalated = challenges.filter(status=CABChallenge.Status.ESCALATED).count()
        open_ct   = challenges.filter(status=CABChallenge.Status.OPEN).count()
 
        try:
            engine = get_watson_engine()
            if not hasattr(engine, 'generate_cab_final_brief'):
                return Response({'error': 'Requires IBM Watson engine.'}, status=400)
 
            brief = engine.generate_cab_final_brief(
                ticket_number      = change.ticket_number,
                change_type        = change.change_type,
                short_description  = change.short_description,
                change_window      = (
                    f"{change.change_window_start} to {change.change_window_end}"
                    if change.change_window_start else 'Not specified'
                ),
                challenges_summary = challenges_summary,
                timestamp          = timezone.now().strftime('%Y-%m-%d %H:%M UTC'),
            )
 
        except Exception as e:
            logger.exception(f"Final brief failed for {change.ticket_number}: {e}")
            return Response({
                'error':  'Final brief generation failed.',
                'detail': str(e)[:200],
            }, status=502)
 
        # Determine final outcome
        if escalated > 0:
            outcome = 'ESCALATED TO SENIOR CAB'
        elif open_ct > 0:
            outcome = 'INCOMPLETE — OPEN CHALLENGES REMAIN'
        else:
            outcome = 'APPROVED WITH CONDITIONS' if satisfied > 0 else 'APPROVED'
 
        ActivityLog.objects.create(
            change      = change,
            user        = request.user,
            action_type = 'WATSON_ACTION',
            message     = f"CAB Final Brief generated. Outcome: {outcome}. {satisfied} satisfied, {escalated} escalated.",
            metadata    = {'outcome': outcome, 'satisfied': satisfied, 'escalated': escalated}
        )
 
        return Response({
            'brief':   brief,
            'outcome': outcome,
            'stats': {
                'satisfied': satisfied,
                'escalated': escalated,
                'open':      open_ct,
                'total':     challenges.count(),
            },
            'generated_at': timezone.now().isoformat(),
        })
 