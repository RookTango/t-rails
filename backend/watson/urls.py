from django.urls import path
from .views import (
    CABChallengeListView, EvaluateJustificationView, GenerateCABBriefView, GenerateChecklistView, ChecklistDetailView,
    ChecklistItemAcceptView, GenerateFinalBriefView, GenerateInterrogationView, PassiveScoreView, ExportChecklistJSON,
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
    path('changes/<int:pk>/cab-brief/', GenerateCABBriefView.as_view()),
    path('changes/<int:pk>/cab-interrogate/',        GenerateInterrogationView.as_view()),
    path('cab-challenges/<int:pk>/evaluate/',        EvaluateJustificationView.as_view()),
    path('changes/<int:pk>/cab-final-brief/',        GenerateFinalBriefView.as_view()),
    path('changes/<int:pk>/cab-challenges/',         CABChallengeListView.as_view()),
]