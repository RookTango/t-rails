from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    class Role(models.TextChoices):
        REQUESTER = 'REQUESTER', 'Requester'
        IMPLEMENTER = 'IMPLEMENTER', 'Implementer'
        CAB_MEMBER = 'CAB_MEMBER', 'CAB Member'
        CAB_MANAGER = 'CAB_MANAGER', 'CAB Manager'
        ADMIN = 'ADMIN', 'Admin'

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.REQUESTER)
    department = models.CharField(max_length=100, blank=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

    @property
    def is_cab(self):
        return self.role in [self.Role.CAB_MEMBER, self.Role.CAB_MANAGER]
