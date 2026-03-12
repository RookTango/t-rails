from django.urls import path
from .views import (ChangeListCreateView, ChangeDetailView, ChangeTransitionView,
                    ChangeTaskListCreateView, ChangeTaskDetailView,
                    AttachmentUploadView, CommentCreateView, ActivityLogListView,
                    ChangeCIListCreateView, ChangeCIDeleteView)

urlpatterns = [
    path('',                     ChangeListCreateView.as_view()),
    path('<int:pk>/',            ChangeDetailView.as_view()),
    path('<int:pk>/transition/', ChangeTransitionView.as_view()),
    path('<int:pk>/tasks/',      ChangeTaskListCreateView.as_view()),
    path('tasks/<int:pk>/',      ChangeTaskDetailView.as_view()),
    path('<int:pk>/attachments/',AttachmentUploadView.as_view()),
    path('<int:pk>/comments/',   CommentCreateView.as_view()),
    path('<int:pk>/activity/',   ActivityLogListView.as_view()),
    path('<int:pk>/cis/',        ChangeCIListCreateView.as_view()),
    path('cis/<int:pk>/',        ChangeCIDeleteView.as_view()),
]
