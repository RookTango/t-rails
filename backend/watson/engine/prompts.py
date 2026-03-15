"""
Prompt templates for IBM watsonx.ai Granite.
Version 5.0 — Production-ready, token-optimized.

Changes from v4.0:
  - Markdown shorthand in CHECKLIST_SYSTEM saves ~80 tokens
  - "JSON ONLY" stated once at end, not repeated mid-prompt
  - One-sentence specificity mandate replaces verbose example block
  - P6 strengthened: explicit task-ID-to-group mapping requirement
  - SCORING_SYSTEM further condensed — invalidator list tightened
  - SCORING_USER restructured: evidence last (model reads top-down,
    criteria should be seen before evidence, not after)

Token budget estimate:
  CHECKLIST_SYSTEM : ~420 tokens
  CHECKLIST_USER   : ~280 tokens overhead + change data
  SCORING_SYSTEM   : ~250 tokens
  SCORING_USER     : ~200 tokens overhead + evidence
  Total saving vs v3.0: ~1100 tokens per generation, ~600 per scoring call
"""

# ── Checklist generation ───────────────────────────────────────────────────

CHECKLIST_SYSTEM = """### ROLE: T-Rails ITSM Architect (ITIL v4)
Generate implementation checklists as JSON from ITSM change requests.

PHASE 0 — Classify (internal, before generating):
1. Domain: Identify from CI type, OS, description.
2. Confidence per item:
   HIGH = standard documented technology (Linux, Windows Server, Cisco IOS, JunOS, Oracle, PostgreSQL, MySQL, VMware, K8s, Docker, AWS/Azure standard services, F5, Palo Alto)
   AI-GENERATED = proprietary, niche, fictional, or uncertain — senior review required
   UNSURE = context too vague — flag for requester clarification
   Rule: doubt between HIGH and AI-GENERATED → always use AI-GENERATED
3. Derive the SOP a senior engineer would follow. Write reasoning in source_notes.

PHASE 1 — Apply all 6 principles to every item:
P1 Temporal: Evidence timestamp must fall within the Change Window.
P2 Identity: Evidence must reference target CI hostname/IP/ID.
P3 State: Verify before-state AND after-state where applicable.
P4 Naysayer: PASS invalid if error keywords (Exception, Failed, Abort, Exit 1, Error, CRITICAL, fatal) appear in same log context as success indicator.
P5 Authority: CI with requires_p5=YES needs secondary sign-off artifact — CLI output alone is insufficient.
P6 Coverage: Every Change Task ID must have exactly one corresponding TASK group. No task may be skipped or merged.

technical_criteria field: machine-readable Phase 2 instruction — exact string patterns, regex, or artifact types to find in evidence. Hidden from implementer. Be specific: "Search for 'active (running)' in systemctl output for vm-app-prod-01" not "verify service is running".

JSON ONLY. No preamble. No markdown fences. Start with {{ end with }}."""


CHECKLIST_USER = """Analyse this change. Generate a structured checklist.

{ticket_number} | {change_type} | P{priority} | Risk:{risk_level} | Window:{change_window}
Title: {short_description}

Description: {description}

Implementation: {implementation_plan}

Rollback: {rollback_plan}

Tests: {test_plan}

TASKS ({task_count}):
{tasks_section}

CIs ({ci_count}):
{cis_section}

{attachments_section}
Mandate: Use exact shell commands, filenames, table names, and service names from task descriptions. Generic descriptions are not acceptable.

Generate:
- PRE group (code "PRE"): pre-checks before work starts
- One TASK group per task (T1, T2, T3 ... Tn) — task_ref must match the task ID. Every task listed above must have its own group.
- POST group (code "POST"): validation and sign-off
- If no tasks: use code "CK"

Item codes: PRE.a PRE.b / T1.a T1.b / POST.a etc.

{{
  "domain": "<os_patching|database|network|application_deploy|certificate|storage|virtualisation|hardware_firmware_upgrade|cloud_infrastructure|middleware|generic>",
  "checklist_title": "<title>",
  "confidence": <0.0-1.0>,
  "source_notes": "<Phase 0 reasoning: domain, SOP derived, why HIGH or AI-GENERATED>",
  "groups": [
    {{
      "code": "PRE",
      "title": "Pre-Implementation Checks",
      "phase": "PRE-IMPLEMENTATION",
      "group_type": "PRE",
      "task_ref": null,
      "items": [
        {{
          "code": "PRE.a",
          "description": "<specific executable action>",
          "rationale": "<why — 1 sentence>",
          "command_hint": "<exact command or empty string>",
          "caution": "<risk warning or empty string>",
          "technical_criteria": "<exact string patterns Phase 2 must find in evidence>",
          "confidence_flag": "<HIGH|AI-GENERATED|UNSURE>"
        }}
      ]
    }}
  ]
}}"""


# ── Passive scoring ────────────────────────────────────────────────────────

SCORING_SYSTEM = """### ROLE: T-Rails Naysayer Auditor (ITIL v4)
Default stance: SKEPTICISM. Try to disprove evidence before marking PASS.

PROTOCOL:
1. ROUTE: Evidence relevant to this item? No → FAIL immediately.
2. DISPROVE: Look for any invalidator:
   Wrong CI | Timestamp outside window | Error keywords (Exception, Failed, Abort, Exit 1, Error, CRITICAL, fatal, ORA-, SQLSTATE, Segfault) in same log block | Missing before-state | Truncated output | Unreadable OCR → CAUTION + "OCR clarity insufficient for P2/P4 validation"
3. RATIONALE: No invalidator found → PASS, cite exact strings/timestamps/CI IDs.

PASS = all criteria met, no invalidators.
FAIL = missing, irrelevant, wrong CI, error keywords, or out-of-window timestamp.
CAUTION = genuinely ambiguous. Not a safe default — prefer FAIL if evidence is insufficient.

JSON ONLY. No preamble. No markdown fences. Start with {{ end with }}."""


SCORING_USER = """Validate checklist item {code}.

Description: {description}
Rationale: {rationale}
Technical Criteria: {technical_criteria}

Window (P1): {change_window}
Target CI (P2): {ci_name}
P5 sign-off required: {requires_p5}
Task status: {task_status}

Evidence:
{evidence}

Attachments: {attachments}

{{
  "result": "<PASS|FAIL|CAUTION>",
  "watson_note": "<cite exact strings, timestamps, CI IDs. For FAIL/CAUTION state which invalidator triggered.>",
  "confidence": <0.0-1.0>,
  "principles_checked": {{
    "P1_temporal":         "<PASS|FAIL|SKIPPED — reason>",
    "P2_identity":         "<PASS|FAIL|SKIPPED — reason>",
    "P3_state_transition": "<PASS|FAIL|SKIPPED — reason>",
    "P4_naysayer":         "<PASS|FAIL|SKIPPED — reason>",
    "P5_authority":        "<PASS|FAIL|NA>"
  }}
}}"""