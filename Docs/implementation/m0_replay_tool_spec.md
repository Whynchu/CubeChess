# M0: Replay Tool and Trace Infrastructure Specification

**Purpose:** Define the replay tool and turn tracing infrastructure for debugging soak test failures, validating determinism, and enabling forensic analysis of divergences.

**Scope:** Turn trace format, replay engine, divergence detection, offline debugging, and integration with M6 soak test pipeline.

---

## 1. Overview

### 1.1 Core Concepts
- **Turn Trace:** Immutable record of every move decision + game state from a match
- **Replay Engine:** Forward simulator that consumes a trace and reconstructs the match turn-by-turn
- **Divergence Detection:** Comparison of replayed state vs recorded state to identify where behavior changed
- **Offline Replay:** Standalone tool to run trace through JavaScript/CLI without full game engine

### 1.2 Use Cases
1. **Soak test failure debugging:** Match 47/250 crashed at turn 89; replay from trace to identify root cause
2. **Cross-device validation:** Match on iPhone 12; replay on Android or browser to check consistency
3. **Performance profiling:** Replay match at slow speed to measure per-turn latency distribution
4. **AI behavior analysis:** Inspect AI decision-making at specific turn; understand tie-breaking, candidate ranking

---

## 2. Turn Trace Format

### 2.1 Trace Container (JSON)
```json
{
  "version": "1.0",
  "matchMetadata": {
    "matchSeed": "20260326-1234-ai-vs-ai",
    "createdAt": "2026-03-26T22:50:00Z",
    "gameVersion": "0.1.0",
    "players": ["Yellow", "Red", "Purple", "Blue"],
    "seatModes": {
      "Yellow": "AI",
      "Red": "AI",
      "Purple": "AI",
      "Blue": "AI"
    },
    "deviceInfo": {
      "platform": "iOS",
      "device": "iPhone12",
      "osVersion": "15.4",
      "browserVersion": "Safari 15.4"
    }
  },
  "initialState": {
    "version": "1.0",
    "board": { /* board occupancy */" },
    "pieces": { /* piece data */ },
    "activePlayer": "Yellow",
    "turnCount": 0
  },
  "turns": [
    { /* turn 0 */ },
    { /* turn 1 */ },
    ...
  ],
  "finalState": { /* board state at match end */ },
  "matchResult": {
    "winner": "Purple",
    "eliminationOrder": ["Yellow", "Red", "Blue"],
    "totalTurns": 127,
    "duration": 156.234  // seconds
  }
}
```

### 2.2 Turn Record Format (Per Turn)
```json
{
  "turnIndex": 42,
  "player": "Red",
  "rngSeed": "20260326-1234-ai-vs-ai-turn-42",
  "timestamp": 1648231200000,
  
  "gameStateBeforeMove": {
    "voxels": [ /* 512-element array: occupancy */ ],
    "eliminatedPlayers": ["Yellow"],
    "lastMove": { /* previous move */ }
  },
  
  "legalMoves": [
    {
      "moveId": "R-RK-0@5.7.7->5.7.6",
      "pieceId": "R-RK-0",
      "from": { "x": 5, "y": 7, "z": 7 },
      "to": { "x": 5, "y": 7, "z": 6 },
      "isCapture": false,
      "candidateRank": 0,  // Order in sorted legal move list
      "evaluationScore": 2.34
    },
    { /* ... more legal moves ... */ }
  ],
  
  "selectedMove": {
    "moveId": "R-RK-0@5.7.7->5.7.6",
    "pieceId": "R-RK-0",
    "from": { "x": 5, "y": 7, "z": 7 },
    "to": { "x": 5, "y": 7, "z": 6 },
    "isCapture": false
  },
  
  "decisionMetrics": {
    "executionTimeMs": 1243,
    "timeoutOccurred": false,
    "decisionType": "AI",  // "AI", "Human", "Auto" (pass)
    "aiSearchDepth": 4,
    "candidatesPruned": 8
  },
  
  "gameStateAfterMove": {
    "voxels": [ /* updated occupancy */ ],
    "eliminatedPlayers": ["Yellow"],
    "lastMove": { /* the move just executed */ }
  },
  
  "telemetry": {
    "inputLatencyMs": 0,
    "renderTimeMs": 12,
    "moveResolveTimeMs": 145
  }
}
```

### 2.3 Compact Format (Optional, M6+)
For long matches or storage constraints, support compression:
- **Remove** `gameStateBeforeMove`/`gameStateAfterMove` (can be derived by replaying)
- **Store only** `selectedMove` and `legalMoves` summary
- **Compress with gzip** (typical 10:1 ratio)
- **Result:** 127-turn match compresses from ~1.5MB to ~150KB

---

## 3. Replay Engine

### 3.1 Replay Algorithm
```javascript
class MatchReplayer {
  constructor(trace) {
    this.trace = trace;
    this.currentState = JSON.parse(JSON.stringify(trace.initialState));
    this.turnIndex = 0;
  }

  replayTurn(turn, validateDivergence = true) {
    // 1. Validate pre-move state matches trace
    if (validateDivergence) {
      if (!statesEqual(this.currentState, turn.gameStateBeforeMove)) {
        throw new DivergenceError(
          `State divergence at turn ${turn.turnIndex}: ` +
          `expected ${JSON.stringify(turn.gameStateBeforeMove)}, ` +
          `got ${JSON.stringify(this.currentState)}`
        );
      }
    }

    // 2. Apply the recorded move
    const move = turn.selectedMove;
    applyMove(this.currentState, move);

    // 3. Validate post-move state matches trace
    if (validateDivergence) {
      if (!statesEqual(this.currentState, turn.gameStateAfterMove)) {
        throw new DivergenceError(
          `Post-move state divergence at turn ${turn.turnIndex}`
        );
      }
    }

    this.turnIndex++;
    return this.currentState;
  }

  replayFull(validateDivergence = true) {
    for (const turn of this.trace.turns) {
      this.replayTurn(turn, validateDivergence);
    }
    
    if (!statesEqual(this.currentState, this.trace.finalState)) {
      throw new DivergenceError('Final state divergence after all turns');
    }
    
    return this.trace.matchResult;
  }

  getStateAtTurn(turnIndex) {
    // Reset and replay up to turnIndex
    this.currentState = JSON.parse(JSON.stringify(this.trace.initialState));
    this.turnIndex = 0;
    
    for (let i = 0; i < turnIndex; i++) {
      this.replayTurn(this.trace.turns[i], false); // Skip validation for speed
    }
    
    return this.currentState;
  }
}
```

### 3.2 Divergence Reporting
```javascript
class DivergenceReport {
  constructor(trace, replayedTrace) {
    this.originalTrace = trace;
    this.replayedTrace = replayedTrace;
    this.divergences = [];
    
    this.analyze();
  }

  analyze() {
    for (let i = 0; i < this.originalTrace.turns.length; i++) {
      const orig = this.originalTrace.turns[i];
      const replay = this.replayedTrace.turns[i];
      
      if (orig.selectedMove !== replay.selectedMove) {
        this.divergences.push({
          turnIndex: i,
          player: orig.player,
          originalMove: orig.selectedMove,
          replayedMove: replay.selectedMove,
          severity: 'CRITICAL'  // Move selection changed
        });
      }
      
      if (orig.decisionMetrics.executionTimeMs !== replay.decisionMetrics.executionTimeMs) {
        this.divergences.push({
          turnIndex: i,
          player: orig.player,
          originalTime: orig.decisionMetrics.executionTimeMs,
          replayedTime: replay.decisionMetrics.executionTimeMs,
          severity: 'WARNING'  // Timing variance (expected)
        });
      }
    }
  }

  report() {
    console.log(`Divergence Report: ${this.divergences.length} issues found`);
    
    for (const div of this.divergences) {
      console.log(`[${div.severity}] Turn ${div.turnIndex} (${div.player})`);
      if (div.originalMove) {
        console.log(`  Original: ${JSON.stringify(div.originalMove)}`);
        console.log(`  Replayed: ${JSON.stringify(div.replayedMove)}`);
      }
    }
  }
}
```

---

## 4. Trace Capture (Runtime Integration)

### 4.1 M3 Integration
**During each turn, capture trace data:**

```javascript
class TurnSystem {
  async executeTurn() {
    const turnTrace = {
      turnIndex: this.turnCount,
      player: this.activePlayer.name,
      timestamp: Date.now(),
      gameStateBeforeMove: this.serializeState(),
      legalMoves: this.board.getLegalMoves(this.activePlayer),
      rngSeed: `${this.matchSeed}-turn-${this.turnCount}`
    };

    // Decide move (human or AI)
    const move = await this.getPlayerMove();
    turnTrace.selectedMove = move;

    // Apply move
    const startTime = performance.now();
    this.board.applyMove(move);
    turnTrace.decisionMetrics = {
      executionTimeMs: performance.now() - startTime,
      timeoutOccurred: this.lastMoveWasTimeout,
      decisionType: this.activePlayer.isHuman ? 'Human' : 'AI'
    };

    turnTrace.gameStateAfterMove = this.serializeState();

    // Store trace
    this.turnTraces.push(turnTrace);
    
    // Persist periodically (every 10 turns)
    if (this.turnCount % 10 === 0) {
      this.persistTurnTraces();
    }
  }

  persistTurnTraces() {
    const container = {
      version: '1.0',
      matchMetadata: this.getMetadata(),
      initialState: this.initialState,
      turns: this.turnTraces,
      currentState: this.serializeState()
    };
    
    localStorage[`match-trace-${this.matchSeed}`] = JSON.stringify(container);
  }
}
```

### 4.2 Match Completion
**At match end, finalize and store full trace:**

```javascript
async finishMatch(winner) {
  const finalTrace = {
    version: '1.0',
    matchMetadata: { /* ... */ },
    initialState: this.initialState,
    turns: this.turnTraces,
    finalState: this.serializeState(),
    matchResult: {
      winner: winner.name,
      totalTurns: this.turnCount,
      duration: (Date.now() - this.matchStartTime) / 1000
    }
  };

  // Store locally
  localStorage[`match-final-${this.matchSeed}`] = JSON.stringify(finalTrace);

  // Upload to cloud (optional)
  if (this.telemetryBackend) {
    await this.telemetryBackend.submitTrace(finalTrace);
  }
}
```

---

## 5. Offline Replay Tool

### 5.1 Node.js CLI Utility
```bash
# Usage
node replay.js --trace=match-trace-20260326-1234-ai-vs-ai.json [options]

# Options
--validate-divergence    Compare against original and report divergences
--replay-until-turn=50   Stop at turn 50 (default: all)
--export-state-at-turn=25 Export board state after turn 25
--output=report.json     Write report to file
```

### 5.2 Implementation (replay.js)
```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const GameState = require('./GameState');
const MatchReplayer = require('./MatchReplayer');

async function main() {
  const args = require('minimist')(process.argv.slice(2));
  
  // Load trace
  const tracePath = args.trace;
  if (!tracePath) {
    console.error('Usage: node replay.js --trace=<file> [options]');
    process.exit(1);
  }
  
  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
  console.log(`Replaying match: ${trace.matchMetadata.matchSeed}`);
  console.log(`  Players: ${trace.matchMetadata.players.join(', ')}`);
  console.log(`  Total turns: ${trace.turns.length}`);
  console.log(`  Winner: ${trace.matchResult.winner}`);
  
  // Run replay
  const replayer = new MatchReplayer(trace);
  const limit = args['replay-until-turn'] ? parseInt(args['replay-until-turn']) : trace.turns.length;
  
  try {
    for (let i = 0; i < limit && i < trace.turns.length; i++) {
      replayer.replayTurn(trace.turns[i], args['validate-divergence']);
    }
    console.log(`✓ Replay successful through turn ${limit - 1}`);
  } catch (error) {
    console.error(`✗ Replay failed: ${error.message}`);
    process.exit(1);
  }
  
  // Export state at turn (if requested)
  if (args['export-state-at-turn']) {
    const turnIdx = parseInt(args['export-state-at-turn']);
    const state = replayer.getStateAtTurn(turnIdx);
    const output = args.output || `state-turn-${turnIdx}.json`;
    fs.writeFileSync(output, JSON.stringify(state, null, 2));
    console.log(`Board state exported to ${output}`);
  }
}

main();
```

---

## 6. Soak Test Integration (M6)

### 6.1 Trace Collection Pipeline
**During M6-002 soak test:**

```javascript
class SoakTestRunner {
  constructor(numMatches = 250) {
    this.numMatches = numMatches;
    this.traces = [];
    this.divergences = [];
  }

  async runSoak() {
    for (let matchIdx = 0; matchIdx < this.numMatches; matchIdx++) {
      const match = createAIMatch();
      const trace = await match.play();
      
      this.traces.push(trace);
      
      // Validate determinism (replay immediately)
      if (true) {  // Enable for all matches
        this.validateTrace(trace);
      }
      
      console.log(`[${matchIdx + 1}/${this.numMatches}] Match complete. Winner: ${trace.matchResult.winner}`);
    }
    
    this.generateReport();
  }

  validateTrace(trace) {
    const replayer = new MatchReplayer(trace);
    try {
      replayer.replayFull(true);  // Validate divergence
      console.log(`  ✓ Trace validated (deterministic)`);
    } catch (error) {
      this.divergences.push({
        matchSeed: trace.matchMetadata.matchSeed,
        error: error.message
      });
      console.log(`  ✗ Trace validation failed: ${error.message}`);
    }
  }

  generateReport() {
    const report = {
      totalMatches: this.numMatches,
      successfulMatches: this.numMatches - this.divergences.length,
      divergenceCount: this.divergences.length,
      divergenceRate: (this.divergences.length / this.numMatches * 100).toFixed(2) + '%',
      divergences: this.divergences
    };
    
    fs.writeFileSync('soak-report.json', JSON.stringify(report, null, 2));
    console.log(`\nSoak Report: ${report.successfulMatches}/${this.numMatches} matches validated`);
  }
}
```

---

## 7. Implementation Checklist

- [ ] **M3:** Turn trace capture integrated into turn system (every turn logged)
- [ ] **M3:** State serialization function (serialize state to JSON)
- [ ] **M3:** Turn trace persistence to LocalStorage
- [ ] **M3:** Match finalization and trace export
- [ ] **M4:** AI decision metrics added to turn trace (executionTime, searchDepth, pruned count)
- [ ] **M6:** Replay engine implemented and unit tested
- [ ] **M6:** Divergence detection logic and reporting
- [ ] **M6:** Offline replay CLI tool (Node.js)
- [ ] **M6:** Soak test integrated with trace validation
- [ ] **M6:** Soak report generation (divergence rate, error log)
- [ ] **Tests:** Unit tests for replay engine (round-trip fidelity)
- [ ] **Tests:** Manual test: replay 10 traces from production, verify 0 divergences

---

## 8. Storage and Bandwidth

### 8.1 Per-Match Size Estimates
- **Uncompressed trace (127 turns):** ~1.5 MB
- **Compressed (gzip):** ~150 KB
- **LocalStorage quota:** 5–10 MB per origin (fits ~50 matches uncompressed)

### 8.2 Persistence Strategy
- **Recent matches (last 10):** Keep in LocalStorage (fast access)
- **Archive (older matches):** Export to cloud storage or file download
- **Soak test:** Store all 250+ match traces in memory during run; export summary at end

---

## 9. Cross-Milestone Dependencies

- **M1 depends on:** State serialization format locked
- **M3 depends on:** Turn trace format and capture logic implemented
- **M4 depends on:** AI decision metrics included in turn trace
- **M6 depends on:** Replay engine ready before soak test starts

---

## 10. Notes for Implementation

1. **Trace format is human-readable JSON** for debugging and analysis. Compression is optional optimization.
2. **Replay validation catches determinism bugs early.** If a trace fails to replay, immediately investigate RNG state, piece ID ordering, or move ordering differences.
3. **Offline replay tool is CLI-based** for integration into CI/CD pipelines (if added later).
4. **Don't over-instrument.** Trace only essential state; rendering metrics and telemetry are separate concerns.

