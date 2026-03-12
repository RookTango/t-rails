from django.urls import path
from .views import GenerateChecklistView, EvaluateChecklistView, ApproveChecklistView, ChecklistDetailView

urlpatterns = [
    path('changes/<int:pk>/generate-checklist/', GenerateChecklistView.as_view()),
    path('changes/<int:pk>/evaluate/', EvaluateChecklistView.as_view()),
    path('changes/<int:pk>/checklists/', ChecklistDetailView.as_view()),
    path('checklists/<int:pk>/approve/', ApproveChecklistView.as_view()),
]
