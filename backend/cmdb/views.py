from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q
from .models import ConfigurationItem, CIRelationship
from .serializers import (ConfigurationItemSerializer, ConfigurationItemListSerializer,
                           CIRelationshipSerializer, ImpactedCISerializer)


class CIListCreateView(generics.ListCreateAPIView):
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ConfigurationItemSerializer
        return ConfigurationItemListSerializer

    def get_queryset(self):
        qs = ConfigurationItem.objects.select_related('owner')
        q  = self.request.query_params.get('q', '')
        ci_type = self.request.query_params.get('type', '')
        env  = self.request.query_params.get('env', '')
        status_f = self.request.query_params.get('status', '')
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(ci_id__icontains=q) | Q(ip_address__icontains=q) | Q(fqdn__icontains=q))
        if ci_type:
            qs = qs.filter(ci_type=ci_type)
        if env:
            qs = qs.filter(environment=env)
        if status_f:
            qs = qs.filter(status=status_f)
        return qs


class CIDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = ConfigurationItem.objects.prefetch_related('outgoing_relationships__target_ci', 'incoming_relationships__source_ci')
    serializer_class = ConfigurationItemSerializer


class CISearchView(APIView):
    """Lightweight autocomplete search — returns list format."""
    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if len(q) < 1:
            return Response([])
        qs = ConfigurationItem.objects.filter(
            Q(name__icontains=q) | Q(ci_id__icontains=q) | Q(ip_address__icontains=q) | Q(fqdn__icontains=q)
        ).filter(status='Operational')[:20]
        return Response(ConfigurationItemListSerializer(qs, many=True).data)


class CIImpactView(APIView):
    """Given a CI id, return full tree of impacted CIs."""
    def get(self, request, pk):
        try:
            ci = ConfigurationItem.objects.get(pk=pk)
        except ConfigurationItem.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        raw_depth = request.query_params.get('depth', 'full')
        max_depth = None if raw_depth == 'full' else int(raw_depth)
        impacted = ci.get_all_impacted(max_depth=max_depth)
        # Deduplicate
        seen = set()
        unique = []
        for c in impacted:
            if c.pk not in seen:
                seen.add(c.pk)
                unique.append(c)
        return Response(ImpactedCISerializer(unique, many=True).data)


class CIRelationshipCreateView(generics.CreateAPIView):
    queryset = CIRelationship.objects.all()
    serializer_class = CIRelationshipSerializer


class CIRelationshipDeleteView(generics.DestroyAPIView):
    queryset = CIRelationship.objects.all()
    serializer_class = CIRelationshipSerializer
