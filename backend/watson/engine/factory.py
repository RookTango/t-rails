from django.conf import settings
from .mock import MockWatsonEngine

def get_watson_engine():
    mode = getattr(settings, 'WATSON_MODE', 'mock')
    if mode == 'ibm':
        raise NotImplementedError("IBM Watson engine — set WATSON_MODE=mock for now")
    return MockWatsonEngine()
