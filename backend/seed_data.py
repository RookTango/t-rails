"""Run: python seed_data.py"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from accounts.models import User
from changes.models import ChangeRequest, ChangeTask
from cmdb.models import ConfigurationItem, CIRelationship
from rest_framework.authtoken.models import Token

# ── Users ──────────────────────────────────────────────────────────────────
users = [
    {'username': 'admin', 'email': 'admin@cms.com', 'first_name': 'Admin', 'last_name': 'User', 'role': 'ADMIN', 'department': 'IT'},
    {'username': 'req', 'email': 'req@cms.com', 'first_name': 'req', 'last_name': '1', 'role': 'REQUESTER', 'department': 'Engineering'},
    {'username': 'req1', 'email': 'req1@cms.com', 'first_name': 'req1', 'last_name': '2', 'role': 'REQUESTER', 'department': 'Engineering'},
    {'username': 'imp', 'email': 'imp@cms.com', 'first_name': 'imp', 'last_name': '1', 'role': 'IMPLEMENTER', 'department': 'DevOps'},
    {'username': 'imp2', 'email': 'imp@cms.com', 'first_name': 'imp', 'last_name': '2', 'role': 'IMPLEMENTER', 'department': 'DevOps'},
    {'username': 'cab', 'email': 'cab@cms.com', 'first_name': 'cab', 'last_name': '1', 'role': 'CAB_MANAGER', 'department': 'Change Management'},
    {'username': 'cab1', 'email': 'cab@cms.com', 'first_name': 'cab', 'last_name': '2', 'role': 'CAB_MANAGER', 'department': 'Change Management'},
    {'username': 'cabsec', 'email': 'cabsec@cms.com', 'first_name': 'cabsec', 'last_name': '1', 'role': 'CAB_MEMBER', 'department': 'Security'},
]

for u in users:
    user, created = User.objects.get_or_create(username=u['username'], defaults=u)
    if created:
        user.set_password('password123')
        user.save()
        Token.objects.get_or_create(user=user)
        print(f'Created user: {user.username} / password123')
    else:
        print(f'User already exists: {user.username}')

# ── Sample Changes ─────────────────────────────────────────────────────────
requester   = User.objects.get(username='req')
implementer = User.objects.get(username='imp')

if not ChangeRequest.objects.exists():
    change1 = ChangeRequest.objects.create(
        short_description='Upgrade PostgreSQL from 14 to 16 on Production DB cluster',
        description='Major version upgrade of the primary PostgreSQL database. Includes schema migration, performance tuning, and validation.',
        change_type='Normal', priority='2', risk_level='High',
        impact='1 - High', status='ASSESS',
        requester=requester, assigned_to=implementer,
        assignment_group='DBA Team', category='Database',
        service='Core DB', service_offering='PostgreSQL',
        justification='PostgreSQL 14 reaches end-of-life. Version 16 brings performance and security improvements.',
        implementation_plan='1. Snapshot VM\n2. Install PG16 packages\n3. Run pg_upgrade\n4. Validate connections\n5. Update app configs',
        rollback_plan='Restore from VM snapshot taken before upgrade. ETA 30 mins.',
        test_plan='Run application smoke tests and verify all service connections are healthy.',
        ci_impact_depth='full',
    )
    ChangeTask.objects.create(change=change1, short_description='Pre-upgrade backup and snapshot',     description='Take full backup and VM snapshot before any changes.', order=1)
    ChangeTask.objects.create(change=change1, short_description='Upgrade PostgreSQL binaries',         description='Install PG16 packages and run pg_upgrade with --check flag first.', order=2)
    ChangeTask.objects.create(change=change1, short_description='Run schema migration scripts',        description='Execute pending migration scripts and validate row counts.', order=3)
    ChangeTask.objects.create(change=change1, short_description='Post-upgrade validation',             description='Run smoke tests and verify all connections are healthy.', order=4)
    print(f'Created change: {change1.ticket_number}')

    change2 = ChangeRequest.objects.create(
        short_description='Deploy new payment service v2.1 to production',
        description='Rolling deployment of payment-service v2.1 which includes PCI-DSS compliance fixes and performance improvements.',
        change_type='Normal', priority='1', risk_level='High',
        impact='1 - High', status='NEW',
        requester=requester, assigned_to=implementer,
        assignment_group='Engineering', category='Software',
        service='Payments', service_offering='Payment Processing',
        justification='v2.1 contains critical PCI-DSS compliance patch required before Q2 audit.',
        implementation_plan='1. Deploy to staging\n2. Run regression suite\n3. Blue-green deploy to prod\n4. Monitor for 30 mins',
        rollback_plan='Repoint load balancer back to v2.0 containers. ETA 5 mins.',
        test_plan='Automated regression suite + manual payment flow validation.',
        ci_impact_depth='2',
    )
    ChangeTask.objects.create(change=change2, short_description='Deploy to staging and run regression',  description='Full regression suite must pass before prod deploy.', order=1)
    ChangeTask.objects.create(change=change2, short_description='Production blue-green deployment',       description='Switch load balancer to new containers after health checks pass.', order=2)
    ChangeTask.objects.create(change=change2, short_description='Post-deploy monitoring',                 description='Monitor error rates, latency, and payment success rate for 30 mins.', order=3)
    print(f'Created change: {change2.ticket_number}')

    change3 = ChangeRequest.objects.create(
        short_description='Replace core-switch-01 with Cisco Catalyst 9500',
        description='Hardware replacement of the core network switch. Includes cable migration and VLAN reconfiguration.',
        change_type='Normal', priority='1', risk_level='High',
        impact='1 - High', status='SCHEDULED',
        requester=requester, assigned_to=implementer,
        assignment_group='Infrastructure', category='Network',
        service='Network Infrastructure', service_offering='Core Switching',
        justification='core-switch-01 is end-of-support. Multiple port failures in last 30 days.',
        implementation_plan='1. Pre-stage new switch config\n2. Maintenance window cutover\n3. Migrate uplinks\n4. Validate VLANs',
        rollback_plan='Reconnect old switch. Config backed up. ETA 15 mins.',
        test_plan='Ping all gateway IPs and validate inter-VLAN routing.',
        ci_impact_depth='full',
    )
    ChangeTask.objects.create(change=change3, short_description='Pre-stage Catalyst 9500 configuration', description='Load VLAN and port config onto new switch before cutover.', order=1)
    ChangeTask.objects.create(change=change3, short_description='Cutover uplinks during maintenance window', description='Move uplink cables one at a time, validate after each.', order=2)
    ChangeTask.objects.create(change=change3, short_description='Validate all VLANs and routing',           description='Ping test matrix across all VLANs and verify routing table.', order=3)
    print(f'Created change: {change3.ticket_number}')
else:
    print('Changes already exist, skipping.')

# ── CMDB ───────────────────────────────────────────────────────────────────
if not ConfigurationItem.objects.exists():
    esxi1 = ConfigurationItem.objects.create(name='esxi-prod-01', ci_type='ESXi Host', environment='Production',
        ip_address='10.0.1.10', os='VMware ESXi', os_version='8.0', cpu_cores=64, ram_gb=512,
        department='Infrastructure', business_criticality='Critical', support_group='Infra Team')
    esxi2 = ConfigurationItem.objects.create(name='esxi-prod-02', ci_type='ESXi Host', environment='Production',
        ip_address='10.0.1.11', os='VMware ESXi', os_version='8.0', cpu_cores=64, ram_gb=512,
        department='Infrastructure', business_criticality='Critical', support_group='Infra Team')
    vm_db1 = ConfigurationItem.objects.create(name='vm-db-prod-01', ci_type='Virtual Machine', environment='Production',
        ip_address='10.0.2.10', os='RHEL', os_version='9.2', cpu_cores=8, ram_gb=32,
        department='DBA Team', business_criticality='Critical')
    vm_app1 = ConfigurationItem.objects.create(name='vm-app-prod-01', ci_type='Virtual Machine', environment='Production',
        ip_address='10.0.2.11', os='Ubuntu', os_version='22.04', cpu_cores=4, ram_gb=16,
        department='Engineering', business_criticality='High')
    vm_mw1 = ConfigurationItem.objects.create(name='vm-middleware-01', ci_type='Virtual Machine', environment='Production',
        ip_address='10.0.2.12', os='Ubuntu', os_version='22.04', cpu_cores=4, ram_gb=8,
        department='Engineering', business_criticality='High')
    vm_app2 = ConfigurationItem.objects.create(name='vm-app-prod-02', ci_type='Virtual Machine', environment='Production',
        ip_address='10.0.2.20', os='Ubuntu', os_version='22.04', cpu_cores=4, ram_gb=16,
        department='Engineering', business_criticality='High')
    pg_db = ConfigurationItem.objects.create(name='postgresql-prod', ci_type='Database', environment='Production',
        ip_address='10.0.2.10', os='PostgreSQL', os_version='16', department='DBA Team', business_criticality='Critical')
    crm_app = ConfigurationItem.objects.create(name='crm-application', ci_type='Application', environment='Production',
        fqdn='crm.internal.company.com', department='Engineering', business_criticality='High')
    billing_app = ConfigurationItem.objects.create(name='billing-service', ci_type='Application', environment='Production',
        fqdn='billing.internal.company.com', department='Finance', business_criticality='Critical')
    kafka_mw = ConfigurationItem.objects.create(name='kafka-cluster', ci_type='Middleware', environment='Production',
        ip_address='10.0.2.12', department='Engineering', business_criticality='High')
    ctr1 = ConfigurationItem.objects.create(name='payment-processor-pod', ci_type='Container/Pod', environment='Production',
        department='Engineering', business_criticality='Critical')
    sw1 = ConfigurationItem.objects.create(name='core-switch-01', ci_type='Network Device', environment='Production',
        ip_address='10.0.0.1', department='Infrastructure', business_criticality='Critical')
    stor1 = ConfigurationItem.objects.create(name='san-storage-01', ci_type='Storage', environment='Production',
        ip_address='10.0.3.10', department='Infrastructure', business_criticality='Critical', support_group='Infra Team')
    srv1 = ConfigurationItem.objects.create(name='phys-srv-prod-01', ci_type='Physical Server', environment='Production',
        ip_address='10.0.1.20', os='RHEL', os_version='9.2', cpu_cores=32, ram_gb=256,
        department='Infrastructure', business_criticality='High')

    rels = [
        (esxi1, vm_db1,      'hosts'),
        (esxi1, vm_app1,     'hosts'),
        (esxi1, vm_mw1,      'hosts'),
        (esxi2, vm_app2,     'hosts'),
        (vm_db1,    pg_db,       'contains'),
        (vm_app1,   crm_app,     'contains'),
        (vm_mw1,    kafka_mw,    'contains'),
        (vm_app2,   billing_app, 'contains'),
        (billing_app, ctr1,      'contains'),
        (crm_app,   pg_db,       'depends_on'),
        (billing_app, pg_db,     'depends_on'),
        (billing_app, kafka_mw,  'depends_on'),
        (crm_app,   kafka_mw,    'depends_on'),
        (esxi1,     sw1,         'connects_to'),
        (esxi2,     sw1,         'connects_to'),
        (srv1,      sw1,         'connects_to'),
        (vm_db1,    stor1,       'backed_by'),
        (pg_db,     stor1,       'backed_by'),
    ]
    for src, tgt, rel in rels:
        CIRelationship.objects.get_or_create(source_ci=src, target_ci=tgt, relationship_type=rel)

    print(f'CMDB seeded: {ConfigurationItem.objects.count()} CIs, {CIRelationship.objects.count()} relationships')
else:
    print('CMDB already seeded, skipping.')

print('\nSeed complete.')
print('\nLogin credentials:')
print('  admin / password123        (ADMIN)')
print('  john.doe / password123     (REQUESTER)')
print('  jane.smith / password123   (IMPLEMENTER)')
print('  cab.manager / password123  (CAB_MANAGER)')
print('  cab.member / password123   (CAB_MEMBER)')