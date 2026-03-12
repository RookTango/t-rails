from abc import ABC, abstractmethod

class WatsonEngineBase(ABC):
    @abstractmethod
    def generate_authorize_checklist(self, change_data: dict) -> dict:
        pass

    @abstractmethod
    def evaluate_implementation(self, change_data: dict, checklist: dict, evidence: dict) -> dict:
        pass
