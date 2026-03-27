# Cube Chess Milestone 3 Task Board

Milestone: `M3 - Turn, Seat Control, and Elimination`
Duration target: `3-4 days`
Source plan: `Docs/implementation/cube_chess_implementation_plan.md`
Depends on: `Docs/implementation/cube_chess_m2_task_board.md`

## 1. Milestone Goal
Build the authoritative turn scheduler with elimination logic, strict AI timeout enforcement (<= 10s), and mixed-seat control so humans can play alongside AI.

## 2. Definition of Done
- Turn order is deterministic and skips eliminated players.
- Seat model supports Human/AI assignment per player.
- Active turn routes to correct controller (human input or AI decision).
- AI turn timeout fallback resolves within <= 10,000 ms.
- Mixed-seat matches (for example, 1 human + 3 AI) run end-to-end.

## 3. Ticket Board
| ID | Title | Est. | Owner | Depends On | Status |
|---|---|---:|---|---|---|
| M3-001 | Define seat model and controller contract | 0.5d | Core | M2 complete | Done |
| M3-002 | Implement authoritative turn state machine | 0.75d | Core | M3-001 | Done |
| M3-003 | Add elimination and winner resolution | 0.5d | Core | M3-002 | Done |
| M3-004 | Human turn gate and input readiness checks | 0.5d | Input/Core | M3-002 | Done |
| M3-005 | AI turn runner with budget timer and cancellation | 0.75d | AI/Core | M3-002 | Done |
| M3-006 | Timeout fallback move policy (safe best-known move) | 0.5d | AI/Core | M3-005 | Done |
| M3-007 | Seat configuration interface (pre-match) | 0.5d | UX/Core | M3-001, M3-004 | Done |
| M3-008 | Integration tests: mixed-seat turn flow | 0.75d | QA/Core | M3-003..M3-007 | Done |
| M3-009 | Performance tests: AI timeout and round pace | 0.5d | QA/Perf | M3-005, M3-006 | Done |
| M3-010 | Handoff notes for M4 autoplay/spectator | 0.25d | Core | M3-008, M3-009 | Done |

## 4. Core Contracts
### 4.1 Seat Ownership
- `SeatMode`: `{ player, controllerType }`
- `controllerType`: `Human | AI`
- Immutable during active match for MVP (set at match start).

### 4.2 Turn Lifecycle
1. `TurnStart(activePlayer)`
2. Resolve active seat controller
3. If Human: wait for validated move commit
4. If AI: start decision task with timeout budget
5. Commit move and emit turn result
6. Apply elimination check
7. Advance to next non-eliminated player

### 4.3 Timeout Policy
- AI budget hard cap: `10,000 ms`.
- On timeout:
  - Use best-known legal move from partial search, else
  - Use deterministic fallback (first legal move by global ordering).
- If no legal moves exist, emit pass/stalemate-compatible event per rules.

## 5. Ticket Details
### M3-001 - Define seat model and controller contract
Scope:
- Add seat assignment model and controller interface:
  - `RequestMove(state, budgetMs)` for AI
  - `AwaitHumanMove(state)` for human pathway

Acceptance criteria:
- Controller abstraction is independent of UI scene code.

### M3-002 - Implement authoritative turn state machine
Scope:
- Centralized turn progression with explicit states:
  - `Idle`, `AwaitingHumanMove`, `AwaitingAIMove`, `ResolvingMove`, `MatchEnded`

Acceptance criteria:
- Invalid state transitions are rejected and logged.
- Deterministic order preserved after every turn.

### M3-003 - Add elimination and winner resolution
Scope:
- King capture elimination updates player status.
- Winner determined when one player remains.

Acceptance criteria:
- Eliminated players never receive future turns.

### M3-004 - Human turn gate and input readiness checks
Scope:
- Human input only enabled on active human seat turn.
- Reject inputs from non-active seats.

Acceptance criteria:
- No out-of-turn human move can be committed.

### M3-005 - AI turn runner with budget timer and cancellation
Scope:
- Start AI selection task with stopwatch and cancellation token.
- Return selected move or timeout outcome.

Acceptance criteria:
- AI never blocks main turn loop beyond configured budget.

### M3-006 - Timeout fallback move policy
Scope:
- Implement best-known move cache during AI evaluation.
- Deterministic fallback if evaluation incomplete.

Acceptance criteria:
- Timeout path always returns a legal move when one exists.

### M3-007 - Seat configuration interface (pre-match)
Scope:
- Add startup config for each player seat (`Human` or `AI`).
- MVP presets: `4 AI`, `1 Human + 3 AI`, `2 Human + 2 AI`.

Acceptance criteria:
- Match starts with selected seat mapping and persists for match duration.

### M3-008 - Integration tests: mixed-seat turn flow
Scope:
- Scenario tests for:
  - 4 AI autoplay turns
  - 1 human + 3 AI alternation
  - elimination and skip behavior in mixed seats

Acceptance criteria:
- All scenarios pass deterministically with fixed seeds.

### M3-009 - Performance tests: AI timeout and round pace
Scope:
- Measure per-turn latency and 4-player round duration.

Acceptance criteria:
- P95 AI turn <= 10,000 ms.
- Median full round <= 40 seconds.

### M3-010 - Handoff notes for M4 autoplay/spectator
Scope:
- Document event hooks for camera follow, UI turn banners, and speed control integration.

Acceptance criteria:
- M4 can consume turn events without changing M3 contracts.

## 6. Risks and Mitigations
- Risk: human input race conditions during AI turns.
Mitigation: strict turn-state gate in input pipeline.

- Risk: AI timeout path returns inconsistent behavior.
Mitigation: deterministic fallback order and timeout integration tests.

- Risk: elimination edge cases break turn rotation.
Mitigation: property tests over randomized elimination sequences.

## 7. Suggested Daily Execution
Day 1:
- Complete M3-001 and M3-002.
- Start M3-003.

Day 2:
- Complete M3-003, M3-004, M3-005.

Day 3:
- Complete M3-006 and M3-007.
- Start integration tests (M3-008).

Day 4:
- Complete M3-008, M3-009, and M3-010.
- Fix defects and lock baseline.

## 8. Merge Checklist
- [x] Turn state machine and seat controller merged.
- [x] Human and AI turn routing validated.
- [x] AI timeout enforcement and fallback validated.
- [x] Mixed-seat integration tests passing.
- [x] P95 turn and round pace metrics recorded.
- [x] M4 handoff notes published.

