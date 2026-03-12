from rest_framework import serializers
from .models import WatsonChecklist, ChecklistItem

class ChecklistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChecklistItem
        fields = '__all__'

class WatsonChecklistSerializer(serializers.ModelSerializer):
    items = ChecklistItemSerializer(many=True, read_only=True)
    class Meta:
        model = WatsonChecklist
        fields = '__all__'
