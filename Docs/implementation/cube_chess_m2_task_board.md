# Cube Chess Milestone 2 Task Board

Milestone: `M2 - Movement Engine`
Duration target: `5-7 days`
Source plan: `Docs/implementation/cube_chess_implementation_plan.md`
Depends on: `Docs/implementation/cube_chess_m1_task_board.md`

## 1. Milestone Goal
Implement deterministic legal move generation for all piece families with correct 3D movement vectors, collision behavior, and capture legality, while keeping move generation performant enough to support AI turns within the <= 10 second budget.

## 2. Definition of Done
- Move generators implemented in order: Rook -> Bishop -> Queen -> Knight -> King.
- Sliding pieces stop at first occupied voxel and support legal captures.
- Knights ignore intervening occupancy and validate destination only.
- Generated legal move set excludes friendly-occupied destinations.
- Movement unit and integration tests pass with deterministic outputs.
- Legal move generation baseline performance is profiled and recorded for AI consumers.

## 3. Ticket Board
| ID | Title | Est. | Owner | Depends On | Status |
|---|---|---:|---|---|---|
| M2-001 | Define movement contracts and shared utilities | 0.5d | Rules | M1 complete | Todo |
| M2-002 | Implement direction vectors for sliding pieces | 0.5d | Rules | M2-001 | Todo |
| M2-003 | Implement rook legal move generator | 0.75d | Rules | M2-002 | Todo |
| M2-004 | Implement bishop legal move generator | 0.75d | Rules | M2-002 | Todo |
| M2-005 | Implement queen legal move generator | 0.5d | Rules | M2-003, M2-004 | Todo |
| M2-006 | Implement knight legal move generator | 0.75d | Rules | M2-001 | Todo |
| M2-007 | Implement king legal move generator | 0.5d | Rules | M2-001 | Todo |
| M2-008 | Add move filtering and legality guards | 0.5d | Rules | M2-003..M2-007 | Todo |
| M2-009 | Build movement unit test matrix | 1.0d | QA/Rules | M2-003..M2-008 | Todo |
| M2-010 | Integration test: legal moves from initialized state | 0.75d | QA/Core | M2-009 | Todo |
| M2-011 | Add deterministic regression fixtures | 0.5d | QA/Rules | M2-010 | Todo |
| M2-012 | M2 handoff notes for turn + interaction systems | 0.25d | Rules | M2-011 | Todo |
| M2-013 | Add movement performance benchmark harness | 0.5d | QA/Rules | M2-008 | Todo |

## 4. Movement Contracts
### 4.1 Core API
- `GetLegalMoves(matchState, pieceId) -> Move[]`
- `GetPseudoLegalMoves(matchState, pieceId) -> Coord3[]` (optional helper)
- `IsLegalDestination(matchState, piece, destination) -> bool`

### 4.2 Move Object
- `pieceId`
- `from: Coord3`
- `to: Coord3`
- `isCapture: bool`
- `capturedPieceId?: string`

### 4.3 Rule Guards
- Destination must be in bounds.
- Destination occupied by friendly piece is illegal.
- Sliding path cannot pass through occupied voxel.
- Capture allowed only on first encountered enemy voxel for sliding pieces.

## 5. Direction Sets (Canonical)
### 5.1 Rook Directions (6)
- Axes: `(+/-1,0,0)`, `(0,+/-1,0)`, `(0,0,+/-1)`

### 5.2 Bishop Directions (12)
- Plane diagonals:
  - XY: `(+/-1,+/-1,0)`
  - XZ: `(+/-1,0,+/-1)`
  - YZ: `(0,+/-1,+/-1)`

### 5.3 Queen Directions (26)
- All non-zero combinations where each component is in `{-1,0,1}` except `(0,0,0)`.

### 5.4 Knight Offsets
- Permutations of `(2,1,0)` with sign variations.
- Intervening occupancy ignored.

### 5.5 King Directions (26)
- Same direction set as queen but max distance = 1.

## 6. Ticket Details
### M2-001 - Define movement contracts and shared utilities
Scope:
- Add move interfaces and utility helpers (`InBounds`, `GetPieceAt`, `IsFriendly`, `IsEnemy`).
- Define deterministic move ordering contract.

Acceptance criteria:
- Shared utilities reused by all piece generators.
- Move output order is stable across runs.

### M2-002 - Implement direction vectors for sliding pieces
Scope:
- Encode and centralize direction tables for rook, bishop, queen, king.

Acceptance criteria:
- Direction table tests validate expected cardinal/diagonal counts.

### M2-003 - Implement rook legal move generator
Scope:
- Raycast along 6 axes until blocked or out-of-bounds.

Acceptance criteria:
- Includes empty voxels until first blocker.
- Includes first enemy blocker as capture and stops.
- Excludes friendly blocker destination.

### M2-004 - Implement bishop legal move generator
Scope:
- Raycast across 12 plane diagonal directions.

Acceptance criteria:
- Collision and capture behavior mirrors rook rules.

### M2-005 - Implement queen legal move generator
Scope:
- Combine rook + bishop + 3D diagonal movement into 26-direction sliding.

Acceptance criteria:
- Queen returns union of valid rays without duplicates.

### M2-006 - Implement knight legal move generator
Scope:
- Generate all legal `(2,1,0)` jump destinations.

Acceptance criteria:
- Path blockers do not affect legality.
- Friendly-occupied destinations excluded.

### M2-007 - Implement king legal move generator
Scope:
- One-step move in any of 26 adjacent directions.

Acceptance criteria:
- Only in-bounds adjacent destinations included.
- Friendly occupancy blocked, enemy occupancy capturable.

### M2-008 - Add move filtering and legality guards
Scope:
- Final legality pass for all piece outputs.
- Remove duplicates and enforce stable sort.

Acceptance criteria:
- No duplicate destinations in final set.
- No out-of-bounds output under fuzz input states.

### M2-009 - Build movement unit test matrix
Scope:
- Piece-specific tests for open board, blocked board, mixed occupancy, edge/corner positions.

Acceptance criteria:
- Every piece has positive and negative test cases.
- Failing output provides expected vs actual destination diff.

### M2-010 - Integration test: legal moves from initialized state
Scope:
- Use M1 opening state, query legal moves for representative pieces per faction.

Acceptance criteria:
- Integration results match locked expectations for baseline opening.

### M2-011 - Add deterministic regression fixtures
Scope:
- Snapshot legal move lists for curated board states.
- Use fixtures to detect accidental movement-rule drift.

Acceptance criteria:
- Fixtures can be regenerated only through explicit update command/process.

### M2-012 - M2 handoff notes for turn + interaction systems
Scope:
- Document APIs for turn manager and UI highlight systems.
- Note computational cost and caching options.

Acceptance criteria:
- M3/M4 can consume legal moves without changing rules contracts.

### M2-013 - Add movement performance benchmark harness
Scope:
- Benchmark legal move generation under low, medium, and high board density states.
- Export metrics for AI design iteration.

Acceptance criteria:
- Benchmark report records per-piece and full-position generation timings.
- Baseline timings are committed and referenced by M4 AI autoplay work.

## 7. Test Matrix Requirements
- Board positions covered:
  - center, face center, edge, corner
- Occupancy cases:
  - empty path
  - friendly blocker at distance 1
  - friendly blocker at distance n
  - enemy blocker at distance 1
  - enemy blocker at distance n
  - mixed blockers across multiple rays
- Piece count:
  - all 5 piece types validated in each occupancy category where applicable

## 8. Determinism and Ordering Policy
- Sort legal moves by `(x, y, z)` ascending after generation, or by deterministic direction then distance.
- Use one global policy; do not vary by piece type.
- Tests assert exact order, not just set membership.

## 9. Risks and Mitigations
- Risk: subtle queen-direction omissions in 3D diagonals.
Mitigation: auto-generate queen direction table from component permutations and assert count `26`.

- Risk: duplicate destinations from merged ray sets.
Mitigation: centralized de-duplication by destination coordinate.

- Risk: flaky tests due to non-deterministic map iteration.
Mitigation: explicit sorted output before return and snapshot.

- Risk: movement generation too slow for AI turn budgets in dense positions.
Mitigation: benchmark harness, cache-friendly data access, and profiling before M4 integration.

## 10. Suggested Daily Execution
Day 1:
- Complete M2-001 and M2-002.
- Start rook generator (M2-003).

Day 2:
- Complete M2-003 and M2-004.
- Begin queen generator (M2-005).

Day 3:
- Complete M2-005, M2-006, M2-007.
- Start legality pass (M2-008).

Day 4:
- Complete M2-008.
- Build unit matrix (M2-009).

Day 5:
- Complete M2-010 and M2-011.
- Implement benchmark harness (M2-013).

Day 6-7 (buffer):
- Complete M2-012.
- Profiling pass and cleanup before M3.

## 11. Merge Checklist
- [ ] All movement generators implemented and code-reviewed.
- [ ] Unit and integration movement tests passing.
- [ ] Deterministic move ordering documented and enforced.
- [ ] Regression fixtures committed.
- [ ] Benchmark report committed for AI integration.
- [ ] Handoff notes delivered for M3/M4 consumers.
