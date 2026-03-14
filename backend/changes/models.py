from django.db import models
from django.conf import settings

class ChangeRequest(models.Model):
    class Status(models.TextChoices):
        NEW = 'NEW', 'New'
        ASSESS = 'ASSESS', 'Assess'
        AUTHORIZE = 'AUTHORIZE', 'Authorize'
        SCHEDULED = 'SCHEDULED', 'Scheduled'
        IMPLEMENT = 'IMPLEMENT', 'Implement'
        REVIEW = 'REVIEW', 'Review'
        CLOSED = 'CLOSED', 'Closed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    class Priority(models.TextChoices):
        P1_CRITICAL = '1', '1 - Critical'
        P2_HIGH = '2', '2 - High'
        P3_MODERATE = '3', '3 - Moderate'
        P4_LOW = '4', '4 - Low'

    class ChangeType(models.TextChoices):
        STANDARD = 'Standard', 'Standard'
        NORMAL = 'Normal', 'Normal'
        EMERGENCY = 'Emergency', 'Emergency'

    class RiskLevel(models.TextChoices):
        HIGH = 'High', 'High'
        MEDIUM = 'Medium', 'Medium'
        LOW = 'Low', 'Low'

    class ImpactLevel(models.TextChoices):
        HIGH = '1 - High', '1 - High'
        MEDIUM = '2 - Medium', '2 - Medium'
        LOW = '3 - Low', '3 - Low'

    # Identity
    ticket_number = models.CharField(max_length=20, unique=True, editable=False)
    short_description = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    change_type = models.CharField(max_length=20, choices=ChangeType.choices, default=ChangeType.NORMAL)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)

    # Classification
    category = models.CharField(max_length=100, blank=True)
    service = models.CharField(max_length=100, blank=True)
    service_offering = models.CharField(max_length=100, blank=True)
    configuration_item = models.CharField(max_length=100, blank=True)
    assignment_group = models.CharField(max_length=100, blank=True)

    # Priority / Risk / Impact
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.P3_MODERATE)
    risk_level = models.CharField(max_length=20, choices=RiskLevel.choices, default=RiskLevel.MEDIUM)
    impact = models.CharField(max_length=20, choices=ImpactLevel.choices, default=ImpactLevel.MEDIUM)

    # Ownership
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='requested_changes', on_delete=models.PROTECT)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='assigned_changes', null=True, blank=True, on_delete=models.SET_NULL)
    cab_members = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name='cab_changes', blank=True)

    # Change Window
    change_window_start = models.DateTimeField(null=True, blank=True)
    change_window_end = models.DateTimeField(null=True, blank=True)

    # Scheduling (actual execution within window)
    planned_start = models.DateTimeField(null=True, blank=True)
    planned_end = models.DateTimeField(null=True, blank=True)
    actual_start = models.DateTimeField(null=True, blank=True)
    actual_end = models.DateTimeField(null=True, blank=True)

    # Planning tab fields
    justification = models.TextField(blank=True)
    implementation_plan = models.TextField(blank=True)
    rollback_plan = models.TextField(blank=True)
    test_plan = models.TextField(blank=True)

    # Closure
    close_code = models.CharField(max_length=50, blank=True)
    close_notes = models.TextField(blank=True)

    # Conflict
    conflict_status = models.CharField(max_length=50, blank=True, default='None')
    conflict_last_run = models.DateTimeField(null=True, blank=True)

    # CI Impact depth — controls how many relationship levels Watson/UI walks
    class ImpactDepth(models.TextChoices):
        DIRECT   = '1',    '1 Level (Direct only)'
        TWO      = '2',    '2 Levels'
        FULL     = 'full', 'Full Tree (All descendants)'

    ci_impact_depth = models.CharField(
        max_length=10, choices=ImpactDepth.choices, default=ImpactDepth.FULL,
        help_text='How deep to propagate CI impact when attaching an Affected CI'
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.ticket_number:
            import random
            self.ticket_number = f"CHG{random.randint(1000000, 9999999)}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.ticket_number} - {self.short_description}"


class ChangeTask(models.Model):
    class Status(models.TextChoices):
        OPEN = 'Open', 'Open'
        IN_PROGRESS = 'In Progress', 'In Progress'
        COMPLETED = 'Completed', 'Completed'
        SKIPPED = 'Skipped', 'Skipped'
        CANCELLED = 'Cancelled', 'Cancelled'

    change = models.ForeignKey(ChangeRequest, related_name='tasks', on_delete=models.CASCADE)
    task_number = models.CharField(max_length=20, blank=True, editable=False)
    short_description = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    configuration_item = models.CharField(max_length=100, blank=True)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='assigned_tasks')
    assignment_group = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    order = models.PositiveIntegerField(default=0)
    ci = models.ForeignKey('cmdb.ConfigurationItem', null=True, blank=True, on_delete=models.SET_NULL, related_name='tasks')
    planned_start = models.DateTimeField(null=True, blank=True)
    planned_end   = models.DateTimeField(null=True, blank=True)
    actual_start  = models.DateTimeField(null=True, blank=True)
    actual_end    = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']

    def save(self, *args, **kwargs):
        if not self.task_number:
            import random
            self.task_number = f"CTASK{random.randint(1000000, 9999999)}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.task_number} - {self.short_description}"


class Attachment(models.Model):
    class AttachmentType(models.TextChoices):
        PROCEDURE = 'PROCEDURE', 'Procedure Doc'
        SCREENSHOT = 'SCREENSHOT', 'Screenshot'
        EVIDENCE = 'EVIDENCE', 'Evidence'
        OTHER = 'OTHER', 'Other'

    change = models.ForeignKey(ChangeRequest, related_name='attachments', null=True, blank=True, on_delete=models.CASCADE)
    task = models.ForeignKey(ChangeTask, related_name='attachments', null=True, blank=True, on_delete=models.CASCADE)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    file = models.FileField(upload_to='attachments/%Y/%m/')
    filename = models.CharField(max_length=255)
    attachment_type = models.CharField(max_length=20, choices=AttachmentType.choices, default=AttachmentType.OTHER)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.filename


class ActivityLog(models.Model):
    class ActionType(models.TextChoices):
        COMMENT = 'COMMENT', 'Comment'
        STATUS_CHANGE = 'STATUS_CHANGE', 'Status Change'
        ATTACHMENT = 'ATTACHMENT', 'Attachment Added'
        TASK_UPDATE = 'TASK_UPDATE', 'Task Update'
        WATSON_ACTION = 'WATSON_ACTION', 'Watson.ai Action'
        CAB_DECISION = 'CAB_DECISION', 'CAB Decision'

    change = models.ForeignKey(ChangeRequest, related_name='activity_logs', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action_type = models.CharField(max_length=20, choices=ActionType.choices)
    message = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.change.ticket_number} | {self.action_type}"


class ChangeCI(models.Model):
    """Links a CI to a change as Affected or Impacted (auto-derived)."""
    class Role(models.TextChoices):
        AFFECTED = 'Affected', 'Affected'   # Directly selected by user
        IMPACTED = 'Impacted', 'Impacted'   # Auto-derived from relationships

    change = models.ForeignKey(ChangeRequest, related_name='change_cis', on_delete=models.CASCADE)
    ci     = models.ForeignKey('cmdb.ConfigurationItem', related_name='change_cis', on_delete=models.CASCADE)
    role   = models.CharField(max_length=10, choices=Role.choices, default=Role.AFFECTED)
    notes  = models.TextField(blank=True)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('change', 'ci', 'role')

    def __str__(self):
        return f"{self.change.ticket_number} → {self.ci.name} ({self.role})"


class TaskCI(models.Model):
    """Links a CI directly to a specific task."""
    task  = models.ForeignKey(ChangeTask, related_name='task_cis', on_delete=models.CASCADE)
    ci    = models.ForeignKey('cmdb.ConfigurationItem', related_name='task_cis', on_delete=models.CASCADE)
    notes = models.TextField(blank=True)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('task', 'ci')

    def __str__(self):
        return f"{self.task.task_number} → {self.ci.name}"
