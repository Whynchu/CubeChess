# M0: Human Turn Timeout Specification

**Purpose:** Define the human turn timeout mechanism to prevent player inactivity from stalling mixed-seat matches.

**Scope:** Timeout duration, UI interaction, fallback behavior, telemetry, and integration with M3 turn system.

---

## 1. Human Turn Timeout Contract

### 1.1 Timeout Duration
- **Active turn timeout:** 60 seconds (configurable, but default is 60s)
- **Rationale:** Provides ample time for human decision-making while preventing indefinite stalls
- **Comparison:** Traditional chess gives 30–60s per blitz turn; 60s is middle ground

### 1.2 Timeout Clock
**Clock starts when:**
1. Turn system transitions to human player
2. Legal moves are displayed
3. UI is ready for input

**Clock ends when:**
1. Player commits a move (tap destination voxel), OR
2. 60 seconds elapse (timeout triggered)

### 1.3 Clock Visibility
- **Display:** Countdown timer visible on screen (e.g., "Your turn: 45 seconds remaining")
- **Position:** Top-right corner or turn banner area (same as seat/faction info)
- **Update frequency:** Every 1 second; smooth animation (no jank)
- **Color coding:** Green (>30s) → Yellow (10–30s) → Red (<10s)

---

## 2. Timeout Warning and Fallback

### 2.1 Warning Phase (10 seconds before timeout)
**At 10 seconds remaining:**

- Countdown timer turns **RED**
- **UI banner appears:** "⏱ Your turn expires in 10 seconds — tap to confirm move or it will be passed"
- **Audio cue:** Subtle beep or chime (if audio enabled; optional for MVP)
- **No forced move selection yet** (player can still choose destination)

### 2.2 Timeout Triggered (60 seconds elapsed)
**At timeout:**

1. **Move commit cancelled** (if player was in selection state)
2. **Automatic pass** executed (piece is not moved; turn passes to next player)
3. **UI message:** "Time's up! Passing your turn." (shown for 2 seconds)
4. **Telemetry:** Log timeout event with player, turn number, legal moves available

### 2.3 Pre-Timeout Input Still Accepted
**If player taps a destination at 59.9 seconds, move is committed** before timeout fires.

- Timeout check happens at discrete 1-second intervals (not continuous)
- Implementation: Check `(currentTime - turnStartTime) >= 60000` at input time

---

## 3. Edge Cases

### 3.1 No Legal Moves During Human Turn
**If human player has no legal moves:**

1. Auto-pass immediately (don't wait 60s)
2. Display: "No legal moves available. Passing turn." (1 second)
3. Move to next player

### 3.2 Spectator Mode (AI-vs-AI)
**Human timeout does not apply** (no human players).

- All turns are AI-controlled; spectator is passive observer
- Spectator can pause/resume but doesn't take turns

### 3.3 Mixed-Seat Scenario (1H + 3AI)
- Human's turn: 60s timeout active
- AI turns: No timeout (10s hard cap on AI decision, but not a "timeout" in user sense)
- If human passes due to timeout, game resumes normally with next AI player

### 3.4 Pause During Human Turn
**If spectator/UI pauses the game while human is thinking:**

- Timeout clock is **paused** (elapsed time frozen)
- When game resumes, timeout resumes from where it was
- Rationale: Pause is a UI control, not a move; shouldn't penalize the human

---

## 4. UI Implementation Details

### 4.1 Timeout Timer Widget
```javascript
// Pseudo-code for turn timer
class TurnTimer {
  constructor(durationMs = 60000) {
    this.durationMs = durationMs;
    this.startTime = Date.now();
    this.isPaused = false;
    this.pausedTime = 0;
  }

  getRemainingMs() {
    const elapsed = this.isPaused 
      ? this.pausedTime 
      : (Date.now() - this.startTime);
    return Math.max(0, this.durationMs - elapsed);
  }

  isExpired() {
    return this.getRemainingMs() <= 0;
  }

  pause() {
    this.isPaused = true;
    this.pausedTime = Date.now() - this.startTime;
  }

  resume() {
    this.isPaused = false;
    this.startTime = Date.now() - this.pausedTime;
  }
}
```

### 4.2 Timer Display
```html
<!-- Turn banner with timer -->
<div id="turnBanner">
  <span id="activePlayer">Yellow's Turn</span>
  <span id="timer" class="timer-green">60s</span>
</div>

<style>
  #timer {
    font-size: 18px;
    font-weight: bold;
    transition: color 0.3s ease;
  }
  #timer.timer-green { color: #00AA00; }
  #timer.timer-yellow { color: #FFAA00; }
  #timer.timer-red { color: #FF0000; animation: pulse 0.5s infinite; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
```

### 4.3 Warning Banner
```html
<!-- Shown at 10 seconds remaining -->
<div id="timeoutWarning" class="hidden">
  <p>⏱ Your turn expires in <span id="warningTime">10</span> seconds</p>
  <p>Tap a destination to confirm your move or it will be passed</p>
</div>

<style>
  #timeoutWarning {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: rgba(255, 100, 0, 0.9);
    color: white;
    padding: 20px;
    border-radius: 8px;
    text-align: center;
    z-index: 1000;
  }
  #timeoutWarning.hidden { display: none; }
</style>
```

---

## 5. Integration with M3 Turn System

### 5.1 Turn State Machine
**Add timeout as a state:**

```
TurnState: {
  PLAYER_WAITING_INPUT,   // Human turn, waiting for selection
  PLAYER_SELECTING,       // Human selected piece, awaiting destination
  AI_SEARCHING,           // AI deciding move
  TIMEOUT_PASSED,         // Timeout occurred, auto-pass
  MOVE_EXECUTING,         // Move animation in progress
  TURN_COMPLETE           // Turn resolved, next player's turn
}
```

### 5.2 Timeout Transition
```javascript
function updateTurnTimer(turnSystem) {
  if (turnSystem.activePlayer.isHuman && turnSystem.state === TurnState.PLAYER_WAITING_INPUT) {
    const remainingMs = turnSystem.humanTimer.getRemainingMs();
    
    if (remainingMs <= 10000 && !turnSystem.warningShown) {
      // Show warning
      showTimeoutWarning(remainingMs);
      turnSystem.warningShown = true;
    }
    
    if (remainingMs <= 0) {
      // Timeout triggered
      executeAutoPass(turnSystem);
      turnSystem.state = TurnState.TIMEOUT_PASSED;
      logTelemetry('human_timeout', { player: turnSystem.activePlayer, turn: turnSystem.turnCount });
    }
  }
}
```

### 5.3 Input Validation
**Before committing a move, check if timeout has occurred:**

```javascript
function commitMove(turnSystem, move) {
  if (turnSystem.activePlayer.isHuman && turnSystem.humanTimer.isExpired()) {
    console.warn('Move commit after timeout; ignoring input');
    return false; // Reject move
  }
  
  // Proceed with move
  executeMove(turnSystem, move);
  return true;
}
```

---

## 6. Telemetry

### 6.1 Timeout Events
Log the following to telemetry:

```javascript
{
  eventType: 'human_timeout',
  player: 'Yellow',
  turnNumber: 42,
  legalMovesAvailable: 12,
  timeRemainingMs: -100,  // Negative if exceeded
  moveInProgress: false,   // Was player mid-selection?
  timestamp: 1648231200000
}
```

### 6.2 Aggregation (M5+)
- **Total timeout events per match:** Should be 0 for engaged players
- **Average timeout events per match:** Indicator of player attentiveness
- **Timeout rate:** (timeout count) / (total human turns) per match

---

## 7. Configuration

### 7.1 Configurable Parameters
**Allow these to be tuned (M3 or later):**

- **Timeout duration:** 30–120 seconds (default 60s)
- **Warning threshold:** 5–15 seconds (default 10s)
- **Audio cue:** Enabled/disabled

### 7.2 UI Settings Panel
```html
<!-- M5+ feature -->
<fieldset>
  <legend>Human Turn Timeout</legend>
  <label>
    Timeout Duration:
    <select id="timeoutDuration">
      <option value="30">30 seconds</option>
      <option value="45">45 seconds</option>
      <option selected value="60">60 seconds (default)</option>
      <option value="90">90 seconds</option>
    </select>
  </label>
  <label>
    <input type="checkbox" id="audioTimeout" checked>
    Play warning sound
  </label>
</fieldset>
```

---

## 8. Implementation Checklist

- [ ] **M3-004:** Timer widget class with pause/resume (turnTimer.js)
- [ ] **M3-004:** UI banner with timer display and styling
- [ ] **M3-004:** Warning banner shown at 10s threshold
- [ ] **M3-004:** Timeout detection and auto-pass execution
- [ ] **M3-004:** Turn state machine integration (no player hanging)
- [ ] **M3-004:** Input validation (reject moves after timeout)
- [ ] **M3-004:** Telemetry logging for timeout events
- [ ] **M3-009:** Performance test: timer update does not cause frame drops
- [ ] **M5-008:** Settings UI for configurable timeout duration
- [ ] **Tests:** Unit test timeout logic with mock timers
- [ ] **Tests:** Integration test mixed-seat turn flow with timeout

---

## 9. Testing Strategy

### 9.1 Unit Tests
```javascript
describe('TurnTimer', () => {
  it('counts down to zero', () => {
    const timer = new TurnTimer(1000); // 1 second
    jest.advanceTimersByTime(500);
    expect(timer.getRemainingMs()).toBe(500);
    jest.advanceTimersByTime(500);
    expect(timer.isExpired()).toBe(true);
  });

  it('respects pause/resume', () => {
    const timer = new TurnTimer(1000);
    jest.advanceTimersByTime(300);
    timer.pause();
    jest.advanceTimersByTime(200);
    expect(timer.getRemainingMs()).toBe(700); // Not affected by advance
    timer.resume();
    jest.advanceTimersByTime(200);
    expect(timer.getRemainingMs()).toBe(500); // Resumes correctly
  });

  it('warns at 10 seconds', () => {
    const timer = new TurnTimer(60000);
    jest.advanceTimersByTime(50000);
    expect(timer.getRemainingMs()).toBe(10000);
    expect(timer.shouldShowWarning()).toBe(true);
  });
});
```

### 9.2 Integration Tests
```javascript
describe('Mixed-Seat Turn Flow with Timeout', () => {
  it('auto-passes when human timeout expires', () => {
    const match = createTestMatch({
      seats: { Y: 'human', R: 'AI', P: 'AI', B: 'AI' },
      humanTimeoutMs: 1000 // 1 second for testing
    });
    
    match.startTurn('Y');
    jest.advanceTimersByTime(1000);
    
    expect(match.activePlayer).toBe('R'); // Passed to next
    expect(match.getLastMoveType()).toBe('pass');
  });

  it('commits move if human confirms before timeout', () => {
    const match = createTestMatch({ humanTimeoutMs: 5000 });
    match.startTurn('Y');
    
    const move = match.getLegalMoves()[0];
    jest.advanceTimersByTime(2000); // Still within 5s
    match.commitMove(move);
    
    expect(match.getLastMove()).toEqual(move);
    expect(match.activePlayer).toBe('R');
  });
});
```

### 9.3 Manual Testing
- Start mixed-seat match with human
- Wait 60 seconds without moving
- Verify auto-pass occurs
- Verify warning shown at 50 seconds
- Verify timer counts down visually

---

## 10. Cross-Milestone Dependencies

- **M3-004 depends on:** Turn state machine (M3-002)
- **M3-004 depends on:** Human input gating (M3-004 initial work)
- **M3-005 depends on:** Timeout mechanism (needed for AI timeout too)
- **M5-008 depends on:** Settings UI for timeout configuration
- **Tests:** Integration tests in M3-008 must include timeout scenarios

---

## 11. Notes for Implementation

1. **Use `Date.now()` for timing**, not frame counters. Frame rate variance can cause timeout drift.
2. **Pause mechanism is important.** If user pauses the game, timeout should pause too (don't penalize).
3. **Auto-pass (no move) is not a move with value.** AI evaluator should handle it correctly in M4.
4. **Warning at 10 seconds is UX best practice.** Gives user 10 more seconds to act if they're still deciding.
5. **Consider accessibility:** Color-blind users may not see green/yellow/red. Add a text-based indicator ("TIME IS EXPIRING") as well.

