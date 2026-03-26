# Cube Chess Milestone 4 Task Board

Milestone: `M4 - AI Autoplay and Spectator Experience`
Duration target: `5-7 days`
Source plan: `Docs/implementation/cube_chess_implementation_plan.md`
Depends on: `Docs/implementation/cube_chess_m3_task_board.md`

## 1. Milestone Goal
Deliver a compelling AI-first "digital lava lamp" experience: fast, readable AI-vs-AI matches with optional human seats, strict <= 10 second AI turns, and high-confidence autoplay stability.

## 2. Definition of Done
- AI can play all seats in continuous autoplay mode.
- AI turn latency stays within budget (`<= 10,000 ms` P95 on target device).
- Spectator controls (`pause/resume`, `1x/2x/4x`, `step turn`, `follow active move`) are functional.
- Camera behavior remains readable during fast autoplay.
- Long-run autoplay soak tests complete without deadlocks, desync, or invalid state.

## 3. Ticket Board
| ID | Title | Est. | Owner | Depends On | Status |
|---|---|---:|---|---|---|
| M4-001 | Implement baseline heuristic evaluator v1 | 0.75d | AI | M3 complete | Todo |
| M4-002 | Add candidate move pruning and tie-break policy | 0.5d | AI | M4-001 | Todo |
| M4-003 | Implement budgeted AI search loop with iterative cutoff | 0.75d | AI | M4-001, M3 timeout hooks | Todo |
| M4-004 | Build autoplay controller with speed presets | 0.75d | Core/Spectator | M3 turn events | Todo |
| M4-005 | Add spectator controls (pause/resume/step/follow) | 0.5d | UX/Spectator | M4-004 | Todo |
| M4-006 | Camera follow choreography for active move | 0.75d | Camera | M4-004 | Todo |
| M4-007 | Telemetry for turn latency and round pace | 0.5d | Core/Perf | M4-003, M4-004 | Todo |
| M4-008 | AI-vs-AI integration tests (full match flows) | 0.75d | QA/AI | M4-003, M4-004 | Todo |
| M4-009 | Mixed-seat integration tests (human + AI in autoplay context) | 0.5d | QA/Core | M4-005, M4-008 | Todo |
| M4-010 | Long-run soak harness (100+ matches) | 0.75d | QA/Perf | M4-008 | Todo |
| M4-011 | AI tuning pass for pace vs readability | 0.5d | AI/Design | M4-007, M4-010 | Todo |
| M4-012 | M4 handoff notes for M5 readability polish | 0.25d | Core | M4-011 | Todo |

## 4. AI Decision Model (MVP)
### 4.1 Evaluator Signals
- Material value (King high, Queen, Rook, Bishop, Knight weighted descending).
- Mobility score (count of legal moves, weighted by piece class).
- Threat pressure (attacked enemy high-value pieces).
- King safety proxy (enemy threats near king neighborhood).
- Center influence bonus (encourage inward contesting).

### 4.2 Selection Policy
- Score all legal moves for active player.
- Keep top-K candidate set after pruning.
- Use deterministic tie-breakers (`score`, then global move ordering).
- Return best-known move at timeout boundary.

### 4.3 Budget Strategy
- Soft budget target: `3,000 ms` median.
- Hard budget cap: `10,000 ms`.
- Iterative evaluation rounds until remaining budget threshold reached.

## 5. Spectator Pacing and Controls
### 5.1 Controls
- `Pause/Resume`
- `Step Turn` (advance exactly one resolved turn)
- `Speed`: `1x`, `2x`, `4x`
- `Camera Follow`: off / active piece / active move trajectory focus

### 5.2 Pacing Targets
- Median full round (4 players): `<= 40 seconds` at `1x`.
- Camera transitions complete before next move commit in >= 95 percent of turns.
- No control-input lag spikes above `150 ms` under autoplay.

## 6. Camera Choreography Contract
- On turn start: subtle orient-to-active-player anchor.
- On move selection: short ease to origin voxel with obstruction fade.
- On move resolve: track origin -> destination with quick settle.
- On capture: prioritize destination visibility and avoid over-rotation.
- Respect player override: manual camera input cancels scripted move until next turn event.

## 7. Ticket Details
### M4-001 - Implement baseline heuristic evaluator v1
Scope:
- Implement weighted scoring function for a given resulting state.

Acceptance criteria:
- Score output is deterministic for same input state.
- Weights are externally configurable for tuning.

### M4-002 - Add candidate move pruning and tie-break policy
Scope:
- Early prune clearly dominated moves.
- Apply stable tie-break order.

Acceptance criteria:
- Pruning never removes all legal moves.
- Equal-score decisions are repeatable.

### M4-003 - Implement budgeted AI search loop with iterative cutoff
Scope:
- Evaluate candidates progressively and stop at budget edge.

Acceptance criteria:
- AI decision returns legal move before hard timeout.
- Median decision time tracks soft target in baseline test set.

### M4-004 - Build autoplay controller with speed presets
Scope:
- Loop turns automatically for AI-controlled seats.
- Apply speed multipliers to delays and animation pacing.

Acceptance criteria:
- No turn skips or duplicate commits under speed changes.

### M4-005 - Add spectator controls
Scope:
- UI and input bindings for pause/resume, step turn, follow mode.

Acceptance criteria:
- Step-turn advances exactly one full turn every invocation.

### M4-006 - Camera follow choreography
Scope:
- Implement event-driven camera cues for active piece and move resolution.

Acceptance criteria:
- Camera keeps active move readable without inducing disorientation.

### M4-007 - Telemetry for turn latency and round pace
Scope:
- Record per-turn AI latency, round duration, timeout count, control interactions.

Acceptance criteria:
- Session summary exports KPIs needed for tuning decisions.

### M4-008 - AI-vs-AI integration tests
Scope:
- Full match execution tests with all seats AI.

Acceptance criteria:
- Matches complete with valid winners and no illegal state transitions.

### M4-009 - Mixed-seat integration tests
Scope:
- Validate 1 human + 3 AI and 2 human + 2 AI scenarios with autoplay controls.

Acceptance criteria:
- Human seats remain interactive and AI seats continue autonomous turns.

### M4-010 - Long-run soak harness (100+ matches)
Scope:
- Batch-run autoplay matches with logging and failure capture.

Acceptance criteria:
- Zero deadlocks and zero invalid-state crashes in soak run.

### M4-011 - AI tuning pass for pace vs readability
Scope:
- Tune evaluator weights and pruning thresholds based on telemetry.

Acceptance criteria:
- Improved round pace without measurable readability regression.

### M4-012 - M4 handoff notes for M5 readability polish
Scope:
- Document known readability hotspots and polish priorities.

Acceptance criteria:
- M5 team can target highest-impact polish items immediately.

## 8. Risks and Mitigations
- Risk: AI becomes too fast but visually unreadable.
Mitigation: enforce minimum readable camera settle window at each speed tier.

- Risk: timeout fallback biases gameplay quality.
Mitigation: improve best-known move retention and candidate ordering.

- Risk: speed switching introduces event ordering bugs.
Mitigation: central event queue with monotonic turn/phase IDs.

- Risk: long-run memory growth during autoplay.
Mitigation: periodic object pooling audits and telemetry buffer caps.

## 9. Suggested Daily Execution
Day 1:
- Complete M4-001 and M4-002.
- Start M4-003.

Day 2:
- Complete M4-003 and M4-004.

Day 3:
- Complete M4-005 and M4-006.
- Start telemetry (M4-007).

Day 4:
- Complete M4-007, M4-008, and M4-009.

Day 5:
- Run soak harness (M4-010).
- Execute tuning pass (M4-011).

Day 6-7 (buffer):
- Stabilization, defect fixes, and M4-012 handoff.

## 10. Merge Checklist
- [ ] AI evaluator, pruning, and budgeted selection merged.
- [ ] Autoplay controls and speed tiers validated.
- [ ] Camera follow choreography merged with manual override behavior.
- [ ] KPIs captured for turn latency and round pace.
- [ ] Soak run completed (100+ matches) with no critical failures.
- [ ] Handoff notes published for M5.
