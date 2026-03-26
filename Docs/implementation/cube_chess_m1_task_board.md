# Cube Chess Milestone 1 Task Board

Milestone: `M1 - Board and State Core`
Duration target: `4-5 days`
Source plan: `Docs/implementation/cube_chess_implementation_plan.md`

## 1. Milestone Goal
Deliver a stable board-state foundation with deterministic 3D coordinates, occupancy tracking, and canonical 4-player starting formation.

## 2. Definition of Done
- Core data models compile and are unit tested.
- Occupancy map guarantees at most one piece per voxel.
- Formation generator produces valid opening layout for all 4 factions.
- Test suite validates bounds, uniqueness, and piece counts.
- M1 artifacts are documented and ready for M2 movement engine integration.

## 3. Ticket Board
| ID | Title | Est. | Owner | Depends On | Status |
|---|---|---:|---|---|---|
| M1-001 | Define canonical coordinate and enums | 0.5d | Core | None | Todo |
| M1-002 | Implement piece and match state models | 0.5d | Core | M1-001 | Todo |
| M1-003 | Build occupancy map with validation API | 1.0d | Core | M1-002 | Todo |
| M1-004 | Implement corner formation generator | 1.0d | Rules | M1-001, M1-002 | Todo |
| M1-005 | Add state initialization pipeline | 0.5d | Core | M1-003, M1-004 | Todo |
| M1-006 | Unit tests: bounds, uniqueness, counts | 1.0d | QA/Core | M1-002, M1-003, M1-004 | Todo |
| M1-007 | Integration test: full starting state bootstrap | 0.5d | QA/Core | M1-005, M1-006 | Todo |
| M1-008 | Technical notes and handoff to M2 | 0.25d | Core | M1-007 | Todo |

## 4. Ticket Details
### M1-001 - Define canonical coordinate and enums
Scope:
- Create `Coord3` structure with `x, y, z` in `[0..7]`.
- Add `PieceType` enum: `King, Queen, Rook, Bishop, Knight`.
- Add `PlayerId` enum: `Yellow, Red, Purple, Blue`.

Acceptance criteria:
- `Coord3` has bounds validator.
- Equality/hash semantics are deterministic for map/set usage.

### M1-002 - Implement piece and match state models
Scope:
- Define `Piece` entity (`id, owner, type, coord, alive`).
- Define `MatchState` (`pieces, activePlayer, eliminatedPlayers, turnCount, lastMove`).

Acceptance criteria:
- State object can represent entire opening setup.
- No nullable critical fields except documented optionals.

### M1-003 - Build occupancy map with validation API
Scope:
- Implement `OccupancyMap` keyed by `Coord3`.
- APIs: `IsOccupied`, `TryGetPieceAt`, `Place`, `Move`, `Remove`, `ValidateNoCollisions`.

Acceptance criteria:
- Duplicate placement on same voxel returns failure or throws controlled error.
- `Move` updates source and destination atomically.

### M1-004 - Implement corner formation generator
Scope:
- Generate tetrahedral 3-layer opening cluster for each player corner:
  - Layer 0: King
  - Layer 1: Queen + 2 Bishops
  - Layer 2: 2 Rooks + 2 Knights
- Map each player to correct corner orientation and inward expansion.

Acceptance criteria:
- Exactly 8 pieces per player, 32 total.
- No out-of-bounds coordinates.
- No coordinate overlap across players.

### M1-005 - Add state initialization pipeline
Scope:
- Create a single bootstrap entrypoint that:
  - Builds formation
  - Seeds `MatchState`
  - Builds occupancy
  - Sets active player (`Yellow`)

Acceptance criteria:
- One function call returns a fully valid opening state.
- Output is deterministic across runs.

### M1-006 - Unit tests: bounds, uniqueness, counts
Scope:
- Add unit tests for:
  - `Coord3` bounds
  - Occupancy collision prevention
  - Piece counts per player and globally
  - Allowed coordinate range in generated formation

Acceptance criteria:
- 100 percent pass locally.
- Failing assertions clearly identify invalid coord/piece IDs.

### M1-007 - Integration test: full starting state bootstrap
Scope:
- End-to-end test calling initialization entrypoint.
- Validate all invariants in one scenario.

Acceptance criteria:
- Verifies DoD conditions in one integration run.
- Produces stable fixture/snapshot for future regression use.

### M1-008 - Technical notes and handoff to M2
Scope:
- Record data model contracts and APIs used by movement engine.
- Document assumptions and edge-case behavior.

Acceptance criteria:
- Movement team can start `Rook` move generation without reworking M1 core.

## 5. Dependencies and Critical Path
Critical path:
1. M1-001
2. M1-002
3. M1-003 and M1-004 (parallel)
4. M1-005
5. M1-006
6. M1-007
7. M1-008

Parallelizable work:
- M1-003 and M1-004 can run in parallel once M1-002 is merged.
- Test scaffolding for M1-006 can begin during M1-003 implementation.

## 6. Risk Checks for M1
- Corner orientation bugs causing mirrored/invalid openings.
Check: add explicit expected coordinate fixtures for each player.

- Hidden occupancy collision from formation merge.
Check: `ValidateNoCollisions` in bootstrap and tests.

- Non-deterministic ID assignment causing flaky tests.
Check: deterministic piece ID generation (`<Player>-<Type>-<Index>`).

## 7. Suggested Daily Execution
Day 1:
- Complete M1-001 and M1-002.
- Start M1-003 skeleton.

Day 2:
- Complete M1-003.
- Build and validate M1-004.

Day 3:
- Complete M1-005.
- Implement majority of M1-006 tests.

Day 4:
- Finish M1-006 and M1-007.
- Fix defects from test results.

Day 5 (buffer/polish):
- Complete M1-008.
- Final review and freeze M1 baseline.

## 8. Merge Checklist
- [ ] All M1 tickets marked done.
- [ ] Unit + integration tests passing.
- [ ] No TODOs in core data model and occupancy APIs.
- [ ] API notes published for M2.
- [ ] Baseline state fixture committed.
