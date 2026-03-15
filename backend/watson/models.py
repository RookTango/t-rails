from django.db import models
from django.conf import settings


class WatsonChecklist(models.Model):
    class Status(models.TextChoices):
        DRAFT      = 'DRAFT',      'Draft'
        REVIEWING  = 'REVIEWING',  'Under Review'
        ACCEPTED   = 'ACCEPTED',   'Accepted'
        SUPERSEDED = 'SUPERSEDED', 'Superseded'

    change = models.ForeignKey(
    'changes.ChangeRequest',
    related_name='watson_checklists',
    on_delete=models.CASCADE,
    null=True,
    blank=True,
    )
    status        = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    generated_at  = models.DateTimeField(auto_now_add=True)
    generated_by  = models.CharField(max_length=50, default='watson-mock-v1')
    confidence    = models.FloatField(null=True, blank=True)
    source_notes  = models.TextField(blank=True)
    json_artifact = models.JSONField(default=dict, blank=True)
    accepted_by   = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                       related_name='accepted_checklists', on_delete=models.SET_NULL)
    accepted_at   = models.DateTimeField(null=True, blank=True)
    source_change_id = models.CharField(
        max_length=100, blank=True, db_index=True,
        help_text='Change ID from external source system (protocol API)'
    )
    integration_app = models.ForeignKey(
        'integrations.IntegrationApp',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='checklists',
        help_text='External app that created this checklist via protocol API'
    )

    class Meta:
        ordering = ['-generated_at']

    def __str__(self):
        return f"Checklist for {self.change.ticket_number} [{self.status}]"


class ChecklistGroup(models.Model):
    """
    A group of checklist items. Can be tied to a specific task or be global.
    group_type: PRE | TASK | POST
    """
    class GroupType(models.TextChoices):
        PRE  = 'PRE',  'Pre-Implementation'
        TASK = 'TASK', 'Task'
        POST = 'POST', 'Post-Implementation'

    checklist  = models.ForeignKey(WatsonChecklist, related_name='groups', on_delete=models.CASCADE)
    code       = models.CharField(max_length=20)
    title      = models.CharField(max_length=200)
    phase      = models.CharField(max_length=30, blank=True)
    group_type = models.CharField(max_length=10, choices=GroupType.choices, default=GroupType.PRE)
    task       = models.ForeignKey('changes.ChangeTask', null=True, blank=True,
                                    related_name='checklist_groups', on_delete=models.SET_NULL)
    order      = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.code}: {self.title}"


class ChecklistItem(models.Model):
    class Acceptance(models.TextChoices):
        PENDING  = 'PENDING',  'Pending'
        ACCEPTED = 'ACCEPTED', 'Accepted'
        REJECTED = 'REJECTED', 'Rejected'
        MODIFIED = 'MODIFIED', 'Modified'

    class ImplResult(models.TextChoices):
        NOT_RUN = 'NOT_RUN', 'Not Run'
        PASS    = 'PASS',    'Pass'
        FAIL    = 'FAIL',    'Fail'
        CAUTION = 'CAUTION', 'Caution'
        SKIPPED = 'SKIPPED', 'Skipped'

    group         = models.ForeignKey(ChecklistGroup, related_name='items', on_delete=models.CASCADE)
    code          = models.CharField(max_length=20)
    description   = models.TextField()
    rationale     = models.TextField(blank=True)
    command_hint  = models.CharField(max_length=500, blank=True)
    caution       = models.TextField(blank=True)
    order         = models.PositiveIntegerField(default=0)

    # CAB acceptance (Authorize phase)
    acceptance      = models.CharField(max_length=10, choices=Acceptance.choices, default=Acceptance.PENDING)
    acceptance_note = models.TextField(blank=True)
    accepted_by     = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                         related_name='accepted_items', on_delete=models.SET_NULL)
    accepted_at     = models.DateTimeField(null=True, blank=True)

    # Implementation — Watson auto-scores by watching activity stream
    impl_result        = models.CharField(max_length=10, choices=ImplResult.choices, default=ImplResult.NOT_RUN)
    impl_evidence      = models.TextField(blank=True)   # the activity/note Watson used
    impl_watson_note   = models.TextField(blank=True)   # Watson's explanation
    impl_validated_at  = models.DateTimeField(null=True, blank=True)
    impl_auto_scored   = models.BooleanField(default=False)  # True = Watson did it passively

    technical_criteria = models.TextField(
    blank=True,
    help_text="Hidden instruction for Phase 2 validator — not shown to implementer"
    )
    confidence_flag = models.CharField(
        max_length=20,
        default='HIGH',
        choices=[
            ('HIGH', 'High Confidence'),
            ('AI-GENERATED', 'AI Generated — Needs Senior Review'),
            ('UNSURE', 'Unsure — Requester Clarification Required'),
        ]
    )
    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.code}: {self.description[:60]}"
