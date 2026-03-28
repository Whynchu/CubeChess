# CubeChess AI Champion Plan

Source context:
- `Docs/implementation/cube_chess_implementation_plan.md`
- `Docs/implementation/cube_chess_m4_task_board.md`
- `agents.md`

## 1. Purpose
Define the implementation path from the current baseline heuristic autoplay AI to a strong, readable, CubeChess-native engine that can support both:
- compelling AI-vs-AI spectator matches
- mixed Human+AI matches without obvious blunders or repetitive loops

This document is intentionally implementation-first. It is not a research note. Every phase below is meant to translate into buildable tasks, telemetry, and validation gates.

## 2. Non-Negotiable Constraints
- AI turn latency P95 must remain `<= 10,000 ms`.
- AI turn median should trend toward `<= 3,000 ms`.
- Deterministic mode must remain reproducible.
- Timeout fallback must always return a legal move.
- Spectator readability must not regress while strength improves.
- Human+AI play must remain supported; AI cannot require autoplay-only assumptions.

## 3. Current Baseline
Current viewer AI is effectively a local move scorer with shallow signals:
- capture reward
- center bias
- local move-count mobility

Observed limitations:
- weak repositioning quality
- overuse of a small subset of pieces
- repetitive sliding-piece loops
- low tactical foresight
- no explicit threat map
- no persistent notion of opening, midgame, or endgame priorities

## 4. Target Outcome
The target "Champion" AI should:
- activate more pieces earlier
- preserve kings more intelligently
- avoid obvious hanging moves
- create pressure through 3D lane control and center-volume influence
- reduce stale loops and backtracking
- remain readable to watch in spectator mode
- produce useful self-play data for future learned evaluation support

## 5. Strategy
Build strength in this order:
1. Better evaluation
2. Better anti-stale behavior
3. Budgeted search
4. Telemetry and trace capture
5. Self-play data generation
6. Learned assistance from CubeChess data
7. Difficulty and style profiles

Do not begin with imported 2D chess move datasets as training targets. Standard chess can inform heuristic design, but CubeChess needs native data before any meaningful learning loop.

## 6. Execution Phases
### Phase A - Evaluation V2
Goal:
Replace one-move local scoring with board-state-aware evaluation.

Deliverables:
- evaluator module separated from viewer wiring
- per-signal weighted score breakdown
- deterministic score output for same state and move ordering

Required signals:
- material balance
- center-volume influence
- move mobility by piece class
- king safety
- threatened piece penalty
- defended piece bonus
- safe capture bonus
- development bonus for inactive pieces entering play
- anti-idle penalty for repeatedly moving the same piece without tactical gain

Acceptance criteria:
- same state produces same ranked move list in deterministic mode
- score breakdown is loggable per move candidate
- evaluator weight table is externalized for tuning

### Phase B - Anti-Stale and Anti-Loop Systems
Goal:
Make autoplay stop collapsing into repetitive, low-information behavior.

Deliverables:
- repetition detection
- short-loop detection
- no-progress counter
- stale-position penalty hooks

Required heuristics:
- penalty for repeating a board state already seen recently
- penalty for moving the same piece back to a recently occupied voxel
- penalty for two-piece oscillation patterns
- pressure bonus for activating dormant pieces when game state is stable

Acceptance criteria:
- repeated two-piece loops decrease substantially in soak runs
- more unique pieces move during the opening window
- stale penalties do not create illegal or random-looking move selection

### Phase C - Budgeted Search V1
Goal:
Move from immediate scoring to consequence-aware decision making.

Deliverables:
- 2-ply search baseline
- best-known move retention at every iteration
- candidate pruning and move ordering
- budget-aware early cutoff

Search model:
- first evaluate active player candidate moves
- then estimate strongest or most dangerous opponent response
- score result using evaluator output after reply

Scope note:
Do not attempt full multi-player minimax initially. For MVP search, model "next danger" rather than exhaustive perfect play across every future seat.

Acceptance criteria:
- search always returns before hard timeout
- search outperforms pure heuristic baseline in internal matchups
- tactical blunders decrease in test scenarios

### Phase D - Multi-Opponent Risk Model
Goal:
Teach the AI to survive in a four-player environment rather than treating turns as isolated duels.

Deliverables:
- next-opponent punishment estimator
- multi-opponent threat aggregation
- exposed-king and exposed-high-value-piece penalties

Required signals:
- how many opponents can attack destination volume
- whether a move opens a lane toward the king
- whether a move wins material but creates stronger retaliation risk
- whether center commitment is safe or overextended

Acceptance criteria:
- fewer moves that gain short-term value but immediately lose major pieces
- fewer king exposures after center drift

### Phase E - CubeChess-Specific Strategic Heuristics
Goal:
Create a genuinely CubeChess-native engine, not a flat-chess clone.

Focus areas:
- 3D slider lane control
- branch-depth pressure for rooks, bishops, and queens
- center-volume occupancy and threat
- corner breakout efficiency
- layered king shelter in 3D
- plane-crossing coordination between pieces

Deliverables:
- feature definitions for CubeChess-native control metrics
- evaluation hooks for branch-depth and voxel-lane pressure
- test positions that validate intended behavior

Acceptance criteria:
- engine prefers stronger 3D structures in curated tactical and positional tests
- spectator matches visibly use more of the board volume

### Phase F - Telemetry and Decision Trace System
Goal:
Make AI quality measurable, debuggable, and trainable.

Per-turn data to capture:
- turn index
- active player
- chosen piece
- chosen target voxel
- legal move count
- searched candidate count
- top candidate scores
- evaluator signal breakdown
- search depth reached
- elapsed decision time
- timeout flag
- repetition risk indicators
- board phase label

Deliverables:
- structured turn trace format
- local export pipeline for match traces
- summary metrics for soak runs

Acceptance criteria:
- every AI turn can be reconstructed after the fact
- tuning changes can be compared using trace outputs instead of guesswork

### Phase G - Self-Play Data Pipeline
Goal:
Generate CubeChess-native training data after the hand-authored engine is respectable.

Deliverables:
- automated self-play harness
- batch match runner
- persistent trace output for hundreds or thousands of matches
- labeling strategy for move quality and outcome contribution

Suggested labels:
- eventual winner
- survival horizon
- material swing after N turns
- king safety delta
- mobility delta
- loop or stale-state participation

Acceptance criteria:
- self-play data is deterministic or seed-reproducible
- trace schema is stable enough for downstream analysis

### Phase H - Learned Assistance
Goal:
Use CubeChess self-play data to improve ranking without replacing the rules engine.

Candidate uses:
- move ordering assistance
- board-state value estimation
- tie-break refinement
- opening preference priors

Non-goal:
Do not replace legal move generation or deterministic fallback policy with an opaque model.

Acceptance criteria:
- learned component improves win rate or reduces blunders against prior engine versions
- budget constraints remain satisfied
- deterministic mode still has a reproducible path when stochastic learning features are disabled

### Phase I - Difficulty and Style Profiles
Goal:
Support both spectacle and competitive modes.

Profiles:
- `Spectacle`: stronger than current, more varied, emphasizes watchability
- `Strong`: practical low-blunder engine
- `Champion`: deepest search and strictest anti-stale behavior
- `Chaos`: strong base policy plus bounded variety injection

Acceptance criteria:
- profiles feel intentionally different
- stronger tiers beat weaker tiers consistently
- spectator-focused tier remains visually interesting without looking nonsensical

## 7. Implementation Backlog
### AI-001 - Extract evaluator into runtime module
- Move evaluation logic out of viewer-only code.
- Expose stable scoring API for tests and telemetry.

### AI-002 - Add evaluator signal breakdown
- Return total score plus named sub-scores.
- Required for tuning and replay analysis.

### AI-003 - Add threat map generation
- Determine attacked voxels and threatened pieces for active and opposing players.

### AI-004 - Add development and inactivity heuristics
- Track piece activation and repeated low-value movement.

### AI-005 - Add repetition and loop penalties
- Detect repeated states and short oscillation patterns.

### AI-006 - Add board phase classification
- Opening, midgame, endgame classification based on remaining material and activity.

### AI-007 - Implement candidate pruning
- Drop obviously dominated candidates while preserving legality and determinism.

### AI-008 - Implement 2-ply search
- Search active move plus danger-aware opponent response.

### AI-009 - Add iterative deepening and best-known move cache
- Always retain a legal move at every search depth.

### AI-010 - Add decision trace export
- Persist per-turn AI reasoning data for offline analysis.

### AI-011 - Build self-play batch harness
- Run large numbers of AI-vs-AI matches with seeds and trace output.

### AI-012 - Add learned evaluator experiment path
- Optional offline pipeline informed by self-play traces.

## 8. Test Plan
### Unit Tests
- evaluator signal outputs are deterministic
- threat maps are stable and correct on synthetic positions
- repetition detection triggers on known loops
- candidate pruning never removes all legal moves

### Integration Tests
- stronger engine defeats baseline engine in controlled seed sets
- AI still respects `<= 10,000 ms` hard cap
- timeout fallback remains legal and deterministic
- mixed Human+AI flow still resolves correctly

### Soak Tests
- 100-match tuning loop for iteration
- 250+ autoplay matches before release readiness review

### Quality Benchmarks
- unique pieces activated by turn 12
- repetition frequency per match
- average material swing quality after move commit
- king-loss blunder rate
- median and P95 decision time

## 9. Data Policy
Use external chess knowledge as heuristic inspiration only:
- piece safety ideas
- mobility concepts
- development principles
- search and move-ordering strategies

Do not train directly on standard chess game logs for move imitation. CubeChess differs too much in:
- board geometry
- player count
- threat topology
- opening structure
- victory dynamics

Use self-play CubeChess traces as the main future learning corpus.

## 10. Recommended Build Order
### Immediate
1. AI-001
2. AI-002
3. AI-003
4. AI-004
5. AI-005

### Next
1. AI-007
2. AI-008
3. AI-009
4. AI-010

### After Engine Stabilizes
1. AI-011
2. AI-012
3. Difficulty/style profiles

## 11. M4/M5/M6 Integration
### M4
- build evaluator v2
- add pruning
- add budgeted search
- capture AI telemetry

### M5
- expose decision data in readability UI
- improve move explanation and spectator understanding
- tune visual pacing around stronger decision logic

### M6
- large-scale soak validation
- KPI review for AI quality and latency
- final difficulty tuning

## 12. Exit Criteria For "Champion" Label
The AI may be labeled "Champion" only when:
- it consistently beats the baseline heuristic engine
- it avoids common stale loops in soak runs
- it activates a broader share of its pieces
- it remains inside latency budget
- its decision traces support post-match inspection
- its stronger play is visibly apparent to a spectator without requiring explanation
