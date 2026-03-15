"""
seed_change.py
Creates a single realistic change request ready for the full Watson pipeline.

Change window: 15 minutes from now, 30 minutes duration.
Run: python seed_change.py

After running:
  1. Log in as req / password123
  2. Move change to ASSESS
  3. Move change to AUTHORIZE — Watson auto-generates checklist
  4. Accept all checklist items as CAB manager
  5. Move to SCHEDULED → IMPLEMENT
  6. Add implementer comments (provided separately)
  7. Run passive score
"""

import os
import django
import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.utils import timezone
from accounts.models import User
from changes.models import ChangeRequest, ChangeTask, ChangeCI
from cmdb.models import ConfigurationItem

# ── Resolve users ──────────────────────────────────────────────────────────
try:
    requester   = User.objects.get(username='req')
    implementer = User.objects.get(username='imp')
    cab_manager = User.objects.get(username='cab')
except User.DoesNotExist as e:
    print(f"ERROR: Required user not found — {e}")
    print("Run seed_data.py first to create users.")
    raise SystemExit(1)

# ── Resolve CIs ────────────────────────────────────────────────────────────
try:
    app_server = ConfigurationItem.objects.get(name='vm-app-prod-01')
    db_server  = ConfigurationItem.objects.get(name='vm-db-prod-01')
    pg_db      = ConfigurationItem.objects.get(name='postgresql-prod')
except ConfigurationItem.DoesNotExist as e:
    print(f"ERROR: Required CI not found — {e}")
    print("Run seed_data.py first to create CMDB entries.")
    raise SystemExit(1)

# ── Change window: 15 min from now, 30 min duration ───────────────────────
now          = timezone.now()
window_start = now + datetime.timedelta(minutes=15)
window_end   = window_start + datetime.timedelta(minutes=30)

print(f"Current time     : {now.strftime('%Y-%m-%d %H:%M:%S %Z')}")
print(f"Change window    : {window_start.strftime('%Y-%m-%d %H:%M:%S %Z')} → {window_end.strftime('%Y-%m-%d %H:%M:%S %Z')}")
print()

# ── Create the change ──────────────────────────────────────────────────────
change = ChangeRequest.objects.create(
    short_description = 'RHEL OS Patching — vm-app-prod-01 (Security Patch Cycle Q1-2026)',
    description       = (
        'Apply critical security patches to vm-app-prod-01 (Ubuntu 22.04) as part of the '
        'Q1-2026 mandatory patch cycle. This includes kernel updates addressing CVE-2026-1234 '
        '(privilege escalation) and CVE-2026-5678 (remote code execution). '
        'A service restart and post-patch validation are required. '
        'The application running on this server is crm-application. '
        'Rollback is via snapshot taken immediately before patching.'
    ),
    change_type       = 'Normal',
    priority          = '2',
    risk_level        = 'High',
    impact            = '1 - High',
    status            = 'NEW',
    requester         = requester,
    assigned_to       = implementer,
    assignment_group  = 'Infrastructure',
    category          = 'OS Patching',
    service           = 'CRM Platform',
    service_offering  = 'Application Server',
    justification     = (
        'CVE-2026-1234 and CVE-2026-5678 are rated CVSS 9.8 and 9.1 respectively. '
        'Security team has mandated patching within 72 hours of advisory publication.'
    ),
    implementation_plan = (
        '1. Take VM snapshot of vm-app-prod-01 via vCenter.\n'
        '2. Verify current kernel version: uname -r.\n'
        '3. Check available disk space: df -h /var /boot.\n'
        '4. Run patch check: apt list --upgradable 2>/dev/null | grep -i security.\n'
        '5. Apply patches: apt-get update && apt-get upgrade -y 2>&1 | tee /tmp/patch-$(date +%Y%m%d).log.\n'
        '6. Verify new kernel version: uname -r.\n'
        '7. Restart crm-application service: systemctl restart crm-application.\n'
        '8. Verify service status: systemctl status crm-application.\n'
        '9. Run health check: curl -s http://localhost:8080/health.'
    ),
    rollback_plan = (
        'Revert vm-app-prod-01 to pre-patch snapshot via vCenter. '
        'Estimated recovery time: 10 minutes. '
        'Snapshot name: vm-app-prod-01-prepatch-YYYYMMDD.'
    ),
    test_plan = (
        '1. Verify kernel version is higher than pre-patch baseline.\n'
        '2. Confirm crm-application service is active (running).\n'
        '3. Health check endpoint returns HTTP 200.\n'
        '4. Check /var/log/syslog for any CRITICAL or ERROR entries post-restart.\n'
        '5. Confirm no CVE packages remain: apt list --upgradable 2>/dev/null.'
    ),
    change_window_start = window_start,
    change_window_end   = window_end,
    planned_start       = window_start,
    planned_end         = window_end,
    ci_impact_depth     = 'full',
)

print(f"Created change: {change.ticket_number}")
print(f"  Short desc : {change.short_description}")
print(f"  Status     : {change.status}")
print()

# ── Create tasks ───────────────────────────────────────────────────────────
t1 = ChangeTask.objects.create(
    change            = change,
    short_description = 'Pre-Patch Verification and Snapshot',
    description       = (
        '1. Verify VM snapshot exists or take one now via vCenter: '
        'snapshot name must be vm-app-prod-01-prepatch-YYYYMMDD.\n'
        '2. Check current kernel version: uname -r (record baseline).\n'
        '3. Check disk space on /var and /boot: df -h /var /boot '
        '(must have at least 2GB free on each).\n'
        '4. List pending security patches: '
        'apt list --upgradable 2>/dev/null | grep -i security.\n'
        '5. Confirm crm-application service is currently RUNNING: '
        'systemctl status crm-application.'
    ),
    order = 1,
)

t2 = ChangeTask.objects.create(
    change            = change,
    short_description = 'Apply Security Patches and Verify Kernel',
    description       = (
        '1. Update package index: apt-get update.\n'
        '2. Apply all security patches and capture full output log: '
        'apt-get upgrade -y 2>&1 | tee /tmp/patch-$(date +%Y%m%d).log.\n'
        '3. Verify log contains no errors: grep -i "error\\|failed\\|abort" '
        '/tmp/patch-$(date +%Y%m%d).log — must return empty.\n'
        '4. Verify new kernel version is higher than baseline: uname -r.\n'
        '5. Confirm CVE packages are no longer present: '
        'apt list --upgradable 2>/dev/null | grep -i security — must return empty.'
    ),
    order = 2,
)

t3 = ChangeTask.objects.create(
    change            = change,
    short_description = 'Service Restart and Post-Patch Validation',
    description       = (
        '1. Restart crm-application service: systemctl restart crm-application.\n'
        '2. Verify service is active and running: systemctl status crm-application '
        '— output must contain "active (running)".\n'
        '3. Check application logs for CRITICAL or ERROR entries since restart: '
        'journalctl -u crm-application --since "5 min ago" | grep -i "critical\\|error\\|severe"'
        ' — must return empty.\n'
        '4. Run health check: curl -s -o /dev/null -w "%{http_code}" '
        'http://localhost:8080/health — must return 200.\n'
        '5. Confirm no remaining CVEs: apt list --upgradable 2>/dev/null.'
    ),
    order = 3,
)

print(f"Created tasks:")
print(f"  {t1.task_number}: {t1.short_description}")
print(f"  {t2.task_number}: {t2.short_description}")
print(f"  {t3.task_number}: {t3.short_description}")
print()

# ── Link CIs to change ─────────────────────────────────────────────────────
ChangeCI.objects.create(change=change, ci=app_server, role='Affected')
print(f"Linked CI (Affected): {app_server.name} ({app_server.ci_type}) — {app_server.environment}")
print(f"  business_criticality: {app_server.business_criticality}")
print(f"  P5 authority check will be required (Production + High criticality)")
print()

# ── Link CIs to tasks ──────────────────────────────────────────────────────
from changes.models import TaskCI
TaskCI.objects.create(task=t1, ci=app_server)
TaskCI.objects.create(task=t2, ci=app_server)
TaskCI.objects.create(task=t3, ci=app_server)
print(f"Linked {app_server.name} to all 3 tasks")
print()

# ── Summary ────────────────────────────────────────────────────────────────
print("=" * 60)
print("SEED COMPLETE")
print("=" * 60)
print(f"Change number : {change.ticket_number}")
print(f"Change PK     : {change.id}")
print(f"Status        : {change.status} (NEW)")
print(f"Change window : {window_start.strftime('%Y-%m-%d %H:%M:%S %Z')}")
print(f"              → {window_end.strftime('%Y-%m-%d %H:%M:%S %Z')}")
print()
print("NEXT STEPS:")
print(f"  1. Log in as req / password123")
print(f"  2. Open change {change.ticket_number}")
print(f"  3. Move to ASSESS")
print(f"  4. Move to AUTHORIZE — Watson will auto-generate checklist")
print(f"  5. Accept all items as cab / password123")
print(f"  6. Move to SCHEDULED → IMPLEMENT")
print(f"  7. Wait until change window opens ({window_start.strftime('%H:%M %Z')})")
print(f"  8. Add implementer comments — will be provided separately")
print(f"  9. Run passive score")
print()
print("LOGIN CREDENTIALS:")
print("  req / password123       (REQUESTER — create and submit change)")
print("  imp / password123       (IMPLEMENTER — add activity comments)")
print("  cab / password123       (CAB_MANAGER — accept checklist items)")