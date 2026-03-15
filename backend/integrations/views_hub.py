"""
Integration Hub management views.
Used by T-Rails admins to manage connected applications, API keys, and usage.
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import IntegrationApp, APIKey, AssuranceRequest

logger = logging.getLogger(__name__)


class AppListCreateView(APIView):
    """GET/POST /api/integrations/apps/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        apps = IntegrationApp.objects.prefetch_related('api_keys').all()
        return Response([_serialise_app(a) for a in apps])

    def post(self, request):
        data = request.data
        name = data.get('name', '').strip()
        if not name:
            return Response({'error': 'name is required'}, status=400)

        app = IntegrationApp.objects.create(
            name          = name,
            description   = data.get('description', ''),
            source_system = data.get('source_system', 'custom'),
            webhook_url   = data.get('webhook_url', ''),
            notes         = data.get('notes', ''),
            created_by    = request.user,
        )
        if data.get('webhook_url'):
            import secrets
            app.webhook_secret = secrets.token_hex(32)
            app.save()

        return Response(_serialise_app(app), status=201)


class AppDetailView(APIView):
    """GET/PATCH/DELETE /api/integrations/apps/<pk>/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            app = IntegrationApp.objects.prefetch_related('api_keys').get(pk=pk)
        except IntegrationApp.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(_serialise_app(app, detail=True))

    def patch(self, request, pk):
        try:
            app = IntegrationApp.objects.get(pk=pk)
        except IntegrationApp.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        for field in ('name', 'description', 'webhook_url', 'notes', 'status'):
            if field in request.data:
                setattr(app, field, request.data[field])
        app.save()
        return Response(_serialise_app(app))

    def delete(self, request, pk):
        try:
            app = IntegrationApp.objects.get(pk=pk)
        except IntegrationApp.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        app.status = IntegrationApp.Status.REVOKED
        app.save()
        APIKey.objects.filter(app=app, status=APIKey.Status.ACTIVE).update(
            status=APIKey.Status.REVOKED,
            revoked_at=timezone.now(),
        )
        return Response({'revoked': True})


class APIKeyCreateView(APIView):
    """POST /api/integrations/apps/<pk>/keys/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            app = IntegrationApp.objects.get(pk=pk)
        except IntegrationApp.DoesNotExist:
            return Response({'error': 'App not found'}, status=404)

        name = request.data.get('name', 'Default').strip()
        plaintext, prefix, hashed = APIKey.generate()

        key = APIKey.objects.create(
            app        = app,
            name       = name,
            key_prefix = prefix,
            key_hash   = hashed,
        )

        return Response({
            'id':         str(key.id),
            'name':       key.name,
            'key':        plaintext,  # Only shown once
            'key_prefix': prefix,
            'created_at': key.created_at.isoformat(),
            'warning':    'Store this key securely. It will not be shown again.',
        }, status=201)


class APIKeyRevokeView(APIView):
    """DELETE /api/integrations/keys/<pk>/"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            key = APIKey.objects.get(pk=pk)
        except APIKey.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        key.status     = APIKey.Status.REVOKED
        key.revoked_at = timezone.now()
        key.save()
        return Response({'revoked': True})


class UsageView(APIView):
    """GET /api/integrations/usage/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        recent = AssuranceRequest.objects.select_related('app').order_by('-created_at')[:50]
        apps   = IntegrationApp.objects.all()

        return Response({
            'summary': [
                {
                    'app_id':         str(a.id),
                    'app_name':       a.name,
                    'source_system':  a.source_system,
                    'status':         a.status,
                    'total_requests': a.total_requests,
                    'last_called_at': a.last_called_at.isoformat() if a.last_called_at else None,
                }
                for a in apps
            ],
            'recent_requests': [
                {
                    'id':               str(r.id),
                    'app':              r.app.name if r.app else 'Unknown',
                    'request_type':     r.request_type,
                    'source_change_id': r.source_change_id,
                    'status':           r.status,
                    'duration_ms':      r.duration_ms,
                    'created_at':       r.created_at.isoformat(),
                    'error':            r.error_message[:100] if r.error_message else None,
                }
                for r in recent
            ],
        })


def _serialise_app(app: IntegrationApp, detail: bool = False) -> dict:
    keys = [
        {
            'id':           str(k.id),
            'name':         k.name,
            'key_prefix':   k.key_prefix,
            'status':       k.status,
            'usage_count':  k.usage_count,
            'last_used_at': k.last_used_at.isoformat() if k.last_used_at else None,
            'created_at':   k.created_at.isoformat(),
        }
        for k in app.api_keys.filter(status=APIKey.Status.ACTIVE)
    ]
    out = {
        'id':             str(app.id),
        'name':           app.name,
        'description':    app.description,
        'source_system':  app.source_system,
        'status':         app.status,
        'total_requests': app.total_requests,
        'last_called_at': app.last_called_at.isoformat() if app.last_called_at else None,
        'created_at':     app.created_at.isoformat(),
        'webhook_url':    app.webhook_url,
        'api_keys':       keys,
    }
    if detail:
        out['notes'] = app.notes
        out['webhook_secret_set'] = bool(app.webhook_secret)
    return out