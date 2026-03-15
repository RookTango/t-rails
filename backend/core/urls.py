from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
 
urlpatterns = [
    path('admin/',          admin.site.urls),
    path('api/auth/',       include('accounts.urls')),
    path('api/changes/',    include('changes.urls')),
    path('api/cmdb/',       include('cmdb.urls')),
    path('api/watson/',     include('watson.urls')),
 
    # Protocol API — external systems connect here
    path('api/v1/assurance/', include('integrations.urls')),
 
    # Hub management — T-Rails admins
    path('api/integrations/', include('integrations.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)