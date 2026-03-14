"""
Mock Watson engine.
Key behaviours:
  - generate_checklist: produces PRE / per-TASK / POST groups from change context
  - passive_score:      reads the change activity stream and auto-scores accepted items
                        without the implementer doing anything explicit
"""
import re, time
from .base import WatsonEngineBase

# ── Domain detection ───────────────────────────────────────────────────────
DOMAIN_PATTERNS = [
    (r'patch|patching|update.*os|suse|rhel|ubuntu|linux kernel', 'os_patching'),
    (r'postgres|mysql|oracle|mongodb|database.*migrat|db.*upgrade',  'database'),
    (r'network|switch|router|vlan|firewall|bgp|ospf',               'network'),
    (r'deploy|release|rollout|kubernetes|docker|helm|container',    'application_deploy'),
    (r'certificate|cert|ssl|tls|expir',                             'certificate'),
    (r'storage|san|nas|volume|lun|snapshot',                        'storage'),
    (r'vmware|esxi|vcenter|vmotion',                                'virtualisation'),
]

# ── Pre and Post check templates (always generated) ────────────────────────
GLOBAL_PRE = [
    {'code': 'PRE.a', 'description': 'Confirm maintenance window is active and stakeholders are aware',
     'rationale': 'No change should begin outside its approved window.',
     'command_hint': '', 'caution': ''},
    {'code': 'PRE.b', 'description': 'Verify backup / snapshot of all affected systems taken and confirmed restorable',
     'rationale': 'Recovery point must exist before any changes are made.',
     'command_hint': '', 'caution': 'Test the restore on a non-production system if possible.'},
    {'code': 'PRE.c', 'description': 'Confirm all required access credentials are available to the implementer',
     'rationale': 'Access issues during windows extend outage duration.',
     'command_hint': '', 'caution': ''},
]

GLOBAL_POST = [
    {'code': 'POST.a', 'description': 'All affected services confirmed operational end-to-end',
     'rationale': 'Final validation gate before closing the change.',
     'command_hint': '', 'caution': ''},
    {'code': 'POST.b', 'description': 'Monitoring confirms no new alerts triggered by this change',
     'rationale': 'Silent failures are caught by monitoring, not by the implementer.',
     'command_hint': '', 'caution': ''},
    {'code': 'POST.c', 'description': 'Change notes updated with actual steps taken and any deviations from plan',
     'rationale': 'Audit and post-incident review require accurate records.',
     'command_hint': '', 'caution': ''},
]

# ── Per-task item templates keyed by domain ────────────────────────────────
TASK_ITEMS_BY_DOMAIN = {
    'os_patching': [
        {'code': '{T}.a', 'description': 'Verify current patch level: {task_name}',
         'command_hint': 'zypper patch-check  # or: yum check-update / apt list --upgradable',
         'rationale': 'Establishes baseline before patching.',
         'caution': ''},
        {'code': '{T}.b', 'description': 'Check disk space on target (≥ 20% free on / and /var)',
         'command_hint': 'df -h / /var /var/log',
         'rationale': 'Insufficient space is the #1 cause of failed patch runs.',
         'caution': ''},
        {'code': '{T}.c', 'description': 'Apply patches and capture output log: {task_name}',
         'command_hint': 'zypper patch 2>&1 | tee /tmp/patch-$(date +%Y%m%d).log',
         'rationale': 'Log is required evidence for change closure.',
         'caution': 'If kernel patch detected, a reboot will be required — notify before rebooting.'},
        {'code': '{T}.d', 'description': 'Post-patch: validate all services running, check for new errors',
         'command_hint': 'systemctl --failed; journalctl -b 0 -p err --since "30 min ago"',
         'rationale': 'Services may fail to restart after library or kernel updates.',
         'caution': ''},
    ],
    'database': [
        {'code': '{T}.a', 'description': 'Confirm zero active transactions before migration: {task_name}',
         'command_hint': "SELECT count(*) FROM pg_stat_activity WHERE state='active';",
         'rationale': 'Active transactions during migration cause data inconsistency.',
         'caution': 'Drain application connections before proceeding.'},
        {'code': '{T}.b', 'description': 'Capture pre-migration row counts for all affected tables',
         'rationale': 'Baseline for post-migration data integrity check.',
         'command_hint': '', 'caution': ''},
        {'code': '{T}.c', 'description': 'Execute migration in transaction, verify output: {task_name}',
         'rationale': 'Transactional DDL ensures atomic rollback on failure.',
         'command_hint': '', 'caution': 'REINDEX on large tables causes lock contention — schedule if needed.'},
        {'code': '{T}.d', 'description': 'Post-migration: validate row counts match baseline, run smoke tests',
         'rationale': 'Detects silent data loss or duplication.',
         'command_hint': '', 'caution': ''},
    ],
    'network': [
        {'code': '{T}.a', 'description': 'Confirm out-of-band access available before starting: {task_name}',
         'command_hint': 'Verify console / OOBM connectivity',
         'rationale': 'In-band access may be lost during routing changes.',
         'caution': 'Never start without a confirmed OOB path.'},
        {'code': '{T}.b', 'description': 'Back up current running config',
         'command_hint': 'show running-config | save to change record',
         'rationale': 'Config backup is the rollback mechanism.',
         'caution': ''},
        {'code': '{T}.c', 'description': 'Apply changes incrementally, test connectivity after each step',
         'rationale': 'Incremental testing isolates each change element.',
         'command_hint': '', 'caution': 'Do not save running-config until full validation is complete.'},
    ],
    'application_deploy': [
        {'code': '{T}.a', 'description': 'Verify deployment artifact version and checksum: {task_name}',
         'rationale': 'Prevents deploying wrong or corrupted build.',
         'command_hint': '', 'caution': ''},
        {'code': '{T}.b', 'description': 'Deploy to canary/first node, observe for 5 minutes before proceeding',
         'rationale': 'Limits blast radius of a bad deployment.',
         'command_hint': '', 'caution': 'Watch error rate and p95 latency before rolling out further.'},
        {'code': '{T}.c', 'description': 'Complete rollout and run automated smoke tests: {task_name}',
         'rationale': 'Smoke tests confirm deployment objective is met.',
         'command_hint': '', 'caution': ''},
    ],
    'generic': [
        {'code': '{T}.a', 'description': 'Execute: {task_name}',
         'rationale': 'Derived from task record.',
         'command_hint': '', 'caution': ''},
        {'code': '{T}.b', 'description': 'Verify outcome matches expected result for: {task_name}',
         'rationale': 'Functional verification closes the loop on each task.',
         'command_hint': '', 'caution': ''},
    ],
}

# ── Passive scoring: keywords Watson looks for in activity / notes ─────────
SCORING_SIGNALS = [
    # (keywords_in_description, keywords_in_evidence, result)
    (['backup', 'snapshot'],     ['backup', 'snapshot', 'done', 'complete', 'confirmed'],   'PASS'),
    (['patch', 'apply', 'zypper'], ['applied', 'patch', 'zypper', 'complete', 'success'],   'PASS'),
    (['verify', 'validate', 'confirm'], ['confirmed', 'verified', 'ok', 'pass', 'healthy'], 'PASS'),
    (['service', 'running'],     ['running', 'active', 'started', 'healthy'],               'PASS'),
    (['disk', 'space'],          ['df', 'free', 'available', '%'],                          'PASS'),
    (['row count', 'migration'], ['rows', 'count', 'matches', 'verified'],                  'PASS'),
    (['error', 'log'],           ['no error', 'clean', '0 errors', 'no issues'],            'PASS'),
]


class MockWatsonEngine(WatsonEngineBase):

    def _detect_domain(self, text):
        t = text.lower()
        for pattern, domain in DOMAIN_PATTERNS:
            if re.search(pattern, t):
                return domain
        return 'generic'

    def _context_text(self, change_data):
        parts = [
            change_data.get('short_description', ''),
            change_data.get('description', ''),
            change_data.get('category', ''),
            change_data.get('implementation_plan', ''),
        ]
        for t in change_data.get('tasks', []):
            parts += [t.get('short_description', ''), t.get('description', '')]
        for ci in change_data.get('cis', []):
            parts += [ci.get('ci_type', ''), ci.get('os', '')]
        return ' '.join(filter(None, parts))

    def generate_checklist(self, change_data):
        time.sleep(0.4)
        context = self._context_text(change_data)
        domain  = self._detect_domain(context)
        tasks   = change_data.get('tasks', [])
        task_items_tmpl = TASK_ITEMS_BY_DOMAIN.get(domain, TASK_ITEMS_BY_DOMAIN['generic'])

        groups = []

        # ── Global PRE group ──
        groups.append({
            'code': 'PRE', 'title': 'Pre-Implementation Checks',
            'phase': 'PRE-IMPLEMENTATION', 'group_type': 'PRE',
            'task_ref': None,
            'items': list(GLOBAL_PRE),
        })

        # ── One group per task ──
        for idx, task in enumerate(tasks):
            t_code = f'T{idx + 1}'
            t_name = task.get('short_description', f'Task {idx + 1}')
            items  = []
            for tmpl in task_items_tmpl:
                item = dict(tmpl)
                item['code']        = tmpl['code'].replace('{T}', t_code)
                item['description'] = tmpl['description'].replace('{task_name}', t_name)
                items.append(item)
            groups.append({
                'code': t_code, 'title': t_name,
                'phase': 'IMPLEMENTATION', 'group_type': 'TASK',
                'task_ref': task.get('id'),   # links back to ChangeTask.id
                'items': items,
            })

        # If no tasks, produce a generic IMPLEMENTATION group
        if not tasks:
            items = []
            for tmpl in task_items_tmpl:
                item = dict(tmpl)
                item['code']        = tmpl['code'].replace('{T}', 'CK')
                item['description'] = tmpl['description'].replace('{task_name}', change_data.get('short_description',''))
                items.append(item)
            groups.append({
                'code': 'CK', 'title': 'Implementation Steps',
                'phase': 'IMPLEMENTATION', 'group_type': 'TASK',
                'task_ref': None, 'items': items,
            })

        # ── Global POST group ──
        groups.append({
            'code': 'POST', 'title': 'Post-Implementation Checks',
            'phase': 'POST-IMPLEMENTATION', 'group_type': 'POST',
            'task_ref': None, 'items': list(GLOBAL_POST),
        })

        source_notes = (
            f"Domain: {domain} | Tasks analysed: {len(tasks)} | "
            f"CIs in scope: {len(change_data.get('cis', []))} | "
            f"Context: {context[:150]}"
        )
        return {
            'domain': domain, 'groups': groups,
            'model': 'watson-mock-v1',
            'confidence': 0.88 if domain != 'generic' else 0.72,
            'source_notes': source_notes,
        }

    def passive_score(self, change_data, checklist_items):
        """
        Watson reads the change activity stream (comments, work notes, task notes,
        attachment filenames) and auto-scores accepted checklist items.
        No implementer action required — this runs in the background.
        Returns list of {item_id, result, watson_note, evidence_used}
        """
        time.sleep(0.3)

        # Build evidence corpus from all activity
        evidence_corpus = []
        for entry in change_data.get('activity', []):
            evidence_corpus.append(entry.get('message', '').lower())
        for task in change_data.get('tasks', []):
            evidence_corpus.append(task.get('description', '').lower())
            evidence_corpus.append(task.get('short_description', '').lower())
            if task.get('status') in ['Completed', 'Skipped']:
                evidence_corpus.append(f"task completed {task.get('short_description','')}")
        for att in change_data.get('attachments', []):
            evidence_corpus.append(att.get('filename', '').lower())

        combined_evidence = ' '.join(evidence_corpus)
        results = []

        for item in checklist_items:
            if item.get('acceptance') not in ('ACCEPTED', 'MODIFIED'):
                continue
            if item.get('impl_result') not in ('NOT_RUN', 'CAUTION'):
                continue

            desc = item.get('description', '').lower()
            scored = False

            # Check if linked task is completed — strong signal
            linked_task_status = item.get('linked_task_status')
            if linked_task_status in ('Completed',):
                results.append({
                    'item_id':      item['id'],
                    'result':       'PASS',
                    'watson_note':  f'Linked task marked Completed — Watson inferred this step was executed.',
                    'evidence_used': f'Task status: {linked_task_status}',
                    'auto_scored':  True,
                })
                scored = True

            if not scored:
                for desc_kws, ev_kws, result in SCORING_SIGNALS:
                    if any(kw in desc for kw in desc_kws):
                        if any(kw in combined_evidence for kw in ev_kws):
                            results.append({
                                'item_id':      item['id'],
                                'result':       result,
                                'watson_note':  f'Evidence found in activity stream matching "{", ".join(ev_kws[:2])}".',
                                'evidence_used': combined_evidence[:200],
                                'auto_scored':  True,
                            })
                            scored = True
                            break

            if not scored:
                # Enough general activity = CAUTION (not enough to confirm, not nothing)
                if len(combined_evidence) > 100:
                    results.append({
                        'item_id':      item['id'],
                        'result':       'CAUTION',
                        'watson_note':  'Activity detected but Watson could not confirm this specific step. Manual verification recommended.',
                        'evidence_used': combined_evidence[:100],
                        'auto_scored':  True,
                    })

        return results

    # Legacy compat
    def generate_authorize_checklist(self, change_data):
        return self.generate_checklist(change_data)
    def evaluate_implementation(self, *args):
        return {'results': [], 'model': 'watson-mock-v1', 'confidence': 0.0}
