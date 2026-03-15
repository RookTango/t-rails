import uuid
import secrets
from django.db import models
from django.conf import settings


class IntegrationApp(models.Model):
    """
    Represents an external system connected to T-Rails via the protocol API.
    Each app gets its own API key and usage tracking.
    """
    class Status(models.TextChoices):
        ACTIVE   = 'ACTIVE',   'Active'
        INACTIVE = 'INACTIVE', 'Inactive'
        REVOKED  = 'REVOKED',  'Revoked'

    class SourceSystem(models.TextChoices):
        SERVICENOW = 'servicenow', 'ServiceNow'
        JIRA       = 'jira',       'Jira Service Management'
        BMC        = 'bmc',        'BMC Helix'
        CUSTOM     = 'custom',     'Custom / Other'

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name           = models.CharField(max_length=100)
    description    = models.TextField(blank=True)
    source_system  = models.CharField(max_length=20, choices=SourceSystem.choices, default=SourceSystem.CUSTOM)
    status         = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_by     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_integrations')
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)
    last_called_at = models.DateTimeField(null=True, blank=True)
    total_requests = models.PositiveIntegerField(default=0)
    webhook_url    = models.URLField(blank=True, help_text='POST results here when generation/scoring completes')
    webhook_secret = models.CharField(max_length=64, blank=True, help_text='HMAC secret for webhook signature verification')
    notes          = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.source_system})"


class APIKey(models.Model):
    """
    API key for an IntegrationApp.
    Keys are hashed — the plaintext is only shown once on creation.
    """
    class Status(models.TextChoices):
        ACTIVE  = 'ACTIVE',  'Active'
        REVOKED = 'REVOKED', 'Revoked'

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    app        = models.ForeignKey(IntegrationApp, on_delete=models.CASCADE, related_name='api_keys')
    name       = models.CharField(max_length=100, help_text='Label for this key e.g. "Production" or "Staging"')
    key_prefix = models.CharField(max_length=12, help_text='First 8 chars of key — shown in UI for identification')
    key_hash   = models.CharField(max_length=128, help_text='SHA-256 hash of the full key')
    status     = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    usage_count  = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.app.name} — {self.name} ({self.key_prefix}...)"

    @staticmethod
    def generate():
        """Generate a new key. Returns (plaintext, prefix, hash)."""
        import hashlib
        plaintext = 'trk_' + secrets.token_urlsafe(32)
        prefix    = plaintext[:12]
        hashed    = hashlib.sha256(plaintext.encode()).hexdigest()
        return plaintext, prefix, hashed

    @staticmethod
    def verify(plaintext: str) -> 'APIKey | None':
        """Look up an APIKey by plaintext. Returns None if not found or revoked."""
        import hashlib
        hashed = hashlib.sha256(plaintext.encode()).hexdigest()
        try:
            key = APIKey.objects.select_related('app').get(
                key_hash=hashed,
                status=APIKey.Status.ACTIVE,
                app__status=IntegrationApp.Status.ACTIVE,
            )
            return key
        except APIKey.DoesNotExist:
            return None


class AssuranceRequest(models.Model):
    """
    Audit log of every protocol API call.
    Tracks the canonical change ID across both generate and validate calls.
    """
    class RequestType(models.TextChoices):
        GENERATE = 'GENERATE', 'Generate Checklist'
        ACCEPT   = 'ACCEPT',   'Accept/Reject Items'
        VALIDATE = 'VALIDATE', 'Validate Evidence'

    class ResultStatus(models.TextChoices):
        SUCCESS = 'SUCCESS', 'Success'
        FAILED  = 'FAILED',  'Failed'
        PENDING = 'PENDING', 'Pending (async)'

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    app              = models.ForeignKey(IntegrationApp, on_delete=models.SET_NULL, null=True, related_name='requests')
    api_key          = models.ForeignKey(APIKey, on_delete=models.SET_NULL, null=True, related_name='requests')
    request_type     = models.CharField(max_length=10, choices=RequestType.choices)
    source_change_id = models.CharField(max_length=100, help_text='Change ID from the source system')
    status           = models.CharField(max_length=10, choices=ResultStatus.choices, default=ResultStatus.PENDING)
    error_message    = models.TextField(blank=True)
    request_payload  = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    duration_ms      = models.PositiveIntegerField(null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    checklist        = models.ForeignKey(
        'watson.WatsonChecklist', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='assurance_requests'
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.request_type} | {self.source_change_id} | {self.status}"