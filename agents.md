# agents.md

This document defines agent responsibilities, infrastructure conventions, and execution rules for CubeChess.

## 1. Mission

Build CubeChess as a fast, readable 3D strategy prototype with two primary flows:
- AI-vs-AI spectator mode (digital lava lamp)
- Mixed-seat Human+AI play

## 2. Non-Negotiable Constraints

- Runtime target is mobile web with a WebGL-first renderer (Canvas 2D fallback only).
- AI turn latency P95 must remain `<= 10,000 ms`
- Median full round pace should remain `<= 40 seconds`
- Game state transitions must be deterministic and testable
- Readability takes priority over visual complexity

## 3. System Ownership

- `Core/GameState`: state model, serialization, invariants
- `Core/Rules`: move generation, collision, capture legality
- `Core/Turn`: turn order, elimination, match end logic
- `Core/AI`: evaluators, search loop, timeout fallback
- `Core/Seats`: Human/AI seat mapping and controller routing
- `Input`: human interaction pipeline and move commit validation
- `Camera`: follow choreography, orientation safety, readability controls
- `Rendering`: board/piece highlights, feedback effects, performance budget
- `Spectator`: autoplay control, speed tiers, pause/step orchestration
- `Telemetry`: metrics pipeline and reporting

## 4. Branch and PR Strategy

- `main` must remain releasable
- Use short-lived feature branches: `feat/<area>-<ticket-id>`
- One milestone ticket scope per PR when possible
- PR template should include:
  - ticket IDs addressed
  - acceptance criteria checklist
  - test evidence
  - perf impact notes

## 5. Required Test Coverage

Every significant PR should include or update:
- unit tests for local behavior
- integration tests for cross-system behavior
- deterministic behavior checks when move ordering/state ordering is affected

For AI/turn work, include:
- timeout-path tests
- mixed-seat turn-flow tests
- baseline latency measurements

## 6. Telemetry Requirements

At minimum capture:
- AI turn decision time (ms)
- full round duration (ms)
- timeout count/frequency
- mis-taps and camera reorientation events
- autoplay pause/resume and speed changes

## 7. Runtime Safety Rules

- Never commit invalid move/state transitions
- Reject out-of-turn human input
- On AI timeout, return deterministic legal fallback move
- Preserve authoritative turn state machine semantics

## 8. CI Expectations (When CI Is Added)

Pipeline stages:
1. lint/format
2. unit tests
3. integration tests
4. deterministic snapshot checks
5. performance smoke checks for turn budget regressions

Block merge if:
- tests fail
- deterministic snapshots drift unexpectedly
- AI turn budget regresses beyond agreed threshold

## 9. Milestone Execution Order

Execute according to:
1. `M1` -> `M2` -> `M3` -> `M4` -> `M5` -> `M6`

Reference docs under `Docs/implementation/` for ticket-level details.

## 10. Documentation Rule

Any change to rules, turn logic, seat behavior, or AI budget logic must update:
- relevant milestone task board
- implementation plan (if scope/targets changed)
- tests demonstrating intended behavior

