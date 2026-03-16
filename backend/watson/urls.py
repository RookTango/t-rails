from django.urls import path
from .views import (
    GenerateChecklistView, ChecklistDetailView,
    ChecklistItemAcceptView, PassiveScoreView, ExportChecklistJSON,
    GenerateChecklistDeepView, ChecklistDeepDetailView, PassiveScoreDeepView,  # NEW
)
 
urlpatterns = [
    path("changes/<int:pk>/generate/",            GenerateChecklistView.as_view()),
    path("changes/<int:pk>/checklist/",           ChecklistDetailView.as_view()),
    path("changes/<int:pk>/passive-score/",       PassiveScoreView.as_view()),
    path("changes/<int:pk>/export/",              ExportChecklistJSON.as_view()),
    path("items/<int:pk>/accept/",                ChecklistItemAcceptView.as_view()),
    # Deep analysis — Llama 3.3 70B
    path("changes/<int:pk>/generate-deep/",       GenerateChecklistDeepView.as_view()),
    path("changes/<int:pk>/checklist-deep/",      ChecklistDeepDetailView.as_view()),
    path("changes/<int:pk>/passive-score-deep/",  PassiveScoreDeepView.as_view()),
]