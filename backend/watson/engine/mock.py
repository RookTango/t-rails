import time
from .base import WatsonEngineBase

class MockWatsonEngine(WatsonEngineBase):

    def generate_authorize_checklist(self, change_data: dict) -> dict:
        time.sleep(0.8)
        title = change_data.get('title', '')
        change_type = change_data.get('change_type', 'NORMAL')
        risk = change_data.get('risk_level', 'MEDIUM')
        tasks = change_data.get('tasks', [])

        items = [
            {"order": 1, "category": "Pre-Implementation", "description": "Confirm rollback plan is documented and reviewed by the assigned implementer.", "rationale": f"Risk level is {risk}. A tested rollback plan is mandatory before authorization."},
            {"order": 2, "category": "Pre-Implementation", "description": "Verify planned maintenance window does not overlap with critical business operations.", "rationale": "Scheduling conflict check based on planned_start and planned_end fields."},
            {"order": 3, "category": "Technical Readiness", "description": "Ensure all required access credentials and permissions are provisioned for the implementer.", "rationale": f"Change '{title}' indicates system-level access will be required."},
            {"order": 4, "category": "Technical Readiness", "description": "Validate that a backup of all affected systems/configurations is taken prior to implementation.", "rationale": "Standard requirement for all change types."},
            {"order": 5, "category": "Communication", "description": "Confirm stakeholder notification has been sent at least 24 hours before planned start.", "rationale": "Communication SLA requirement based on change priority."},
        ]

        for i, task in enumerate(tasks):
            items.append({"order": 10 + i, "category": "Task Verification", "description": f"Task '{task.get('title', '')}': Verify completion criteria are clearly defined and measurable.", "rationale": "Watson detected task may lack explicit acceptance criteria."})

        if change_type == 'EMERGENCY':
            items.append({"order": 99, "category": "Emergency Controls", "description": "Emergency CAB approval must be documented with at least 2 CAB member sign-offs.", "rationale": "Emergency change type triggers elevated authorization requirements."})

        return {"items": items, "model": "watson-mock-v1", "confidence": 0.91}

    def evaluate_implementation(self, change_data: dict, checklist: dict, evidence: dict) -> dict:
        time.sleep(0.8)
        comments = evidence.get('comments', [])
        attachments = evidence.get('attachments', [])
        results = []

        for item in checklist.get('items', []):
            item_id = item.get('id')
            description = item.get('description', '').lower()
            category = item.get('category', '')
            has_screenshot = any(a.get('attachment_type') == 'SCREENSHOT' for a in attachments)
            has_evidence = any(a.get('attachment_type') == 'EVIDENCE' for a in attachments)
            comment_count = len(comments)

            if 'rollback' in description and has_evidence:
                result, note = 'PASS', 'Evidence attachment confirms rollback procedure was executed.'
            elif 'backup' in description and has_screenshot:
                result, note = 'PASS', 'Screenshot evidence shows backup completion.'
            elif 'notification' in description and comment_count > 0:
                result, note = 'PASS', f'{comment_count} activity entries indicate stakeholder communication occurred.'
            elif 'task' in category.lower() and comment_count >= 2:
                result, note = 'PASS', 'Sufficient task activity recorded in the change stream.'
            elif comment_count == 0 and not has_screenshot:
                result, note = 'FAIL', 'No activity, comments, or attachments found to verify this item.'
            else:
                result, note = 'PENDING', 'Insufficient evidence. Manual review recommended.'

            results.append({"id": item_id, "result": result, "evidence_note": note})

        return {"results": results, "model": "watson-mock-v1", "confidence": 0.87}
