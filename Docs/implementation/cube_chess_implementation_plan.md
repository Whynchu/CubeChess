# Cube Chess Implementation Plan

Source design: `Docs/design/cube_chess_full_3_d_voxel_design_doc.html`

## 1. Purpose
Translate the Cube Chess design into a buildable, testable execution plan for a mobile-first web prototype (WebGL-first) where the primary experience is watching AI factions play fast, readable matches (a "digital lava lamp" strategy loop), with a path to production.

## 2. Product Pillars
- Full 3D voxel gameplay, not 2D rules in a 3D shell.
- Readability first: players must quickly understand position, ownership, and legal actions.
- Fast tactical turns with clear interaction and feedback.
- AI-first spectator flow: autoplay matches are compelling to watch without manual input.
- Play-with-AI flow: humans can join seats and play in mixed matches with AI.
- Hard turn-time budget: each player action resolves in <= 10 seconds.

## 3. Scope Definition
### 3.1 MVP In Scope
- 8x8x8 board (512 voxels) with occupancy model.
- 4 players with corner-based starting formations.
- Piece set per player: 1 King, 1 Queen, 2 Rooks, 2 Bishops, 2 Knights.
- Legal move generation with collision and capture rules.
- Turn system with baseline order: Yellow -> Red -> Purple -> Blue.
- Elimination condition: king capture.
- AI-vs-AI autoplay mode as a first-class mode.
- Human+AI mixed-seat matches (any seat can be Human or AI).
- Baseline heuristic AI policy per faction (material + mobility + king safety weighting).
- Spectator controls: pause/resume, turn speed, camera follow active move.
- Mobile touch flow: rotate -> select -> preview legal moves -> commit move.
- Readability overlays: occupied cells, legal/capture markers, last move, obstruction fade.

### 3.2 Out of Scope (MVP)
- Matchmaking and online multiplayer.
- Advanced AI training pipelines (self-play reinforcement learning, distributed search).
- Cosmetics, progression systems, store, battle pass, guilds.
- Alternative rule variants (checkmate mode, teams, custom board sizes).

AI progression beyond the MVP baseline heuristic is tracked separately in:
- `Docs/implementation/cube_chess_ai_champion_plan.md`

## 4. Technical Architecture
### 4.1 Core Runtime Modules
- `GameState`: immutable or transaction-safe board snapshot and metadata.
- `RulesEngine`: legal move generation, collision resolution, capture legality.
- `TurnSystem`: active player rotation, eliminated-player skipping, win detection.
- `SeatController`: seat ownership map (Human/AI) and runtime seat switching hooks.
- `AISystem`: move scoring and selection under turn budget.
- `AutoplayController`: match loop scheduling, pause/resume, speed multiplier.
- `FormationSystem`: canonical corner setup generation and validation.
- `InteractionController`: touch/raycast select-confirm loop.
- `CameraController`: orbit, pitch clamp, angle snap, focus assist.
- `BoardView`: voxel grid, piece instances, highlight layers, animation events.
- `Telemetry`: interaction timing, move comprehension metrics, camera recovery events, AI decision latency.

### 4.2 Platform Decision
- Runtime target: Web (mobile browsers on iOS and Android).
- Rendering: WebGL-first (Canvas 2D fallback for constrained devices).
- Language/tooling baseline: TypeScript + browser runtime + optional Web Worker for AI budgets.

### 4.3 Data Model (Engine-Agnostic)
- `Coord3`: `(x:int, y:int, z:int)` with range `[0..7]`.
- `Piece`: `{id, owner, type, coord, alive}`.
- `Voxel`: `{coord, occupantPieceId?}`.
- `SeatMode`: `{player, controllerType}` where `controllerType` in `{Human, AI}`.
- `MatchState`: `{pieces, activePlayer, eliminatedPlayers, turnCount, lastMove}`.
- `Move`: `{pieceId, from, to, isCapture, capturedPieceId?}`.
- `AITurnMetrics`: `{player, decisionMs, candidateCount, selectedScore}`.

### 4.4 Rules Contract
- One piece per voxel.
- Friendly destination occupied = illegal.
- Enemy destination occupied = legal capture if movement pattern allows.
- Sliding pieces stop at first occupied voxel.
- Knights ignore intervening occupancy and validate destination only.
- If a non-eliminated player has no legal moves, the turn auto-passes.
- Human turn timeout: 60 seconds (configurable), then auto-pass if no valid move is confirmed.

## 5. Milestone Plan
### Milestone 0: Project Bootstrap (2-3 days)
Deliverables:
- Repository structure for runtime, tests, and content.
- Web runtime bootstrap for iOS Safari and Android Chrome (with PWA-friendly packaging path).
- Minimal scene with camera and empty board bounds.

Acceptance criteria:
- App launches in mobile browsers on iOS and Android test devices/simulators.
- Debug overlay shows FPS and touch points.

### Milestone 1: Board and State Core (4-5 days)
Deliverables:
- `Coord3`, `Piece`, `MatchState` models.
- Board occupancy map with fast lookup.
- Starting formation generator for 4 corners.

Acceptance criteria:
- Unit tests validate 512-cell bounds and no duplicate occupancy.
- Formation places exactly 32 pieces total with valid ownership and coordinates.

### Milestone 2: Movement Engine (5-7 days)
Deliverables:
- Move generation sequence: Rook -> Bishop -> Queen -> Knight -> King.
- Collision and capture resolution integrated into move generation.
- Per-piece regression tests on synthetic board states.

Acceptance criteria:
- 100 percent pass on movement test suite.
- No illegal move returned under blocked/friendly-occupied conditions.

### Milestone 3: Turn, Seat Control, and Elimination Rules (3-4 days)
Deliverables:
- Ordered turn rotation with skip-eliminated logic.
- King capture elimination and end-of-match winner detection.
- Seat ownership map (Human/AI per player).
- Turn handoff logic to either human input controller or AI controller.
- Per-turn time-box hooks for AI execution.

Acceptance criteria:
- Integration tests for elimination and winner declaration.
- Turn sequence remains valid after one or more eliminations.
- Human turns wait for valid input while AI turns auto-resolve.
- Turn manager can enforce AI timeout fallback move at <= 10,000 ms.

### Milestone 4: AI Autoplay and Spectator Loop (5-7 days)
Deliverables:
- Baseline heuristic AI move scorer and selector.
- AI-vs-AI continuous autoplay loop for 4 factions.
- Spectator controls: pause/resume, speed presets, follow-active-piece camera option.
- Turn-time budgeting and timeout fallback behavior.

Follow-on AI strengthening after the baseline spectator loop is documented in:
- `Docs/implementation/cube_chess_ai_champion_plan.md`

Acceptance criteria:
- AI completes turns at <= 10 seconds each (P95 on target device).
- Full AI-vs-AI match runs start-to-finish without manual input.
- Spectator can adjust speed without desync or rule errors.

### Milestone 5: Interaction and Camera Readability (5-7 days)
Deliverables:
- Touch selection and move commit flow.
- Legal/capture voxel indicators.
- Orbit camera with pitch limits and optional angle snap.
- Obstruction fade and selected-piece focus assist.

Acceptance criteria:
- Test users identify selected voxel immediately in playtests.
- Users identify legal move options within approximately 2 seconds.
- Rotation recovery is reliable (no frequent orientation loss reports).

### Milestone 6: Hardening, Release Prep, and Handoff (3-5 days)
Deliverables:
- Full regression pass across M1-M5 acceptance gates.
- Soak and endurance suites (AI autoplay and mixed-seat).
- Performance hotspot fixes and telemetry summary pipeline.
- Release candidate go/no-go review and final handoff bundle.

Acceptance criteria:
- No critical crashes or deadlocks in long-run runs.
- KPI gates met or documented with explicit waivers and mitigations.
- Final handoff package is complete and reproducible.

## 6. Testing Strategy
### 6.1 Automated
- Unit tests: movement vectors, collision behavior, bounds checks.
- Integration tests: full turn lifecycle, seat control flow, elimination flow, win resolution.
- Determinism tests: same seed/state produces same legal move set.
- AI budget tests: decision loop stays within configured per-turn time limit.

### 6.2 Manual Playtest Scripts
- Script A: Rook lane readability under high density.
- Script B: Bishop diagonal comprehension across depth.
- Script C: Queen pressure near center convergence.
- Script D: Knight jump comprehension and destination confidence.
- Script E: King survival and elimination clarity.
- Script F: 1 human + 3 AI mixed-seat full match.

### 6.3 Performance Gates
- Target frame rate: 60 FPS gameplay.
- Input-to-highlight latency target: <= 100 ms.
- Move resolution feedback completion: <= 180 ms.
- AI turn decision time target: <= 10,000 ms per player (P95), <= 3,000 ms median target.
- Full round pace target: <= 40 seconds for 4-player complete turn cycle (median).

## 7. Readability KPIs
- Time-to-understand-legal-moves: median <= 2.0 s.
- Mis-tap rate on destination selection: <= 8 percent.
- Camera reorientation events per turn: <= 1 on median.
- "Could not find piece after rotate" feedback: trending to zero by Milestone 5.
- Spectator engagement proxy: autoplay sessions reach >= 3 full rounds without pause/exit in baseline tests.

## 8. Risk Register
- Camera disorientation in dense center combat.
Mitigation: angle snap option, selected-piece recenter, obstruction fade.

- Visual overload from 3D indicators.
Mitigation: hierarchy in highlights (selected > legal > capture > last move).

- Rule ambiguity in multiplayer elimination.
Mitigation: explicit turn-state banner and elimination event messaging.

- Device performance variance.
Mitigation: quality tiers, pooled VFX, reduced transparency path.

- AI decision latency spikes on dense boards.
Mitigation: candidate pruning, iterative deepening cutoff, timeout fallback to best-known move.

## 9. Suggested Repository Layout
```text
Docs/
  design/
  implementation/
    cube_chess_implementation_plan.md
Runtime/
  Core/
    GameState/
    Rules/
    Turn/
    AI/
    Seats/
  Input/
  Camera/
  Rendering/
  Spectator/
Tests/
  Unit/
  Integration/
  Performance/
Content/
  Pieces/
  VFX/
  UI/
```

## 10. Execution Cadence
- Weekly planning: lock milestone goals and test cases.
- Mid-week checkpoint: assess KPI movement and blocker status.
- End-week review: demo build, test report, risk update, next-week cut list.

## 11. Immediate Next Actions
1. Lock WebGL renderer architecture (pipeline, shaders, fallback path) and complete browser smoke checks.
2. Implement Milestone 1 data models and formation generator.
3. Build movement test harness and complete rook-first validation.
4. Implement AI move scoring stub and wire AI turn budget timer.
5. Build autoplay loop and verify <= 10 second P95 turn time on device.
6. Implement seat controller and validate 1 human + 3 AI match flow.



