# M0: Determinism Contract

**Purpose:** Define the determinism framework that enables reproducible testing, soak test debugging, replay tooling, and cross-milestone consistency.

**Scope:** RNG seeding, piece ID generation, move ordering, turn tracing, state serialization, and replay capabilities.

---

## 1. Global Determinism Principles

1. **Every gameplay decision is seedable.** Given the same seed and input sequence, the game produces identical outcomes.
2. **Determinism is bidirectional:** Forward simulation and reverse-trace (replay) must be equivalent.
3. **RNG state is explicitly managed,** not implicit to framework defaults.
4. **Move ordering is globally consistent** across all contexts (AI search, legal move enumeration, fallback selection).
5. **Turn traces are immutable** and captured during gameplay for debugging and replay.

---

## 2. RNG Framework

### 2.1 Seeded Algorithm Library
**Implementation:** Use `seedrandom.js` (Web-compatible deterministic RNG) or equivalent.

```javascript
// Example initialization
const seedrandom = require('seedrandom');
const MATCH_SEED = '12345'; // User-provided or generated
const rng = seedrandom(MATCH_SEED);
const randomValue = rng(); // [0.0, 1.0) deterministic
```

### 2.2 Seed Format
- **Match Seed (string):** `<timestamp>-<player-seed>-<variant>` e.g., `20260326-1234-ai-vs-ai`
- **Deterministic:** Seeds are user-provided for replay or generated with timestamp + player count for new matches
- **Capture:** Every match seed is logged in telemetry and turn trace

### 2.3 AI RNG Isolation
- AI decision-making uses a **sub-RNG** derived from the match seed + turn number
- Each AI turn: `aiRng = seedrandom(matchSeed + "-turn-" + turnIndex)`
- Ensures AI decisions are reproducible but isolated from other randomness

### 2.4 Fallback Move Selection
When AI timeout occurs, fallback move is selected by **deterministic ordering**, not RNG:
- Rank legal moves by (x, y, z) ascending, then by move type priority
- Return the first (lowest-ranked) legal move
- This is **deterministic and rng-independent**, ensuring timeout behavior is reproducible

---

## 3. Piece ID Generation

### 3.1 ID Format
```
<player>-<type>-<index>
```
- **Player:** `Y` (Yellow), `R` (Red), `P` (Purple), `B` (Blue)
- **Type:** `K` (King), `Q` (Queen), `RK` (Rook), `BP` (Bishop), `N` (Knight)
- **Index:** `0`, `1` (for duplicates; King/Queen always index 0)

### 3.2 Examples
```
Y-K-0    = Yellow King
R-RK-1   = Red Rook #2 (second rook)
P-BP-0   = Purple Bishop #1 (first bishop)
B-N-1    = Blue Knight #2
```

### 3.3 Generation Order (Deterministic)
Formation generator creates pieces in **corner-layer order**, always:
1. Layer 0 (tip): King (index 0)
2. Layer 1 (adjacent): Queen, Bishop, Bishop → indices [0, 0, 1]
3. Layer 2 (ring): Rook, Rook, Knight, Knight → indices [0, 1, 0, 1]

**This order is canonical and never varies.** If IDs change, all state becomes invalid.

---

## 4. Move Ordering

### 4.1 Legal Move Sort Order
All legal move enumeration must use **identical sorting**:

1. **Primary:** Sort by destination voxel (x, y, z) ascending
2. **Secondary:** If ties (impossible for move destinations), use piece ID as tiebreaker

### 4.2 Implementation Contract
```javascript
function sortLegalMoves(moves) {
  return moves.sort((a, b) => {
    const destCmp = compareCoords(a.to, b.to); // (x, y, z) ascending
    return destCmp !== 0 ? destCmp : comparePieceIds(a.pieceId, b.pieceId);
  });
}

function compareCoords(c1, c2) {
  if (c1.x !== c2.x) return c1.x - c2.x;
  if (c1.y !== c2.y) return c1.y - c2.y;
  return c1.z - c2.z;
}
```

### 4.3 Contexts Where This Applies
- AI candidate move list (M4)
- Fallback move selection on timeout (M3)
- Replay validation (M6)
- Any place legal moves are enumerated or ranked

---

## 5. Turn Trace Format

### 5.1 Turn Trace Structure
Each turn is logged as an immutable record:

```javascript
{
  turnIndex: 42,
  player: 'Y',
  rngState: '<serialized-rng-state-at-turn-start>', // For replay
  legalMoves: [...],        // Sorted legal move list
  selectedMove: {...},      // Piece, from, to, isCapture, capturedId
  executionTimeMs: 1243,    // Elapsed time for move decision
  telemetry: {
    aiTimeoutOccurred: false,
    candidateCount: 15,
    evaluatedDepth: 4
  }
}
```

### 5.2 Trace Lifecycle
1. **Captured during:** Each turn execution (M3 turn system)
2. **Stored in:** Match session (in-memory) + persisted to local storage/file at match end
3. **Used for:** Replay validation (M6), soak test debugging, off-device analysis

### 5.3 Storage Format
- **Format:** JSON (human-readable, debuggable)
- **Location:** `LocalStorage['match-<matchSeed>']` or file-based equivalent
- **Size estimate:** ~1KB per 100 turns (reasonable for 40-minute matches)

---

## 6. State Serialization

### 6.1 Serializable State
Every game state snapshot must be serializable to JSON for replay and validation:

```javascript
{
  version: '1.0',
  matchSeed: '20260326-1234-ai-vs-ai',
  board: {
    voxels: [512],  // Flat array, index = x + 8*y + 64*z; value = pieceId or null
    pieces: {
      'Y-K-0': { owner: 'Y', type: 'K', coord: {x: 0, y: 7, z: 0}, alive: true },
      ...
    }
  },
  activePlayer: 'Y',
  eliminatedPlayers: [],
  turnCount: 42,
  lastMove: { pieceId: 'R-RK-0', from: {x: 7, y: 7, z: 7}, to: {x: 5, y: 7, z: 7}, isCapture: false }
}
```

### 6.2 Determinism Validation
After deserialization, verify:
1. All piece IDs match canonical format
2. No duplicate voxel occupancy
3. Piece coordinates match occupancy map
4. Turn count consistency

---

## 7. Replay and Debugging Tools

### 7.1 Replay Playback
Given a turn trace and initial seed:
1. Initialize game with match seed
2. Replay each turn: apply the serialized move, check state against trace
3. Detect divergence if actual state ≠ traced state

### 7.2 Trace Validation
```javascript
function validateTurnTrace(trace, initialState, actualOutcome) {
  let state = initialState;
  for (const turn of trace) {
    applyMove(state, turn.selectedMove);
    if (!statesEqual(state, turn.expectedStateAfter)) {
      throw new Error(`Divergence at turn ${turn.turnIndex}`);
    }
  }
  return statesEqual(state, actualOutcome);
}
```

### 7.3 Off-Device Debugging
- Export match trace to file
- Replay independently (JavaScript or other language)
- Identify exact turn where behavior diverged
- Use for soak test analysis (M6-002)

---

## 8. Implementation Checklist

- [ ] **M1:** Coord3 and piece ID generation uses canonical format
- [ ] **M1:** State serialization implemented and tested for round-trip fidelity
- [ ] **M2:** Move enumeration always sorts by (x, y, z) ascending
- [ ] **M3:** Turn trace captured for every turn; stored persistently
- [ ] **M3:** RNG seeding integrated into turn system; AI uses sub-RNG per turn
- [ ] **M3:** Timeout fallback move uses deterministic ordering, not RNG
- [ ] **M4:** AI search uses sub-RNG; candidate ranking is deterministic
- [ ] **M6:** Replay tool implemented and validated against soak traces
- [ ] **M6:** Soak test captures full traces; debugging workflow documented

---

## 9. Notes for Implementation Teams

1. **JavaScript RNG:** `seedrandom.js` has ~1KB footprint and is battle-tested
2. **State size:** Full match state is ~50KB serialized; tolerable for replay
3. **Replay overhead:** 10-50ms per turn for verification (acceptable for offline debugging)
4. **Determinism guarantees:** Exact only if RNG library and sorting algorithm never change mid-match
5. **Version compatibility:** Update `version` field in state snapshot if format changes (e.g., for new piece types)

---

## 10. Cross-Milestone Dependencies

- **M1 depends on:** Piece ID format locked
- **M2 depends on:** Move ordering contract locked
- **M3 depends on:** Turn trace format locked; RNG seeding integrated
- **M4 depends on:** AI RNG isolation rules
- **M6 depends on:** Replay tool ready; soak traces collected

