# M3 Handoff Notes

## Implemented Modules
- `Runtime/Core/Seats/seatConfig.js`
- `Runtime/Core/Seats/index.js`
- `Runtime/Core/AI/aiTurnRunner.js`
- `Runtime/Core/AI/index.js`
- `Runtime/Core/Turn/turnStateMachine.js`
- `Runtime/Core/Turn/index.js`

## Seat Contracts
- `ControllerType`: `Human | AI`
- `createSeatConfig(mapping)` validates full player mapping in canonical `TURN_ORDER`.
- Presets:
  - `presetAllAI()`
  - `presetOneHumanThreeAI(humanPlayer)`
  - `presetTwoHumanTwoAI(firstHuman, secondHuman)`

## Turn System Contracts
State machine phases:
- `Idle`
- `AwaitingHumanMove`
- `AwaitingAIMove`
- `ResolvingMove`
- `MatchEnded`

Core API:
- `beginTurn()`
- `submitHumanMove({ player, move })`
- `resolveAITurn({ requestMove, budgetMs })`

Behavior guarantees:
- Deterministic turn order from `TURN_ORDER` with skip-eliminated handling.
- Out-of-turn human submissions are rejected.
- AI turns use hard budget timeout path with fallback move.
- No-legal-move turns auto-pass and advance turn.

## Elimination and Match End
- King capture eliminates the owning player.
- Eliminated player's remaining pieces are marked dead and removed from occupancy map.
- Winner resolves when one non-eliminated player remains.

## AI Timeout Path
- `runAITurn({ requestMove, fallbackMove, budgetMs })` uses `AbortController` and timer race.
- On timeout or AI error/null result, deterministic fallback move is applied.
- Budget default is `10_000 ms`.

## Validation Added
Test harness (`npm test`) now includes:
- Seat preset validation
- All-AI deterministic round progression
- Human gate and out-of-turn rejection
- King-capture elimination and winner declaration
- AI timeout fallback behavior

Performance benchmark:
- Command: `npm run bench:m3`
- Script: `Tests/Performance/m3_turn_benchmark.js`
- Outputs P95 turn latency and median round latency against M3 targets.

## Next Step (M4)
- Plug `TurnStateMachine` into WebGL loop and event feed.
- Implement baseline heuristic `requestMove` policy.
- Add spectator controls: pause/resume, speed, follow active move.
