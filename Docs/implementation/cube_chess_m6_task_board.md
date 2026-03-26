# Cube Chess Milestone 6 Task Board

Milestone: `M6 - Hardening, Release Prep, and Handoff`
Duration target: `3-5 days`
Source plan: `Docs/implementation/cube_chess_implementation_plan.md`
Depends on: `Docs/implementation/cube_chess_m5_task_board.md`

## 1. Milestone Goal
Finalize a stable, measurable, and demo-ready prototype that delivers the AI "digital lava lamp" experience, supports mixed Human+AI play, and meets performance/reliability gates for release candidate signoff.

## 2. Definition of Done
- No critical crashes or deadlocks in long-run autoplay and mixed-seat scenarios.
- KPI gates are met or exceptions are documented with mitigation plans.
- Telemetry outputs are usable for post-release tuning.
- Known issues are triaged into a prioritized backlog.
- Final handoff package is complete and reproducible.

## 3. Ticket Board
| ID | Title | Est. | Owner | Depends On | Status |
|---|---|---:|---|---|---|
| M6-001 | Full regression pass across M1-M5 acceptance gates | 0.75d | QA/Core | M5 complete | Todo |
| M6-002 | Soak test expansion (250+ autoplay matches) | 0.75d | QA/Perf | M4 soak harness | Todo |
| M6-003 | Mixed-seat endurance suite (1H+3AI, 2H+2AI) | 0.5d | QA/Core | M3, M5 | Todo |
| M6-004 | Performance profiling and hotspot fixes | 0.75d | Perf/Core | M6-001, M6-002 | Todo |
| M6-005 | Telemetry summary pipeline and report template | 0.5d | Data/Core | M4-007, M5-009 | Todo |
| M6-006 | AI pacing and timeout final tuning pass | 0.5d | AI/Design | M6-002, M6-004 | Todo |
| M6-007 | UX bug bash and polish triage | 0.5d | UX/QA | M6-001 | Todo |
| M6-008 | Device matrix verification (target + fallback tiers) | 0.5d | QA/Perf | M6-004 | Todo |
| M6-009 | Release candidate checklist and go/no-go review | 0.25d | Lead/Core | M6-001..M6-008 | Todo |
| M6-010 | Final handoff bundle (docs, risks, next backlog) | 0.25d | Core | M6-009 | Todo |

## 4. Release Gates (Must Pass or Be Explicitly Waived)
### 4.1 Stability
- Crash-free soak run across `250+` autoplay matches.
- Zero deadlocks in turn scheduler and autoplay controller.
- No invalid-state assertions in match resolution.

### 4.2 Performance
- AI turn latency P95: `<= 10,000 ms`.
- AI turn latency median target: `<= 3,000 ms`.
- Full round pace median: `<= 40 seconds` at `1x`.
- Gameplay target: `60 FPS` on target mid-tier device in normal conditions.

### 4.3 Readability and UX
- Legal move comprehension: median `<= 2.0 s`.
- Mis-tap rate: `<= 8 percent`.
- Camera reorientation events: `<= 1` per turn median.
- Seat ownership clarity (Human/AI) validated in all match modes.

## 5. Ticket Details
### M6-001 - Full regression pass across M1-M5 gates
Scope:
- Re-run milestone acceptance suites and verify no regressions.

Acceptance criteria:
- Consolidated regression report with pass/fail matrix.

### M6-002 - Soak test expansion (250+ autoplay matches)
Scope:
- Execute extended autoplay soak with failure snapshot capture.

Acceptance criteria:
- No critical failures; all anomalies logged with reproduction metadata.

### M6-003 - Mixed-seat endurance suite
Scope:
- Run long-form scenarios for `1 Human + 3 AI` and `2 Human + 2 AI`.

Acceptance criteria:
- No turn ownership desync or blocked human-input states.

### M6-004 - Performance profiling and hotspot fixes
Scope:
- Profile CPU/GPU and memory in opening, dense midgame, and endgame.
- Apply targeted optimizations for hotspots.

Acceptance criteria:
- Improvements recorded with before/after metrics.

### M6-005 - Telemetry summary pipeline and report template
Scope:
- Standardize session reports for latency, round pace, mis-taps, and pause/follow usage.

Acceptance criteria:
- One-command or one-flow export for QA/design review.

### M6-006 - AI pacing and timeout final tuning pass
Scope:
- Final weight/pruning tuning to improve tempo without harming readability.

Acceptance criteria:
- Timeout frequency reduced or stable while preserving decision quality.

### M6-007 - UX bug bash and polish triage
Scope:
- Fix high-impact UX defects; categorize remaining issues.

Acceptance criteria:
- P0/P1 UX issues resolved or explicitly waived.

### M6-008 - Device matrix verification
Scope:
- Validate key flows across target and fallback device tiers.

Acceptance criteria:
- Device compatibility report complete with known limitations.

### M6-009 - Release candidate checklist and go/no-go review
Scope:
- Evaluate all release gates and unresolved risks.

Acceptance criteria:
- Explicit go/no-go decision with rationale.

### M6-010 - Final handoff bundle
Scope:
- Package docs, KPI history, risk register, and prioritized post-M6 backlog.

Acceptance criteria:
- Team can continue iteration without implicit tribal knowledge.

## 6. Risk Review
- Risk: late optimization changes introduce logic regressions.
Mitigation: rerun targeted rule/turn tests after each optimization patch.

- Risk: soak test uncovers nondeterministic edge failures.
Mitigation: seed capture, turn trace logging, and replay tooling hooks.

- Risk: UX polish requests expand scope beyond release window.
Mitigation: strict triage (P0/P1 fix, P2+ backlog) before go/no-go.

## 7. Suggested Daily Execution
Day 1:
- Complete M6-001 and start M6-002.

Day 2:
- Complete M6-002 and M6-003.
- Begin M6-004 profiling.

Day 3:
- Complete M6-004, M6-005, and M6-006.

Day 4:
- Complete M6-007 and M6-008.
- Prepare M6-009 review package.

Day 5 (buffer/signoff):
- Run M6-009 go/no-go review.
- Publish M6-010 handoff bundle.

## 8. Final Deliverables
- Release candidate build and validation report.
- KPI dashboard snapshot (latency, round pace, readability).
- Known issues and prioritized post-M6 backlog.
- Final engineering and design handoff notes.

## 9. Merge Checklist
- [ ] Regression, soak, and endurance suites completed.
- [ ] KPI gates passed or waivers documented.
- [ ] P0/P1 defects resolved.
- [ ] Go/no-go decision recorded.
- [ ] Final handoff bundle committed.
