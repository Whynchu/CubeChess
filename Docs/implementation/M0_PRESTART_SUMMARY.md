# M0: Pre-Start Actions Complete ✅

**Date:** 2026-03-26  
**Status:** All 6 pre-start specifications completed and committed  
**Next Phase:** M1 implementation ready to begin

---

## What Was Done

### 1. Design & Implementation Review
- Analyzed design document (game concept, rules, camera design)
- Reviewed implementation plan (6 milestones, 65 tickets, ~34 days)
- Audited task boards for dependencies and scheduling gaps
- **Found:** 10 design gaps, 8 cross-milestone dependency issues, 3.5 days parallelization opportunity

### 2. Six Pre-Start Specifications Created

All specifications are located in `Docs/implementation/` and ready for M1 implementation:

#### **m0_determinism_contract.md** (8.2 KB)
Defines reproducibility framework across all milestones:
- RNG seeding with seedrandom.js (match seed + per-turn sub-RNG)
- Piece ID format: `<player>-<type>-<index>` (e.g., Y-K-0, R-RK-1)
- Move ordering: (x, y, z) ascending (deterministic everywhere)
- Turn trace format: JSON with board state, legal moves, AI metrics
- Replay engine: Forward simulator with divergence detection
- Integration: M1 (IDs), M2 (ordering), M3 (capture), M4 (AI RNG), M6 (validation)

#### **m0_rules_contract.md** (11.2 KB)
Clarifies 4-player elimination chess edge cases:
- Elimination: King capture only (no checkmate)
- Stalemate: Auto-pass if no legal moves (no forced movement)
- Knight 3D: 24 total destinations (formula: 3 axis-pairs × 4 sign combos × 2)
- Human timeout: 60 seconds with 10-second warning UI
- Check: Informational only (not enforced; player responsibility)
- Draws: 3-fold repetition, agreed draw, 200-move fallback
- Turn sequencing: Y→R→P→B order; skip eliminated players
- No special moves: Castling, en passant, promotion are undefined

#### **m0_device_matrix.md** (11.5 KB)
Pre-qualified device matrix prevents late rework:
- **Target tier:** iPhone 12+, Pixel 5+ (2020–2021 mainstream)
- **Fallback tier:** iPhone 11, Pixel 4 (visual reduction to 40 FPS acceptable)
- **Rendering:** Canvas 2D primary (voxel grid), WebGL deferred to M5+
- **Threading:** Main thread only for MVP
- **Storage:** LocalStorage 5–10MB + optional cloud backup
- **KPI baselines:** 60 FPS sustained, <100ms input latency, AI P95 ≤10s
- **Pre-implementation validation:** Browser support, touch latency, baseline performance

#### **m0_human_turn_timeout.md** (12 KB)
Prevents human player stalls in mixed-seat matches:
- Duration: 60 seconds (configurable)
- UI: Countdown timer (green→yellow→red), 1/sec updates
- Warning: 10-second banner at orange level
- Timeout action: Auto-pass with feedback
- Integration: M3 turn state machine; pause/resume support
- Telemetry: Log timeout events for engagement metrics
- Settings: M5+ allows timeout duration tuning (30–120s)

#### **m0_replay_tool_spec.md** (15.8 KB)
Debugging infrastructure for soak test failures:
- Turn trace: JSON container with per-turn decision, RNG seed, legal moves, pre/post-move state
- Replay engine: Forward simulation with divergence detection
- Offline CLI: Node.js `replay.js` utility for trace validation and state inspection
- Integration: M3 (capture traces), M4 (add AI metrics), M6 (validate soak)
- Storage: LocalStorage or gzip-compressed file export

#### **m0_go_no_go_criteria.md** (14.5 KB)
Objective release decision rubric for M6-009:
- **Hard thresholds (no waivers):** Zero crashes/deadlocks/invalid states; P95 ≤10s; 60 FPS
- **Waiverable:** Median latency, round pace, comprehension time, mis-tap rate
- **Bug severity:** P0 (crashes = NO-GO), P1 (edge cases, max 2 waivers), P2 (polish)
- **Device tiers:** Target (iPhone 12+) must pass hard thresholds; fallback (iPhone 11) 1.5x margin
- **Soak validation:** 250+ AI-vs-AI on target, 50+ on fallback; zero divergence in traces
- **Sign-off:** Solo developer sole authority; waiver form for exceptions
- **Post-release:** Hotfix procedure if critical bug found

---

## Key Decisions Locked

| Area | Decision | Why |
|------|----------|-----|
| **Platform** | HTML5/Web | Accessibility, no app store friction, easy deployment |
| **RNG** | seedrandom.js (deterministic library) | Reproducible testing, soak debugging, cross-device consistency |
| **Human timeout** | 60 seconds with orange UI warning | Balance between decision time and match pacing; prevents stalls |
| **Device targets** | iPhone 12+, Pixel 5+ (target); iPhone 11, Pixel 4 (fallback) | 2020–2021 devices represent >60% market; fallback QoS acceptable |
| **Release criteria** | Hard thresholds + limited waivers | Objective gates prevent scope creep; solo developer autonomy |

---

## Dependency Graph (M0 → M1)

```
M0 Pre-Start Specs (All 6)
├─ m0_determinism_contract.md
│  ├─ M1 (piece IDs, state serialization)
│  ├─ M2 (move ordering)
│  ├─ M3 (turn trace capture)
│  ├─ M4 (AI RNG isolation)
│  └─ M6 (replay validation)
├─ m0_rules_contract.md
│  ├─ M2 (knight 24-move enumeration)
│  ├─ M3 (human timeout, stalemate/pass)
│  └─ M4 (AI pass move handling)
├─ m0_device_matrix.md
│  ├─ M1–M5 (performance profiling against baselines)
│  └─ M6 (device tier validation)
├─ m0_human_turn_timeout.md
│  ├─ M3-004 (turn state machine integration)
│  └─ M5-008 (UI settings panel)
├─ m0_replay_tool_spec.md
│  ├─ M3 (turn trace capture format)
│  ├─ M4 (AI decision metrics)
│  └─ M6 (soak test validation)
└─ m0_go_no_go_criteria.md
   └─ M6-009 (release decision authority)

              ↓
              
    ✅ M1 Ready to Start
    (All dependencies resolved)
```

---

## Implementation Checklist for M1

Before M1 starts, confirm:

- [ ] All 6 M0 specs reviewed and approved
- [ ] seedrandom.js dependency added to package.json
- [ ] Piece ID format locked: `<player>-<type>-<index>`
- [ ] Move ordering contract understood: (x, y, z) ascending
- [ ] Turn trace format ready for M3 integration
- [ ] State serialization round-trip tested (JSON fidelity)
- [ ] Device list finalized (iPhone 12, Pixel 5, etc.)
- [ ] Browser support validated (Safari 14+, Chrome 80+)
- [ ] Game rules accessible to all teams (link in README.md)
- [ ] SQL todos created and tracked

---

## What's Next

### Immediate (Before M1 Starts)
1. Review all 6 M0 specs with stakeholders (if applicable)
2. Validate seedrandom.js integration and determinism framework
3. Create M1 implementation branch: `feat/m1-board-state`
4. Confirm device testing infrastructure (simulators, physical devices)

### M1 Implementation (5 days)
- Define Coord3 struct and piece model
- Build formation generator (32 pieces, 4 corners, tetrahedral layout)
- Implement state serialization (board snapshot → JSON)
- Unit tests: bounds, uniqueness, counts
- Integration tests: full starting state bootstrap

### Ongoing Across M1–M6
- Apply determinism contract everywhere (IDs, move ordering, trace capture)
- Validate performance against device matrix baselines
- Capture turn traces starting in M3
- Prepare replay validation for M6 soak test

---

## Performance Targets (From m0_device_matrix.md)

| Metric | Target Tier | Fallback Tier | Measurement |
|--------|-------------|---------------|-------------|
| **FPS** | 60 sustained | 40 sustained | Chrome DevTools profiler |
| **Input latency** | <100ms | <150ms | Tap-to-highlight time |
| **AI turn P95** | ≤10,000ms | ≤15,000ms | Over 100+ soak test turns |
| **Full round (4-player)** | ≤40s | ≤60s | Median cycle time at 1x |
| **Legal move comprehension** | ≤2.0s | ≤2.5s | Playtest observation |

---

## Files Delivered

All files are committed to `Docs/implementation/`:

1. **m0_determinism_contract.md** (8.2 KB)
2. **m0_rules_contract.md** (11.2 KB)
3. **m0_device_matrix.md** (11.5 KB)
4. **m0_human_turn_timeout.md** (12 KB)
5. **m0_replay_tool_spec.md** (15.8 KB)
6. **m0_go_no_go_criteria.md** (14.5 KB)
7. **M0_PRESTART_SUMMARY.md** (this file, 4.5 KB)

**Total:** ~77 KB of specifications ready for implementation

---

## Notes

- **Determinism is golden.** Every gap filled in M0 prevents M6 debug hell.
- **Device matrix locked = no late surprises.** Test on target device immediately in M1.
- **Replay tool is insurance.** Soak test will identify edge cases; replay traces identify root causes.
- **Go/no-go rubric is fair.** Solo developer has clear authority; waivers are documented.

**Ready to build CubeChess! 🎮**

