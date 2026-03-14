import logging
from django.conf import settings
from .mock import MockWatsonEngine

logger = logging.getLogger(__name__)


def get_watson_engine():
    mode = getattr(settings, 'WATSON_MODE', 'mock').lower()

    if mode == 'ibm':
        try:
            from .ibm import IBMWatsonEngine
            engine = IBMWatsonEngine()
            logger.info(f"Using IBM watsonx.ai engine: {engine.model_id}")
            return engine
        except Exception as e:
            logger.error(f"IBM Watson engine init failed: {e}. Falling back to mock.")
            return MockWatsonEngine()

    logger.info("Using mock Watson engine")
    return MockWatsonEngine()
