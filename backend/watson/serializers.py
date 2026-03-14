from rest_framework import serializers
from .models import WatsonChecklist, ChecklistGroup, ChecklistItem
from accounts.serializers import UserSerializer


class ChecklistItemSerializer(serializers.ModelSerializer):
    accepted_by_detail = UserSerializer(source='accepted_by', read_only=True)
    class Meta:
        model  = ChecklistItem
        fields = '__all__'


class ChecklistGroupSerializer(serializers.ModelSerializer):
    items         = ChecklistItemSerializer(many=True, read_only=True)
    task_detail   = serializers.SerializerMethodField()
    class Meta:
        model  = ChecklistGroup
        fields = '__all__'
    def get_task_detail(self, obj):
        if obj.task:
            return {'id': obj.task.id, 'task_number': obj.task.task_number,
                    'short_description': obj.task.short_description, 'status': obj.task.status}
        return None


class WatsonChecklistSerializer(serializers.ModelSerializer):
    groups             = ChecklistGroupSerializer(many=True, read_only=True)
    accepted_by_detail = UserSerializer(source='accepted_by', read_only=True)
    stats              = serializers.SerializerMethodField()
    can_rederive       = serializers.SerializerMethodField()

    class Meta:
        model  = WatsonChecklist
        fields = '__all__'

    def get_stats(self, obj):
        items = ChecklistItem.objects.filter(group__checklist=obj)
        total = items.count()
        return {
            'total':         total,
            'accepted':      items.filter(acceptance='ACCEPTED').count(),
            'rejected':      items.filter(acceptance='REJECTED').count(),
            'modified':      items.filter(acceptance='MODIFIED').count(),
            'pending':       items.filter(acceptance='PENDING').count(),
            'impl_pass':     items.filter(impl_result='PASS').count(),
            'impl_fail':     items.filter(impl_result='FAIL').count(),
            'impl_caution':  items.filter(impl_result='CAUTION').count(),
            'impl_not_run':  items.filter(impl_result='NOT_RUN', acceptance__in=['ACCEPTED','MODIFIED']).count(),
        }

    def get_can_rederive(self, obj):
        return obj.change.status in ('DRAFT', 'NEW', 'ASSESS')
