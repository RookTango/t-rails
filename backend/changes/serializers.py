from rest_framework import serializers
from accounts.models import User
from .models import ChangeRequest, ChangeTask, Attachment, ActivityLog, ChangeCI, TaskCI
from accounts.serializers import UserSerializer


class AttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)
    class Meta:
        model  = Attachment
        fields = '__all__'


class TaskCISerializer(serializers.ModelSerializer):
    ci_detail = serializers.SerializerMethodField()
    class Meta:
        model  = TaskCI
        fields = '__all__'
        read_only_fields = ['added_at']
    def get_ci_detail(self, obj):
        return {
            'id': obj.ci.id, 'ci_id': obj.ci.ci_id, 'name': obj.ci.name,
            'ci_type': obj.ci.ci_type, 'status': obj.ci.status,
            'environment': obj.ci.environment,
            'ip_address': str(obj.ci.ip_address or ''),
        }


class ChangeTaskSerializer(serializers.ModelSerializer):
    assigned_to_detail = UserSerializer(source='assigned_to', read_only=True)
    ci_detail          = serializers.SerializerMethodField()
    task_cis           = TaskCISerializer(many=True, read_only=True)

    class Meta:
        model  = ChangeTask
        fields = '__all__'
        read_only_fields = ['task_number', 'created_at', 'updated_at', 'change',
                            'actual_start', 'actual_end']

    def get_ci_detail(self, obj):
        if obj.ci:
            return {'id': obj.ci.id, 'ci_id': obj.ci.ci_id,
                    'name': obj.ci.name, 'ci_type': obj.ci.ci_type}
        return None


class ChangeTaskCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model   = ChangeTask
        exclude = ['task_number', 'change', 'created_at', 'updated_at']


class ActivityLogSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    class Meta:
        model  = ActivityLog
        fields = '__all__'


class ChangeCISerializer(serializers.ModelSerializer):
    ci_detail = serializers.SerializerMethodField()
    class Meta:
        model  = ChangeCI
        fields = '__all__'
        read_only_fields = ['added_at']
    def get_ci_detail(self, obj):
        return {
            'id': obj.ci.id, 'ci_id': obj.ci.ci_id, 'name': obj.ci.name,
            'ci_type': obj.ci.ci_type, 'status': obj.ci.status,
            'environment': obj.ci.environment,
            'ip_address': str(obj.ci.ip_address or ''),
            'business_criticality': obj.ci.business_criticality,
        }


class ChangeRequestSerializer(serializers.ModelSerializer):
    requester          = UserSerializer(read_only=True)
    assigned_to_detail = UserSerializer(source='assigned_to', read_only=True)
    tasks              = ChangeTaskSerializer(many=True, read_only=True)
    attachments        = AttachmentSerializer(many=True, read_only=True)
    activity_logs      = ActivityLogSerializer(many=True, read_only=True)
    change_cis         = ChangeCISerializer(many=True, read_only=True)

    class Meta:
        model  = ChangeRequest
        fields = '__all__'
        read_only_fields = ['ticket_number', 'created_at', 'updated_at', 'requester']


class ChangeRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model   = ChangeRequest
        exclude = ['ticket_number', 'requester', 'created_at', 'updated_at']
