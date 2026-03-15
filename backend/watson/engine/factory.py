import logging
from django.conf import settings

logger = logging.getLogger(__name__)


def get_watson_engine():
    mode = getattr(settings, 'WATSON_MODE', 'mock').lower()

    if mode == 'ibm':
        from .ibm import IBMWatsonEngine
        engine = IBMWatsonEngine()
        logger.info(f"Using IBM watsonx.ai engine: {engine.model_id}")
        return engine

    if mode == 'mock':
        from .mock import MockWatsonEngine
        logger.warning("Using mock Watson engine — set WATSON_MODE=ibm for production")
        return MockWatsonEngine()

    raise RuntimeError(
        f"Unknown WATSON_MODE '{mode}'. Set WATSON_MODE=ibm in .env"
    )