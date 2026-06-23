"""A4 — content guardrails (brand-safety enforcement).

The content prompt *asks* the model to stay grounded and on-brand; this package
*enforces* it after generation, so a slip never reaches the approval gate — and,
once auto-publishing is on, never reaches the public.
"""

from .checks import GuardrailResult, GuardrailViolation, check_content, scan_input

__all__ = ["GuardrailResult", "GuardrailViolation", "check_content", "scan_input"]
