"""Approval-gate logic does NOT live here.

The two human gates are implemented as LangGraph interrupt nodes in
`mrk18_execution.graph.analysis` (gate1, gate2) and driven/resumed via
`mrk18_execution.graph.lifecycle` (resume_gate1, mint_gate2_decisions,
resume_gate2_drive, expire_stale_approvals). The independent publish-time
re-verification of approvals lives in `mrk18_execution.publishers.base`
(verify_approval). This package is intentionally empty — kept only so the
import path reserved in SYSTEM_ARCHITECTURE.md exists.
"""
