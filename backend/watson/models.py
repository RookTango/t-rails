from django.db import models
from django.conf import settings

class WatsonChecklist(models.Model):
    class Phase(models.TextChoices):
        AUTHORIZE = 'AUTHORIZE', 'Authorize'
        IMPLEMENT = 'IMPLEMENT', 'Implement'

    change = models.ForeignKey('changes.ChangeRequest', related_name='watson_checklists', on_delete=models.CASCADE)
    phase = models.CharField(max_length=20, choices=Phase.choices)
    generated_at = models.DateTimeField(auto_now_add=True)
    generated_by_watson = models.BooleanField(default=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    approved_at = models.DateTimeField(null=True, blank=True)
    raw_watson_response = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ('change', 'phase')

    def __str__(self):
        return f"Checklist [{self.phase}] for {self.change.ticket_number}"


class ChecklistItem(models.Model):
    class Result(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        PASS = 'PASS', 'Pass'
        FAIL = 'FAIL', 'Fail'
        NA = 'NA', 'N/A'

    checklist = models.ForeignKey(WatsonChecklist, related_name='items', on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=0)
    category = models.CharField(max_length=100, blank=True)  # e.g. "Pre-check", "Security", "Rollback"
    description = models.TextField()
    rationale = models.TextField(blank=True)  # Why Watson flagged this
    result = models.CharField(max_length=10, choices=Result.choices, default=Result.PENDING)
    evidence_note = models.TextField(blank=True)  # Watson's note when marking pass/fail
    evidence_attachment = models.ForeignKey('changes.Attachment', null=True, blank=True, on_delete=models.SET_NULL)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"[{self.result}] {self.description[:60]}"
