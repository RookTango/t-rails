from django.urls import path
from .views import (CIListCreateView, CIDetailView, CISearchView,
                    CIImpactView, CIRelationshipCreateView, CIRelationshipDeleteView)

urlpatterns = [
    path('',                         CIListCreateView.as_view()),
    path('search/',                  CISearchView.as_view()),
    path('<int:pk>/',                CIDetailView.as_view()),
    path('<int:pk>/impact/',         CIImpactView.as_view()),
    path('relationships/',           CIRelationshipCreateView.as_view()),
    path('relationships/<int:pk>/',  CIRelationshipDeleteView.as_view()),
]
