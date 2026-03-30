# CubeChess Duel 2P Rules Spec

## Purpose
This document defines the next rules pass for `Duel 2P` so the mode behaves like a credible chess-derived ruleset on the CubeChess board.

The goal is not to copy orthodox chess blindly. The goal is to preserve the strategic function of core chess rules while adapting them to the wall-based `8x8x8` CubeChess geometry.

## Scope
This spec covers:
- strict king-safety legality
- CubeChess duel castling
- CubeChess duel en passant

This spec does not yet cover:
- checkmate UX wording
- draw rules
- stalemate resolution
- underpromotion
- insufficient-material detection

## Current Duel Geometry
`Duel 2P` currently places both armies on opposite interior walls of the cube:
- `Yellow` on the top wall
- `Red` on the bottom wall

Pieces are arranged in standard two-rank chess order across an `8x8` wall plane.

Important consequence:
- the duel board is still effectively a wall-based plane embedded in `3D`
- movement and rules should remain readable from that plane
- we should avoid rules that require confusing 3D interpretation if a clean plane-local rule exists

## Rule 1: Strict King-Safety Legality

### Intent
A player may not make a move that leaves their king capturable on the opponent's next turn.

This upgrades king safety from a heuristic into a hard legality rule for `Duel 2P`.

### Practical Meaning
A legal move in `Duel 2P` must satisfy both conditions:
1. it is pseudo-legal for the selected piece
2. after simulating the move, the moving side's king is not attackable by any enemy pseudo-legal capture

If a move fails condition `2`, it is illegal and must not appear in the final legal move list.

### Behavior Notes
- If the side to move is currently in check, only moves that resolve check are legal.
- If no legal moves remain:
  - if the king is under attack, the result is `checkmate`
  - if the king is not under attack, the result is `stalemate`

### Engine Plan
Add a duel-only legality filter after pseudo-legal move generation:
1. generate pseudo-legal moves
2. apply each move to a temporary state
3. find the moving side's king
4. generate enemy threat coverage
5. reject moves where the king square is threatened

### Why Duel-Only First
This rule is appropriate for `Duel 2P` immediately.
It should not be applied to `Chaos 8P` without a separate design decision, because 8-player king exposure is part of that mode's chaos and current AI balance.

## Rule 2: CubeChess Duel Castling

### Intent
Castling should preserve its orthodox function:
- protect the king
- activate the rook
- cost one turn

Because the duel board is arranged on a wall plane, castling should be defined along that plane only.

### Chosen Interpretation
Castling happens horizontally along the duel wall rank, exactly like orthodox chess relative to that wall's local `file` axis.

For each side, there are two castle options:
- king-side castling
- queen-side castling

The king moves two wall-squares toward the chosen rook.
The rook moves to the square immediately on the other side of the king.

No 3D diagonal or depth interpretation is used.

### Castling Preconditions
Castling is legal only if all of the following are true:
1. the king has not moved previously
2. the chosen rook has not moved previously
3. all wall squares between the king and chosen rook are empty
4. the king is not currently in check
5. the king does not pass through a threatened square
6. the king does not land on a threatened square

### Castling State Requirements
Each king and rook needs a persistent `hasMoved` flag.
That flag must survive resets of temporary simulation state.

### UX / Rendering Notes
- Castling should animate as one move sequence, not two unrelated moves.
- Decision preview may show the king destination as the candidate move; rook relocation happens as part of resolution.

### Engine Plan
1. extend piece state with `hasMoved`
2. add duel-only castle candidates during king move generation
3. validate empty path and threat-free transit squares
4. resolve the final move by relocating both king and rook atomically
5. mark both pieces as moved

### Board Mapping Note
The implementation should not hardcode `left/right` by color name.
It should derive castle directions from the duel formation's local wall axis so the rule survives any future seat/color remapping.

## Rule 3: CubeChess Duel En Passant

### Intent
En passant should preserve its orthodox function:
- punish an exposed two-step pawn advance
- remain available for one immediate response only

### Chosen Interpretation
En passant is also interpreted on the duel wall plane only.

If a pawn makes a straight two-step forward move from its start square, and an enemy pawn is adjacent on the destination rank in the wall plane, that enemy pawn may capture en passant on its very next move.

The capturing pawn moves to the passed-through square.
The advanced pawn is removed.

### Important Restriction
Only a straight two-step forward move can create en passant vulnerability.

Diagonal-style non-capturing pawn advances in CubeChess duel:
- `forward-up`
- `forward-down`

must not create en passant vulnerability.

Reason:
- these are already CubeChess-specific mobility buffs
- allowing en passant off the offset advance creates ambiguity and weakens readability
- straight double-step remains the clean orthodox analog

### En Passant Lifetime
The en passant right exists for exactly one opponent turn.
If not used immediately, it expires.

### Engine State Requirements
Track a transient `enPassantTarget` record in duel state:
- vulnerable pawn id
- passed-through square
- side eligible to capture on the next turn only
- expiration on turn advance

### Engine Plan
1. when a pawn performs a straight two-step advance, store an `enPassantTarget`
2. when generating duel pawn captures, include en passant if:
   - target exists
   - target belongs to the opponent
   - capturing pawn is adjacent in the wall plane
   - landing square matches the stored pass-through square
3. on execution, remove the vulnerable pawn even though the destination square is empty
4. clear the target after one full reply window or after any other move

## Data Model Changes
The following additions are required for duel rule completeness.

### Piece State
Add to piece objects:
- `hasMoved: boolean`

### Match State
Add duel-only or generic state fields:
- `resultType: null | "checkmate" | "stalemate"`
- `winner: null | playerColor`
- `enPassantTarget: null | object`

### Move Metadata
Moves may need optional metadata fields such as:
- `special: null | "castle" | "en_passant" | "promotion"`
- `rookMove` for castling resolution
- `capturedPieceId` when en passant removes a piece not on the destination square

## Recommended Implementation Order

### Phase 1: Strict King Legality
This gives the biggest gameplay improvement immediately.

Deliverables:
- duel move filter rejects self-check
- duel detects checkmate/stalemate
- HUD can show `Checkmate` vs `Stalemate`

### Phase 2: Castling
This improves opening structure and king safety.

Deliverables:
- king/rook `hasMoved`
- castle move generation
- castle execution and animation

### Phase 3: En Passant
This completes the essential pawn interaction set.

Deliverables:
- straight two-step vulnerability tracking
- en passant move generation
- en passant resolution

## Test Matrix

### King-Safety Tests
- king may not move into attack
- pinned piece may not expose king
- in-check position only returns resolving moves
- checkmate state ends the game correctly
- stalemate state ends the game correctly

### Castling Tests
- legal king-side castle
- legal queen-side castle
- blocked castle rejected
- castle through check rejected
- castle while in check rejected
- castle after king moved rejected
- castle after rook moved rejected

### En Passant Tests
- straight two-step creates valid en passant target
- en passant available only on immediate reply
- forward-up and forward-down advances do not create en passant rights
- en passant removes passed pawn correctly
- en passant rejected if king would remain exposed

## Recommended Non-Goals For This Pass
Do not mix these into the same implementation unless necessary:
- draw by repetition
- fifty-move rule equivalent
- underpromotion UI
- threefold detection

Those can come after duel legality is stable.

## Decision Summary
The correct next rules pass for `Duel 2P` is:
1. strict king-safety legality
2. wall-plane castling
3. straight-double-step-only en passant

This keeps duel readable, strategically legitimate, and still faithful to the CubeChess geometry instead of forcing awkward full-3D interpretations.
