"""
API key authentication for the protocol endpoints.
External systems pass their key in the Authorization header:
    Authorization: Bearer trk_xxxxx
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.utils import timezone
from .models import APIKey


class APIKeyAuthentication(BaseAuthentication):

    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith('Bearer trk_'):
            return None  # Not our auth scheme — let other authenticators try

        token = auth_header.split(' ', 1)[1].strip()
        api_key = APIKey.verify(token)

        if not api_key:
            raise AuthenticationFailed('Invalid or revoked API key.')

        # Update usage tracking
        now = timezone.now()
        APIKey.objects.filter(pk=api_key.pk).update(
            last_used_at=now,
            usage_count=api_key.usage_count + 1,
        )
        from .models import IntegrationApp
        IntegrationApp.objects.filter(pk=api_key.app_id).update(
            last_called_at=now,
            total_requests=api_key.app.total_requests + 1,
        )

        return (api_key.app, api_key)

    def authenticate_header(self, request):
        return 'Bearer realm="T-Rails Protocol API"'