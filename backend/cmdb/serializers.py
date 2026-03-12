from rest_framework import serializers
from .models import ConfigurationItem, CIRelationship
from accounts.serializers import UserSerializer


class CIRelationshipSerializer(serializers.ModelSerializer):
    target_ci_detail = serializers.SerializerMethodField()
    source_ci_detail = serializers.SerializerMethodField()

    class Meta:
        model  = CIRelationship
        fields = '__all__'

    def get_target_ci_detail(self, obj):
        return {'id': obj.target_ci.id, 'ci_id': obj.target_ci.ci_id, 'name': obj.target_ci.name, 'ci_type': obj.target_ci.ci_type, 'status': obj.target_ci.status}

    def get_source_ci_detail(self, obj):
        return {'id': obj.source_ci.id, 'ci_id': obj.source_ci.ci_id, 'name': obj.source_ci.name, 'ci_type': obj.source_ci.ci_type, 'status': obj.source_ci.status}


class ConfigurationItemSerializer(serializers.ModelSerializer):
    owner_detail = UserSerializer(source='owner', read_only=True)
    outgoing_relationships = CIRelationshipSerializer(many=True, read_only=True)
    incoming_relationships = CIRelationshipSerializer(many=True, read_only=True)

    class Meta:
        model  = ConfigurationItem
        fields = '__all__'
        read_only_fields = ['ci_id', 'created_at', 'updated_at']


class ConfigurationItemListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for search/list endpoints."""
    class Meta:
        model  = ConfigurationItem
        fields = ['id', 'ci_id', 'name', 'display_name', 'ci_type', 'status', 'environment', 'ip_address', 'business_criticality', 'department']


class ImpactedCISerializer(serializers.ModelSerializer):
    class Meta:
        model  = ConfigurationItem
        fields = ['id', 'ci_id', 'name', 'ci_type', 'status', 'environment', 'business_criticality']
