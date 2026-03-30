# CubeChess Mode Architecture Plan

Source context:
- `Docs/implementation/cube_chess_implementation_plan.md`
- `Docs/implementation/cube_chess_ai_champion_plan.md`
- `Docs/implementation/cube_chess_ai_personality_plan.md`
- `Docs/design/cube_chess_full_3_d_voxel_design_doc.html`

## 1. Purpose
Define a clean implementation path for supporting two first-class CubeChess modes in the same runtime:
- `Chaos 8P`: the current spectator-first multiplayer lava-lamp mode
- `Duel 2P`: a new top-vs-bottom full-board mode with randomized persona matchups

The goal is to add the second mode without forking the engine, AI loop, renderer, or telemetry model.

## 2. Product Intent
These modes solve different problems and should both remain first-class:
- `Chaos 8P` is the spectacle mode
- `Duel 2P` is the clarity and AI-lab mode

Why this split matters:
- 8-player games are better at expressing chaos, emergent diplomacy, survival, and visual spectacle
- 2-player games are better at exposing tactical quality, king safety, opening behavior, and personality differences
- AI strength work done in duel mode can inform chaos mode, even if it does not transfer directly

## 3. Non-Negotiable Constraints
- Both modes must run inside the same viewer shell
- Both modes must use the same core rules/runtime modules where possible
- Deterministic behavior must remain reproducible inside each mode
- Telemetry must always include mode identity
- Human+AI play must remain possible in both modes
- Mode support must not regress existing `Chaos 8P` behavior

## 4. Architecture Principle
Do not build two separate games.

Instead, build one runtime with a mode preset layer that controls:
- active seat count
- turn order
- formation generation
- camera defaults
- UI labels
- telemetry tags
- persona assignment policy

Core engine systems should remain shared:
- game state
- move generation
- turn resolution
- elimination logic
- AI move selection
- animation pipeline
- telemetry export

## 5. Mode Model
Add a mode definition object such as:

```ts
type GameModeId = "chaos_8p" | "duel_2p";

type GameModeDefinition = {
  id: GameModeId;
  label: string;
  seatOrder: string[];
  activeSeatCount: number;
  formationId: string;
  cameraProfileId: string;
  supportsAutoplay: boolean;
  supportsHumanSeats: boolean;
  personaAssignment: "fixed_by_color" | "randomized_matchup";
  telemetryModeTag: string;
};
```

Required presets:
- `chaos_8p`
- `duel_2p`

## 6. Seat Identity vs Persona Identity
This separation is required before `Duel 2P` is added cleanly.

Current logic largely treats color, seat, and persona as tightly linked.
That is acceptable for `Chaos 8P`, but not for randomized duel matchups.

Refactor to distinguish:
- `seat identity`: board side, turn slot, UI color, home formation slot
- `persona identity`: AI behavior profile used by that seat for this match

Target behavior:
- In `Chaos 8P`, seat colors remain stable and personas can remain fixed by default
- In `Duel 2P`, the two active seats keep clear side identity while personas are randomized per match

This allows matches like:
- `Blue Fortress vs Red Aggressor`
- `Purple Controller vs Green Swarm`
- mirror matches if desired later

## 7. Formation System Changes
The formation system must become mode-aware.

### 7.1 Chaos 8P Formation
Keep current chaos/corner formation behavior as-is behind a named formation preset.

Requirements:
- 8 active corner seats
- current rotation and seat-order rules preserved
- current position-one indicator retained

### 7.2 Duel 2P Formation
Add a second formation preset for full-board top-vs-bottom play.

Requirements:
- exactly 2 active seats
- one side occupies the bottom rank cluster
- one side occupies the top rank cluster
- include a full board setup with pawns
- clean, symmetric formation

Recommended first duel layout:
- standardized full-board front line of pawns
- full back-rank major/minor piece layout
- one side mirrored across the vertical axis

Important:
- do not hard-wire duel formation into the viewer root
- expose it as a formation preset selected by mode

## 8. Rules and Turn System Impact
The turn system should stay shared.

Mode-dependent changes should be limited to:
- number of active seats
- turn order
- seat skip behavior for eliminated seats
- end-of-match summary messaging

Expected behavior:
- `Chaos 8P`: current elimination and winner flow
- `Duel 2P`: same king-capture elimination rule, simpler head-to-head resolution

No special duel-only win rules should be introduced in the first pass.

## 9. AI System Impact
The AI core should remain shared, but mode-aware.

### 9.1 Shared Engine
Keep one evaluator and one move-selection pipeline.

### 9.2 Mode Overlays
Allow mode-level tuning overlays for:
- evaluator weights
- tactical filters
- search budgets
- candidate pruning
- persona matchup selection policy

Reason:
- `Chaos 8P` values survival, opportunism, and multi-threat handling
- `Duel 2P` values development, king safety, tactical conversion, and cleaner positional pressure

The right structure is:
- shared base evaluator
- persona overlay
- mode overlay

Not:
- separate AI engines per mode

## 10. Matchup System for Duel 2P
`Duel 2P` should support randomized AI-vs-AI matchup selection.

Minimum viable behavior:
- choose two personas at random from the registry at match start
- assign them to the two duel seats
- display both in the HUD
- persist them in telemetry

Later extensions:
- mirror-only toggles
- curated rivalry presets
- round-robin automated matchup batches
- personality win tables

## 11. UI and HUD Changes
The HUD must become mode-aware, but the shell should remain the same.

Required additions:
- mode selector
- current mode label
- matchup display for duel mode
- player/session stats that still work in both modes

Recommended HUD behavior:
- `Chaos 8P`: keep current session-wide faction stats and spectator controls
- `Duel 2P`: show left/right or top/bottom matchup clearly, including persona names

Do not create a separate page for duel mode.

## 12. Camera Profiles
Camera setup should be selected by mode.

### Chaos 8P
- preserve current isometric spectator framing
- preserve slow auto-rotate and active-piece follow behavior

### Duel 2P
- slightly cleaner side-to-side readability
- stronger front-to-back lane clarity
- still allow orbit and current follow behavior

This should be implemented as mode-selected camera presets, not duplicated camera logic.

## 13. Telemetry Requirements
Telemetry must become explicitly mode-aware.

Every exported game should include:
- `mode`
- `formationId`
- `activeSeats`
- `personaAssignments`
- `winner`
- `turnCount`
- `seatOrder`

Additional duel telemetry should include:
- head-to-head persona matchup
- side assignment
- opening piece preference
- king safety reject counts
- matchup result over session

This is essential because duel mode will become the cleanest way to inspect AI quality.

## 14. Validation Strategy
### 14.1 Chaos 8P Validation
- existing autoplay soak tests still pass
- no regressions in camera, HUD, or match start
- telemetry still exports cleanly

### 14.2 Duel 2P Validation
- both full-board formations spawn correctly
- turn order stays 2-player only
- AI completes games end-to-end
- persona matchup is visible in UI and export
- king safety logic behaves more clearly than in chaos mode

### 14.3 Cross-Mode Validation
- switching modes and resetting match never leaves stale seat state
- no runtime-only assumptions remain about 8 seats always being active
- win-rate panel and current turn display remain accurate in both modes

## 15. Execution Order
### Phase A - Mode Preset Layer
Deliverables:
- `gameMode` definition model
- mode selection state
- mode-aware boot/reset flow

Acceptance criteria:
- viewer can initialize either mode without code branching all over the app

### Phase B - Formation Abstraction
Deliverables:
- named formation presets
- current chaos formation moved behind formation API
- new duel full-board formation added

Acceptance criteria:
- `Chaos 8P` unchanged
- `Duel 2P` spawns correctly every reset

### Phase C - Seat/Persona Decoupling
Deliverables:
- separate seat identity from persona identity
- randomized duel persona assignment
- matchup labels in runtime state

Acceptance criteria:
- same seat color can run different personas between matches

### Phase D - HUD and Camera Mode Support
Deliverables:
- mode selector
- duel matchup panel
- camera preset by mode

Acceptance criteria:
- both modes remain readable on mobile and desktop

### Phase E - Telemetry and Batch Support
Deliverables:
- mode-tagged exports
- duel matchup telemetry fields
- batch support for duel runs

Acceptance criteria:
- duel games can be analyzed independently from chaos games

### Phase F - Duel AI Tuning Track
Deliverables:
- mode overlay for AI evaluation/search
- duel-specific telemetry reports
- head-to-head persona comparison scripts

Acceptance criteria:
- duel mode becomes usable as an AI lab for champion training

## 16. Risks
- Too much mode-specific branching leaks into core systems
  Mitigation: keep mode logic in preset/config layers

- Duel mode accidentally becomes a second codebase
  Mitigation: shared renderer, shared turn system, shared AI pipeline

- Persona randomization becomes confusing in UI
  Mitigation: show seat color and persona label separately and consistently

- 2-player tuning accidentally degrades 8-player tuning
  Mitigation: add mode overlays, not global evaluator rewrites

## 17. Recommendation
Build this now, before deeper AI specialization continues.

Reason:
- `Duel 2P` gives a cleaner lab for AI quality
- `Chaos 8P` remains the flagship spectacle mode
- both together create a stronger long-term platform for CubeChess AI mastery than either mode alone

## 18. Immediate Next Step
Start with:
- Phase A: mode preset layer
- Phase B: formation abstraction

Those two steps unlock the rest without committing to UI or AI tuning rewrites too early.
