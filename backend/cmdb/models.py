from django.db import models
from django.conf import settings


class ConfigurationItem(models.Model):
    class CIType(models.TextChoices):
        ESXI_HOST       = 'ESXi Host',       'ESXi Host'
        VIRTUAL_MACHINE = 'Virtual Machine', 'Virtual Machine'
        PHYSICAL_SERVER = 'Physical Server', 'Physical Server'
        APPLICATION     = 'Application',     'Application'
        DATABASE        = 'Database',        'Database'
        MIDDLEWARE      = 'Middleware',       'Middleware'
        CONTAINER       = 'Container/Pod',   'Container/Pod'
        NETWORK_DEVICE  = 'Network Device',  'Network Device'
        STORAGE         = 'Storage',         'Storage'
        OTHER           = 'Other',           'Other'

    class Status(models.TextChoices):
        OPERATIONAL    = 'Operational',    'Operational'
        MAINTENANCE    = 'Maintenance',    'Maintenance'
        DECOMMISSIONED = 'Decommissioned', 'Decommissioned'
        PLANNED        = 'Planned',        'Planned'

    class Environment(models.TextChoices):
        PRODUCTION  = 'Production',  'Production'
        STAGING     = 'Staging',     'Staging'
        UAT         = 'UAT',         'UAT'
        DEVELOPMENT = 'Development', 'Development'
        DR          = 'DR',          'DR'

    # Identity
    ci_id        = models.CharField(max_length=30, unique=True, editable=False)
    name         = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255, blank=True)
    ci_type      = models.CharField(max_length=30, choices=CIType.choices, default=CIType.VIRTUAL_MACHINE)
    status       = models.CharField(max_length=20, choices=Status.choices, default=Status.OPERATIONAL)
    environment  = models.CharField(max_length=20, choices=Environment.choices, default=Environment.PRODUCTION)

    # Technical properties
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    fqdn       = models.CharField(max_length=255, blank=True)
    os         = models.CharField(max_length=100, blank=True)
    os_version = models.CharField(max_length=50, blank=True)
    cpu_cores  = models.PositiveIntegerField(null=True, blank=True)
    ram_gb     = models.FloatField(null=True, blank=True)
    disk_gb    = models.FloatField(null=True, blank=True)

    # Ownership
    owner         = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='owned_cis')
    managed_by    = models.CharField(max_length=100, blank=True)
    department    = models.CharField(max_length=100, blank=True)
    location      = models.CharField(max_length=100, blank=True)
    support_group = models.CharField(max_length=100, blank=True)

    # Classification
    business_criticality = models.CharField(
        max_length=10,
        choices=[('Critical','Critical'),('High','High'),('Medium','Medium'),('Low','Low')],
        default='Medium'
    )
    tags  = models.CharField(max_length=500, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Configuration Item'

    def save(self, *args, **kwargs):
        if not self.ci_id:
            prefix = {
                'ESXi Host': 'ESX', 'Virtual Machine': 'VM', 'Physical Server': 'SRV',
                'Application': 'APP', 'Database': 'DB', 'Middleware': 'MWR',
                'Container/Pod': 'CTR', 'Network Device': 'NET', 'Storage': 'STR',
            }.get(self.ci_type, 'CI')
            import random
            self.ci_id = f"{prefix}{random.randint(100000, 999999)}"
        if not self.display_name:
            self.display_name = self.name
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.ci_id} — {self.name} ({self.ci_type})"

    def get_all_impacted(self, visited=None, max_depth=None, current_depth=0):
        """
        Walk the relationship tree to find impacted CIs.
        max_depth=None  → full tree (unlimited)
        max_depth=1     → direct relationships only
        max_depth=2     → two levels deep
        """
        if visited is None:
            visited = set()
        if self.pk in visited:
            return []
        # Depth guard — None means unlimited
        if max_depth is not None and current_depth >= max_depth:
            return []

        visited.add(self.pk)
        impacted = []

        # Forward: things this CI hosts / contains / runs
        for rel in self.outgoing_relationships.filter(
            relationship_type__in=['hosts', 'contains', 'runs_on']
        ).select_related('target_ci'):
            target = rel.target_ci
            if target.pk not in visited:
                impacted.append(target)
                impacted.extend(
                    target.get_all_impacted(visited, max_depth, current_depth + 1)
                )

        # Reverse: things that depend on this CI
        for rel in CIRelationship.objects.filter(
            target_ci=self, relationship_type='depends_on'
        ).select_related('source_ci'):
            src = rel.source_ci
            if src.pk not in visited:
                impacted.append(src)
                impacted.extend(
                    src.get_all_impacted(visited, max_depth, current_depth + 1)
                )

        return impacted


class CIRelationship(models.Model):
    class RelType(models.TextChoices):
        HOSTS       = 'hosts',       'Hosts'
        CONTAINS    = 'contains',    'Contains'
        RUNS_ON     = 'runs_on',     'Runs On'
        DEPENDS_ON  = 'depends_on',  'Depends On'
        CONNECTS_TO = 'connects_to', 'Connects To'
        BACKED_BY   = 'backed_by',   'Backed By'

    source_ci         = models.ForeignKey(ConfigurationItem, related_name='outgoing_relationships', on_delete=models.CASCADE)
    target_ci         = models.ForeignKey(ConfigurationItem, related_name='incoming_relationships', on_delete=models.CASCADE)
    relationship_type = models.CharField(max_length=20, choices=RelType.choices)
    notes             = models.TextField(blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('source_ci', 'target_ci', 'relationship_type')
        verbose_name = 'CI Relationship'

    def __str__(self):
        return f"{self.source_ci.name} —[{self.relationship_type}]→ {self.target_ci.name}"
