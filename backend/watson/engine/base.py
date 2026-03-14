from abc import ABC, abstractmethod


class WatsonEngineBase(ABC):

    @abstractmethod
    def generate_checklist(self, change_data: dict) -> dict:
        """
        Analyse change_data and return a structured checklist dict:
        {
          "domain": str,
          "groups": [ {code, title, phase, group_type, task_ref, items: [...]} ],
          "model": str,
          "confidence": float,
          "source_notes": str,
        }
        """
        pass

    @abstractmethod
    def passive_score(self, change_data: dict, checklist_items: list) -> list:
        """
        Read change activity and auto-score accepted checklist items.
        Returns list of {item_id, result, watson_note, evidence_used, auto_scored}
        """
        pass

    # Legacy compat — delegates to new methods
    def generate_authorize_checklist(self, change_data: dict) -> dict:
        return self.generate_checklist(change_data)

    def evaluate_implementation(self, change_data, checklist, evidence) -> dict:
        return {'results': [], 'model': self.__class__.__name__, 'confidence': 0.0}
