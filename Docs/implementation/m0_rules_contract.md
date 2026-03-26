# M0: Rules Contract - 4-Player Elimination Chess

**Purpose:** Clarify edge-case rules for 4-player multiplayer elimination chess that were underspecified in the design document.

**Scope:** Stalemate, pass moves, draw conditions, simultaneous capture, piece survival, turn sequencing during eliminations.

---

## 1. Elimination Rules

### 1.1 Elimination Condition
**A player is eliminated when their King is captured.**

- King capture is authoritative; no checkmate or checksum concepts apply.
- Captured King piece: `alive = false`; player enters `eliminatedPlayers` set.
- **Next turn:** Turn sequencer skips eliminated player, passes to next active player.

### 1.2 Winner Determination
**Match ends when only one player remains.**

- Last non-eliminated player is the winner.
- If 4 players reach turn 0 and 3 are eliminated, turn 4 wins immediately.
- **No tie conditions** (see section 5 for draw rules, which are rare and explicit).

### 1.3 Survivor with No Pieces
**Edge case:** If survivor's last non-King piece is captured, survivor still has legal moves (King alone).

- King can move to any adjacent unoccupied voxel (26 possible directions max)
- Game continues; survivor cannot be eliminated unless King is captured
- **Design intent:** King-vs-King endgame is short and readable (2-3 turns max)

---

## 2. Movement Rules - Clarifications

### 2.1 Blocked Movement
**Sliding pieces (Rook, Bishop, Queen) stop at the first occupied voxel.**

- If friendly: **cannot enter; move ends before that voxel**
- If enemy: **can enter to capture; move ends after capturing enemy piece**

### 2.2 Knight Movement in 3D
**Knight moves exactly 2 cells along one axis, 1 cell along a perpendicular axis, 0 along the third.**

**Enumeration (24 total destinations):**
- Axis pairs: (X,Y), (X,Z), (Y,Z) → 3 pairs
- Per pair, direction combos: 4 per pair (e.g., +2X+1Y, +2X-1Y, -2X+1Y, -2X-1Y)
- Total: 3 × 4 × 2 = 24 possible knight destinations (not 8; that's 2D chess)

**Example from (4,4,4):**
```
+2X: (6,3,4), (6,5,4), (6,4,5), (6,4,3)
-2X: (2,3,4), (2,5,4), (2,4,5), (2,4,3)
+2Y: (3,6,4), (5,6,4), (4,6,5), (4,6,3)
-2Y: (3,2,4), (5,2,4), (4,2,5), (4,2,3)
+2Z: (3,4,6), (5,4,6), (4,3,6), (4,5,6)
-2Z: (3,4,2), (5,4,2), (4,3,2), (4,5,2)
```

- **Blocked voxels:** Knight ignores all blocked cells along its path (unique vs sliding pieces)
- **Destination validation:** Knight destination must be empty or enemy-occupied (standard capture rules)

### 2.3 King Movement
**King moves exactly 1 voxel in any direction (26 adjacent voxels).**

- Includes orthogonal (6), plane-diagonal (12), and true 3D diagonal (8) moves
- All 26 adjacent voxels are reachable if unoccupied or enemy-occupied
- **King cannot move into check** (see section 3)

---

## 3. Check, Checkmate, and Threats

### 3.1 Check (Informational, Not Enforced)
**A King is "in check" if an enemy piece can capture it on the opponent's next move.**

- **Check is NOT a move blocker** (unlike traditional chess)
- **Reason:** 4-player simultaneous threat is too complex to enforce; focus is readability and speed
- **Display:** Check state shown visually (threat indicator) but doesn't force moves
- **Design philosophy:** King survival is the player's responsibility; read-the-board skill matters

### 3.2 Checkmate (Undefined; Not Used)
- No checkmate concept; only king capture → elimination
- Reason: 4-player scenarios have ambiguous checkmate (which player delivers it?)

### 3.3 Stalemate (See Section 2: No Legal Moves)

---

## 4. No Legal Moves (Stalemate/Pass)

### 4.1 Condition
**A player has no legal moves if:**
1. Their King is not captured (not eliminated)
2. Every piece they control has no legal destination voxel
   - (All reachable cells are occupied by friendly pieces or blocked by other friendlies)

### 4.2 Outcome: Automatic Pass
**If a player has no legal moves, they pass their turn automatically.**

- No move is executed
- Turn passes to next active player
- **Telemetry:** Log pass event (useful for identifying tight board states)
- **UI:** Display "No legal moves — passing turn" banner for 1-2 seconds

### 4.3 Probability
In 8×8×8 with 32 pieces (4 players × 8 pieces), stalemate is rare:
- Early game: ~0% (plenty of empty space)
- Mid-game (16 eliminations): ~5-15% (board becoming dense)
- Late game (2-3 players): ~1-2% (fewer players means more space per player)

**No special rule needed;** pass is the natural outcome.

---

## 5. Draw Conditions

### 5.1 Explicit Draw Triggers
**Draws are rare and must be explicitly triggered. Default is no draw.**

#### 5.1a Three-Fold Repetition
**If the exact board state (pieces, positions, active player) repeats 3 times, either player may claim a draw.**

- **Implementation:** After each turn, hash board state and active player; store in match history
- **Claim process:** Human player or AI evaluator detects repetition; explicit claim required (not automatic)
- **Reason:** Prevents infinite loops in AI self-play; practical for 4-player

#### 5.1b Agreed Draw
**If all remaining players agree, match ends in draw.**

- **Implementation:** TBD for M5 (UI element to propose/accept draw)
- **Use case:** Late-game scenario where remaining players consider position unwinnable
- **Reason:** Respects player agency; rare in practice

#### 5.1c 200-Move Rule (Fallback)
**If 200 full rounds (4 players × 200) pass with no capture, match ends in draw.**

- **Implementation:** Count turns; on turn 800 (round 200), auto-draw if no captures in prior 100 turns
- **Reason:** Prevents pathological endgames (e.g., 3 kings with no way to attack)
- **Probability:** ~0.1% (very rare in 8×8×8)

### 5.2 Draw Is a Loss (Tie Outcome)
- Draw is not a win; all remaining players receive "draw" outcome (neither win nor loss)
- **Telemetry:** Distinguish draw from win/loss in match results

### 5.3 No Draws in AI Autoplay (MVP)
**M4 baseline AI does not attempt draws; all AI matches play to single winner.**

- Rationale: Simplifies AI heuristics; draw code is for later (M5+)
- Human players may still claim draws in mixed-seat

---

## 6. Simultaneous Capture (Edge Case)

### 6.1 Scenario
**Can two pieces capture each other in the same turn?**

**Answer: No.** Turns are sequential, not simultaneous.

- Player A moves piece X to capture enemy piece Y
- Player B's next turn: piece Y no longer exists; cannot be moved or captured again
- **Sequential turns prevent double capture**

### 6.2 Turn Order Advantage
**Turn order matters.** Earlier player in round can eliminate threats before later player acts.

- Yellow → Red → Purple → Blue (fixed order, non-random)
- Strategic depth: positioning and turn timing are factors
- **Design intent:** Skill matters; luck is minimized (no random turn order)

---

## 7. Piece Promotion

### 7.1 Rule: No Promotion
**Cube Chess has no pawns and no promotion mechanic.**

- All piece types are fixed; pieces do not transform
- Each player starts with exactly 8 pieces (1K, 1Q, 2R, 2B, 2N)
- If a piece is captured, it is gone; no reinforcements (no spawning)

### 7.2 Design Rationale
- Simpler rules for AI and multiplayer
- Piece set is intentionally diverse (no pawns = more spatial freedom)
- Endgame is readable (no sudden power spikes)

---

## 8. Castling and Special Moves

### 8.1 No Castling
**Cube Chess does not use castling.**

- Reason: 3D space has no standard "side" for king/rook pairing
- King and Rook move independently
- Castling would add orthogonality; not worth the complexity

### 8.2 No En Passant
**Cube Chess does not use en passant.**

- Reason: No pawns (see section 7)

### 8.3 No Special Moves
**All moves follow standard capture and movement rules.** No exceptions.

---

## 9. Time Controls

### 9.1 AI Turn Time Budget
- **Hard cap:** 10,000 ms per turn (including move search and evaluation)
- **Soft target:** 3,000 ms (median)
- **Timeout fallback:** Return best-known or first-legal move deterministically

### 9.2 Human Turn Time Budget
- **Timeout:** 60 seconds per turn (configurable, M3 task)
- **Behavior on timeout:** UI prompt "Your turn expires in 10 seconds — tap to confirm move"
- **After timeout:** If no move confirmed, auto-pass (player has no legal move option forced)
- **Reason:** Prevents human player from idle-stalling; keeps game pace

### 9.3 No Time Controls in Autoplay
- Time is narrative/pacing, not enforced constraint
- Spectator can adjust playback speed (1x, 2x, 4x)
- No clock ticking sounds; flow is smooth

---

## 10. Turn Sequencing with Eliminations

### 10.1 Scenario
**Turn order is Y → R → P → B. If Yellow is eliminated, what's next?**

**Answer:**
- Turn counter continues (turn 42 → turn 43, etc.)
- Active player rotates: Y → R (skips Y, who is eliminated)
- If Red is also eliminated: R → P (skips R)
- If only Purple and Blue remain: P → B → P → B (cycle of 2)

### 10.2 Turn Index Continuity
- Turn index is never reset or renumbered due to eliminations
- Reason: Determinism and tracing require stable turn numbers
- **Effect:** Turn 42 is always turn 42, regardless of who played it

### 10.3 Match Duration
- Match ends on the turn when only 1 player remains
- Match length varies: 50-150 turns (median ~80) depending on faction skill
- **No fixed match length**

---

## 11. Implementation Checklist

- [ ] **M3:** Elimination on King capture implemented
- [ ] **M3:** Turn sequencer skips eliminated players
- [ ] **M3:** Pass move auto-triggered when no legal moves exist
- [ ] **M3:** 60-second human turn timeout with UI prompt
- [ ] **M2:** Knight movement validates all 24 possible destinations
- [ ] **M2:** Check state computed for threat display (not enforced)
- [ ] **M4:** AI does not attempt draws in MVP autoplay
- [ ] **M6:** Three-fold repetition detection and claim interface (if MVP supports draws)
- [ ] **M6:** 200-move fallback draw rule implemented
- [ ] **Telemetry:** Track pass events, draws, and elimination order

---

## 12. Design Philosophy Notes

1. **Simplicity over realism:** 4-player chess is not traditional chess; rules are optimized for clarity and speed
2. **Check (not enforced) vs Checkmate (not applicable):** Threat is visual; survival is player skill
3. **Deterministic turn order:** No random turn shuffling; strategic depth comes from board state, not luck
4. **Pass is natural:** No forced move rule; if you can't move, you pass (reduces AI branching factor)
5. **Draws are rare:** Draw conditions exist but are exceptional; most matches have a clear winner

---

## 13. Cross-Milestone Dependencies

- **M1 depends on:** Elimination and pass rules locked
- **M2 depends on:** Knight 24-move enumeration specification
- **M3 depends on:** Human timeout (60s) and pass rule implementation
- **M4 depends on:** AI behavior under stalemate (pass is legal move with 0 value)
- **M6 depends on:** Three-fold repetition and 200-move rules locked (even if not MVP'd)

