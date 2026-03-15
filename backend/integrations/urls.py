from django.urls import path
from .views_protocol import (
    ProtocolGenerateView, ProtocolAcceptView,
    ProtocolValidateView, ProtocolResultView, ProtocolSchemaView,
)
from .views_hub import (
    AppListCreateView, AppDetailView,
    APIKeyCreateView, APIKeyRevokeView, UsageView,
)

# Protocol endpoints — external systems connect here
protocol_urlpatterns = [
    path('generate/',              ProtocolGenerateView.as_view()),
    path('accept/',                ProtocolAcceptView.as_view()),
    path('validate/',              ProtocolValidateView.as_view()),
    path('result/<str:change_id>/',ProtocolResultView.as_view()),
    path('schema/',                ProtocolSchemaView.as_view()),
]

# Hub management endpoints — T-Rails admins use these
hub_urlpatterns = [
    path('apps/',                  AppListCreateView.as_view()),
    path('apps/<uuid:pk>/',        AppDetailView.as_view()),
    path('apps/<uuid:pk>/keys/',   APIKeyCreateView.as_view()),
    path('keys/<uuid:pk>/',        APIKeyRevokeView.as_view()),
    path('usage/',                 UsageView.as_view()),
]

urlpatterns = protocol_urlpatterns + hub_urlpatterns