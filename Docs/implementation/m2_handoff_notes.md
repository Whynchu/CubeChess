# M2 Handoff Notes

## Implemented Modules
- `Runtime/Core/Rules/movementDirections.js`
- `Runtime/Core/Rules/moveUtils.js`
- `Runtime/Core/Rules/legalMoves.js`
- `Runtime/Core/Rules/index.js`

## Rules API
- `getLegalMoves(matchState, occupancyMap, pieceId) -> Move[]`
- `getPseudoLegalMoves(matchState, occupancyMap, pieceId) -> Coord3[]`

`Move` shape:
- `pieceId`
- `from: {x,y,z}`
- `to: {x,y,z}`
- `isCapture: boolean`
- `capturedPieceId: string|null`

## Canonical Direction Sets
- Rook: 6
- Bishop: 12
- Queen: 26
- King: 26
- Knight offsets: 24

## Determinism Behavior
- Move list deduplicates by destination coordinate.
- Final move output is sorted deterministically by `(to.x, to.y, to.z)`.
- Friendly destinations are excluded.
- Sliding pieces stop at first occupied voxel.

## Validation Added
- Direction count assertions
- Per-piece open-board move counts from center:
  - Rook: 21
  - Bishop: 39
  - Queen: 85
  - Knight: 24
  - King: 26
- Corner sanity checks:
  - Knight: 6
  - King: 7
- Rook blocker/capture tests:
  - friendly blocks movement
  - enemy capture allowed
  - no traversal beyond first blocker

## Benchmark Harness
- Command: `npm run bench:m2`
- Script: `Tests/Performance/m2_movement_benchmark.js`

Current baseline (local sandbox run):
- low_density: avg `0.0118 ms` per piece eval
- medium_density: avg `0.0087 ms` per piece eval
- high_density: avg `0.0066 ms` per piece eval

## Next Step
- Implement M3 turn state machine + seat routing against this rules API.
