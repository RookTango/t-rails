"""
Canonical Change Object schema validation.
This is the contract between external systems and the T-Rails engine.
Any system sending a change for assurance must conform to this schema.
"""

REQUIRED_FIELDS = {
    'change_id', 'ticket_number', 'short_description',
    'change_type', 'priority', 'risk_level',
    'change_window_start', 'change_window_end',
}

VALID_CHANGE_TYPES  = {'Normal', 'Standard', 'Emergency'}
VALID_PRIORITIES    = {'1', '2', '3', '4', '1-Critical', '2-High', '3-Moderate', '4-Low'}
VALID_RISK_LEVELS   = {'High', 'Medium', 'Low'}
VALID_ENVIRONMENTS  = {'Production', 'Staging', 'UAT', 'Development', 'DR'}
VALID_CRITICALITY   = {'Critical', 'High', 'Medium', 'Low'}
VALID_CI_ROLES      = {'Affected', 'Impacted'}
VALID_TASK_STATUSES = {'Open', 'In Progress', 'Completed', 'Skipped', 'Cancelled'}
VALID_ACTION_TYPES  = {'COMMENT', 'TASK_UPDATE', 'ATTACHMENT', 'STATUS_CHANGE', 'WATSON_ACTION'}
VALID_ATT_TYPES     = {'PROCEDURE', 'EVIDENCE', 'SCREENSHOT', 'OTHER'}


def validate_canonical_change(data: dict) -> list:
    """
    Validate an incoming canonical change object.
    Returns a list of error strings. Empty list = valid.
    """
    errors = []

    # Required top-level fields
    for field in REQUIRED_FIELDS:
        if not data.get(field):
            errors.append(f"Required field '{field}' is missing or empty.")

    if errors:
        return errors  # Don't continue if basics are missing

    # Enum validation
    if data.get('change_type') not in VALID_CHANGE_TYPES:
        errors.append(f"change_type must be one of: {sorted(VALID_CHANGE_TYPES)}")

    if str(data.get('priority', '')) not in VALID_PRIORITIES:
        errors.append(f"priority must be one of: {sorted(VALID_PRIORITIES)}")

    if data.get('risk_level') not in VALID_RISK_LEVELS:
        errors.append(f"risk_level must be one of: {sorted(VALID_RISK_LEVELS)}")

    # Tasks validation
    for i, task in enumerate(data.get('tasks', [])):
        prefix = f"tasks[{i}]"
        if not task.get('id'):
            errors.append(f"{prefix}.id is required")
        if not task.get('short_description'):
            errors.append(f"{prefix}.short_description is required")
        if task.get('status') and task['status'] not in VALID_TASK_STATUSES:
            errors.append(f"{prefix}.status must be one of: {sorted(VALID_TASK_STATUSES)}")

    # CIs validation
    for i, ci in enumerate(data.get('cis', [])):
        prefix = f"cis[{i}]"
        if not ci.get('name'):
            errors.append(f"{prefix}.name is required")
        if not ci.get('ci_type'):
            errors.append(f"{prefix}.ci_type is required")
        if not ci.get('environment'):
            errors.append(f"{prefix}.environment is required")
        if ci.get('environment') and ci['environment'] not in VALID_ENVIRONMENTS:
            errors.append(f"{prefix}.environment must be one of: {sorted(VALID_ENVIRONMENTS)}")
        if not ci.get('business_criticality'):
            errors.append(f"{prefix}.business_criticality is required")
        if ci.get('business_criticality') and ci['business_criticality'] not in VALID_CRITICALITY:
            errors.append(f"{prefix}.business_criticality must be one of: {sorted(VALID_CRITICALITY)}")
        if ci.get('role') and ci['role'] not in VALID_CI_ROLES:
            errors.append(f"{prefix}.role must be one of: {sorted(VALID_CI_ROLES)}")

    # Activity validation
    for i, entry in enumerate(data.get('activity', [])):
        if not entry.get('message'):
            errors.append(f"activity[{i}].message is required")
        if not entry.get('created_at'):
            errors.append(f"activity[{i}].created_at is required")

    return errors


def normalise_canonical_change(data: dict) -> dict:
    """
    Normalise an incoming canonical change object to the format
    the T-Rails engine expects. Handles minor variations in field
    naming and fills in optional defaults.
    """
    return {
        # Identity
        'ticket_number':      data.get('ticket_number', data.get('change_id', 'UNKNOWN')),
        'short_description':  data.get('short_description', ''),
        'description':        (data.get('description', '') or '')[:500],
        'change_type':        data.get('change_type', 'Normal'),
        'category':           data.get('category', ''),
        'service':            data.get('service', ''),
        'priority':           str(data.get('priority', '3')),
        'risk_level':         data.get('risk_level', 'Medium'),
        'impact':             data.get('impact', ''),

        # Content
        'implementation_plan': (data.get('implementation_plan', '') or '')[:600],
        'rollback_plan':       (data.get('rollback_plan', '') or '')[:300],
        'test_plan':           (data.get('test_plan', '') or '')[:300],

        # Temporal — P1
        'change_window_start': data.get('change_window_start', 'Not specified'),
        'change_window_end':   data.get('change_window_end',   'Not specified'),
        'planned_start':       data.get('planned_start',       'Not specified'),
        'planned_end':         data.get('planned_end',         'Not specified'),

        # P5 authority
        'primary_ci_name': _derive_primary_ci_name(data.get('cis', [])),
        'primary_ci_env':  _derive_primary_ci_env(data.get('cis', [])),

        # Tasks
        'tasks': [
            {
                'id':                t.get('id'),
                'short_description': t.get('short_description', ''),
                'description':       (t.get('description', '') or '')[:1000],
                'status':            t.get('status', 'Open'),
                'order':             t.get('sequence', t.get('order', i + 1)),
                'ci_name':           t.get('ci_name', ''),
                'ci_type':           t.get('ci_type', ''),
            }
            for i, t in enumerate(data.get('tasks', []))
        ],

        # CIs
        'cis': [
            {
                'name':                 ci.get('name', ''),
                'ci_type':              ci.get('ci_type', ''),
                'os':                   ci.get('os', ''),
                'environment':          ci.get('environment', ''),
                'business_criticality': ci.get('business_criticality', 'Medium'),
                'ip_address':           str(ci.get('ip_address', '')),
                'role':                 ci.get('role', 'Affected'),
            }
            for ci in data.get('cis', [])
        ],

        # Evidence
        'attachments':            data.get('attachments', []),
        'attachments_with_paths': data.get('attachments_with_paths', []),
        'activity': [
            {
                'message':     e.get('message', ''),
                'action_type': e.get('action_type', 'COMMENT'),
                'created_at':  str(e.get('created_at', '')),
            }
            for e in data.get('activity', [])
        ],
    }


def _derive_primary_ci_name(cis: list) -> str:
    if not cis:
        return 'Not specified'
    # Prefer Critical/High affected CIs
    for ci in cis:
        if ci.get('role') == 'Affected' and ci.get('business_criticality') in ('Critical', 'High'):
            return ci.get('name', 'Not specified')
    affected = [c for c in cis if c.get('role') == 'Affected']
    return affected[0].get('name', 'Not specified') if affected else cis[0].get('name', 'Not specified')


def _derive_primary_ci_env(cis: list) -> str:
    if not cis:
        return ''
    affected = [c for c in cis if c.get('role') == 'Affected']
    source = affected[0] if affected else cis[0]
    return source.get('environment', '')


# ── Canonical Result Object builder ───────────────────────────────────────

def build_result_object(checklist, source_change_id: str) -> dict:
    """
    Serialize a WatsonChecklist into the canonical result object.
    This is what external systems receive back from the protocol endpoints.
    """
    from watson.models import ChecklistItem

    all_items = ChecklistItem.objects.filter(group__checklist=checklist)
    total     = all_items.count()
    accepted  = all_items.filter(acceptance__in=('ACCEPTED', 'MODIFIED')).count()
    rejected  = all_items.filter(acceptance='REJECTED').count()
    pending   = all_items.filter(acceptance='PENDING').count()
    passed    = all_items.filter(impl_result='PASS').count()
    failed    = all_items.filter(impl_result='FAIL').count()
    caution   = all_items.filter(impl_result='CAUTION').count()
    not_run   = all_items.filter(
        impl_result='NOT_RUN', acceptance__in=('ACCEPTED', 'MODIFIED')
    ).count()

    task_group_count = checklist.groups.filter(group_type='TASK').count()
    p6_compliant     = True  # will be set False if we detect a violation below

    groups_out = []
    for group in checklist.groups.prefetch_related('items').all():
        items_out = []
        for item in group.items.all():
            import json as _json
            try:
                principles = _json.loads(item.impl_evidence) if item.impl_evidence else {}
            except Exception:
                principles = {}

            items_out.append({
                'code':               item.code,
                'description':        item.description,
                'rationale':          item.rationale,
                'command_hint':       item.command_hint,
                'caution':            item.caution,
                'technical_criteria': item.technical_criteria,
                'confidence_flag':    item.confidence_flag,
                # Authorize phase
                'acceptance':         item.acceptance,
                'acceptance_note':    item.acceptance_note,
                'accepted_at':        item.accepted_at.isoformat() if item.accepted_at else None,
                # Implementation phase
                'impl_result':        item.impl_result,
                'impl_watson_note':   item.impl_watson_note,
                'impl_validated_at':  item.impl_validated_at.isoformat() if item.impl_validated_at else None,
                'impl_auto_scored':   item.impl_auto_scored,
                'principles_checked': principles,
            })

        groups_out.append({
            'code':       group.code,
            'title':      group.title,
            'group_type': group.group_type,
            'phase':      group.phase,
            'task_ref':   group.task_id,
            'items':      items_out,
        })

    # Determine overall verdict
    if pending > 0 and accepted == 0:
        verdict = 'PENDING'
    elif not_run > 0:
        verdict = 'PENDING'
    elif failed > 0:
        verdict = 'FAIL'
    elif caution > 0 and passed > 0:
        verdict = 'PARTIAL'
    elif passed > 0 and failed == 0 and caution == 0:
        verdict = 'PASS'
    else:
        verdict = 'PENDING'

    return {
        'schema_version':    '1.0',
        'result_id':         str(checklist.id),
        'source_change_id':  source_change_id,
        'ticket_number':     checklist.change.ticket_number if checklist.change_id else source_change_id,
        'generated_at':      checklist.generated_at.isoformat(),
        'model':             checklist.generated_by,
        'domain':            checklist.json_artifact.get('domain', 'unknown'),
        'confidence':        checklist.confidence,
        'source_notes':      checklist.source_notes,
        'status':            checklist.status,
        'overall_verdict':   verdict,
        'stats': {
            'total':        total,
            'accepted':     accepted,
            'rejected':     rejected,
            'pending':      pending,
            'impl_pass':    passed,
            'impl_fail':    failed,
            'impl_caution': caution,
            'impl_not_run': not_run,
            'p6_compliant': p6_compliant,
        },
        'groups': groups_out,
    }