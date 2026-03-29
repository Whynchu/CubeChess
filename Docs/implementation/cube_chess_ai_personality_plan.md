# CubeChess AI Personality Implementation Plan

Source context:
- `Docs/implementation/cube_chess_ai_champion_plan.md`
- `Docs/implementation/cube_chess_implementation_plan.md`
- `agents.md`

## 1. Objective
Add clear, color-linked AI personalities (for spectator identity and replay value) without sacrificing core strength, determinism controls, or turn-time budgets.

Primary fantasy target:
- `Red` feels aggressive
- `Blue` feels fortress/defensive

Secondary target:
- all 8 colors feel distinct and readable during autoplay while remaining competitive.

## 2. Non-Negotiable Constraints
- AI turn P95 remains `<= 10,000 ms`.
- Deterministic mode remains reproducible for a fixed seed and config.
- Personality must not increase obvious king blunders.
- Personality deltas should be tuning-layer changes, not rules forks.

## 3. Current Baseline
The engine currently has:
- heuristic scoring with tactical filters
- danger-aware rescoring
- bounded search and pruning
- anti-loop diversity controls
- telemetry export for trace comparison

Gap:
- AIs are still mostly "same brain + variety mode" and not explicit archetypes.

## 4. Persona Architecture
Use one shared search pipeline with per-persona parameter packs.

Each persona pack provides:
- evaluator weight modifiers (capture, kingSafety, center, mobility, antiHelper, tablePressure, etc.)
- tactical profile modifiers (score drop window, danger margin, min tactical pool)
- search style modifiers (root candidate breadth, depth-3 breadth, blend factor)
- risk policy knobs (max acceptable king exposure / counter-risk)
- opening preference hints (early development ordering by piece class)

Do not duplicate search code per persona.

## 5. Initial Persona Set (v1)
1. `Red - Aggressor`
- Higher capture/initiative weighting
- Slightly wider tactical pool for attack opportunities
- Lower tolerance for passive moves

2. `Orange - Raider`
- Fast flank pressure, mobility biased
- Moderate tactical risk acceptance

3. `Yellow - Opportunist`
- Strong third-party punish behavior
- Prefers tactical picks with low helper risk

4. `Green - Swarm`
- Development and piece-activation bias
- Penalizes repeated same-piece play harder

5. `Cyan - Tempo`
- Mobility and initiative balance
- Prefers forcing lines with good follow-up

6. `Blue - Fortress`
- King safety and defense weighting increased
- Narrower risk window, strong anti-helper bias

7. `Purple - Controller`
- Center-volume and lane-control preference
- Slower but stable positional pressure

8. `Pink - Trickster`
- Controlled variety injection within tactical safety bounds
- Non-deterministic mode feels less predictable, still legal/safe

## 6. Execution Phases
### Phase P1 - Persona Config Backbone
Deliverables:
- `AI persona registry` keyed by color
- runtime plumbing from `activePlayer -> persona config`
- telemetry includes `personaId` each turn

Acceptance:
- switching persona changes scoring/search behavior without code branch duplication
- deterministic replay stable when persona pack is unchanged

### Phase P2 - Red and Blue Flagships
Deliverables:
- tuned `Red Aggressor` and `Blue Fortress`
- side-by-side telemetry comparison vs baseline

Acceptance:
- Red shows higher controlled capture pressure
- Blue shows lower king-exposure incidents
- neither violates turn-time budget

### Phase P3 - Full 8 Persona Rollout
Deliverables:
- all 8 persona packs wired and documented
- UI/readme note describing each style

Acceptance:
- each persona has measurable behavioral signature in telemetry
- no severe blunder-rate regression across soak runs

### Phase P4 - Personality Polish + Strength Guardrails
Deliverables:
- guardrails to prevent personality from overriding king safety
- fallback policy when persona preference conflicts with tactical safety

Acceptance:
- style remains visible but never causes repeated catastrophic king hangs

## 7. Telemetry Requirements for Persona Work
Add/track per turn:
- `personaId`
- `kingExposureDelta`
- `kingImmediateThreatAfterMove` (boolean)
- `riskRejectedCount` (moves rejected by king safety/risk gates)
- existing fields (`elapsedMs`, `searchDepthReached`, `searchNodesExpanded`, etc.)

Comparison KPIs by persona:
- king-loss blunder rate
- capture conversion quality (captures that do not lose net value shortly after)
- unique piece usage rate
- repetition/loop indicators
- mean and P95 turn time

## 8. Immediate Next Sprint (Recommended)
1. Implement P1 persona registry + telemetry field plumbing.
2. Implement P2 Red/Blue tuning only.
3. Run 3-5 telemetry games and compare against `v0.1.92` baseline.
4. Lock guardrails, then expand to P3.

## 9. Risks and Mitigations
Risk: personalities become gimmicks and weaken play.
Mitigation: enforce king-safety guardrails and compare against strength KPIs.

Risk: explosion of tuning combinations.
Mitigation: keep one shared search engine and small, documented parameter surface.

Risk: performance regressions from per-persona complexity.
Mitigation: persona packs only tune existing scoring/search knobs; no heavy new compute per turn.

## 10. Done Criteria
Personality system is "done" when:
- all 8 colors have distinct, intentional style signatures
- deterministic mode remains reproducible
- AI turn P95 remains within budget
- no material increase in king-loss blunders
- spectator matches visibly feel like 8 different minds, not one mirrored bot
