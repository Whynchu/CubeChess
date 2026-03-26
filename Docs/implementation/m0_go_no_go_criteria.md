# M0: M6 Go/No-Go Decision Rubric

**Purpose:** Define the objective criteria and decision-making authority for the M6-009 go/no-go release decision.

**Scope:** Performance KPI thresholds, stability requirements, waivers, and sign-off procedures.

---

## 1. Go/No-Go Decision Matrix

### 1.1 Performance KPIs (Hard Thresholds)

| Category | Metric | Target Tier | Fallback Tier | Waiver Allowed? |
|----------|--------|-------------|---------------|-----------------|
| **Stability** | Crash-free soak (250+ matches) | 100% | 100% | ❌ NO |
| **Stability** | Invalid state assertions | 0 | 0 | ❌ NO |
| **Stability** | Deadlocks detected | 0 | 0 | ❌ NO |
| **Performance** | AI turn P95 latency | ≤10,000ms | ≤15,000ms | ⚠️ YES (lead approval) |
| **Performance** | AI turn median latency | ≤3,000ms | ≤5,000ms | ✅ YES (optional) |
| **Performance** | Full round pace (1x) | ≤40s | ≤60s | ✅ YES (optional) |
| **Performance** | FPS sustained | 60 FPS | 40 FPS | ⚠️ YES (lead approval) |
| **Readability** | Legal move comprehension | ≤2.0s median | ≤2.5s median | ✅ YES (optional) |
| **Readability** | Mis-tap rate | ≤8% | ≤10% | ✅ YES (optional) |
| **Readability** | Camera reorientation events | ≤1/turn median | ≤1.5/turn | ✅ YES (optional) |

### 1.2 Decision Rules

**GO (Release Ready):**
- ✅ All hard thresholds (Stability + AI P95 + FPS) pass on target tier
- ✅ All hard thresholds (Stability + AI P95 + FPS) pass on fallback tier
- ✅ No unresolved P0 or P1 bugs

**CONDITIONAL GO (Release with Waivers):**
- ✅ All hard thresholds pass on target tier
- ⚠️ One or more optional/waiverable thresholds missed (median latency, comprehension time, etc.)
- ⚠️ Waivers signed by lead developer
- ✅ No P0 bugs (P1 requires waiver)

**NO-GO (Do Not Release):**
- ❌ Any hard threshold (stability, P95 latency, FPS) fails on target tier
- ❌ Any crash, deadlock, or invalid state in soak test
- ❌ Unresolved P0 bug (critical stability or correctness issue)
- ❌ More than 2 P1 bugs without explicit waivers

---

## 2. Stability Requirements (Absolute)

### 2.1 Crash-Free Criteria
**Definition:** No unhandled exceptions, null pointer dereferences, or runtime errors.

**Validation:**
- Run 250+ AI-vs-AI matches on target tier device (iPhone 12+)
- Run 50+ AI-vs-AI matches on fallback tier device (iPhone 11)
- Verify zero crashes in soak test run
- Verify zero segmentation faults or WebGL errors in console

**Failure Criteria:**
- Any crash during soak test → **NO-GO**

### 2.2 Invalid State Criteria
**Definition:** No impossible board states (duplicate occupancy, missing king, invalid piece ID, etc.).

**Validation:**
- After every move in soak test, assert board invariants
- Check: no duplicate occupancy, all players have kings (until eliminated), turn count continuity
- Log any invariant violations with turn index and state snapshot

**Failure Criteria:**
- Any invalid state detected during soak test → **NO-GO**

### 2.3 Deadlock Criteria
**Definition:** No turns where no legal moves exist (stalemate is OK; deadlock is hang).

**Validation:**
- Monitor turn execution time; flag outliers (>20s on target, >30s fallback)
- Check for repeated "same player" turns (indicates turn order bug)
- Manual inspection of soak test logs for any turn that took >5x median

**Failure Criteria:**
- Any deadlock (turn never completes) → **NO-GO**

---

## 3. Performance Requirements (Hard Thresholds with Limited Waivers)

### 3.1 AI Turn Latency (P95)
**Metric:** 95th percentile of AI turn decision time across all turns in soak test.

**Target:** ≤10,000ms (hard cap; non-negotiable for MVP)
**Fallback:** ≤15,000ms (acceptable degradation for slower devices)

**Measurement:**
- Record `decisionMetrics.executionTimeMs` for each turn
- Sort all turns by execution time
- P95 = value at index `ceil(0.95 * turnCount)`

**Waiver Criteria:**
- ⚠️ Target tier P95 misses by <500ms → lead can waive (MVP-ready)
- ❌ Target tier P95 misses by >500ms → NO-GO (needs M4 optimization)
- ⚠️ Fallback tier P95 misses → optional waiver (fallback is best-effort)

### 3.2 AI Turn Latency (Median)
**Metric:** 50th percentile of AI turn decision time.

**Target:** ≤3,000ms (soft target; allows for variance)
**Fallback:** ≤5,000ms

**Waiver:** ✅ Full waiver allowed (informational, not required for release)

### 3.3 Full Round Pace
**Metric:** Time for one complete 4-player turn cycle (Yellow → Red → Purple → Blue).

**Target:** ≤40s at 1x playback speed (median)
**Fallback:** ≤60s

**Measurement:**
- Record timestamp at start of Y's turn and end of B's turn
- Collect 20+ full rounds; compute median cycle time

**Waiver:** ✅ Full waiver allowed (pacing is UX tuning, not correctness)

### 3.4 Frame Rate
**Metric:** FPS sustained during normal gameplay (not during AI decision, not with UI overlay).

**Target:** 60 FPS sustained on target tier (iPhone 12+)
**Fallback:** 40 FPS sustained on fallback tier (iPhone 11)

**Measurement:**
- Use browser DevTools Performance profiler or custom frame counter
- Measure FPS over 30-second gameplay segment (AI-vs-AI autoplay)
- Flag any frame drops >20ms (below 50 FPS)

**Waiver Criteria:**
- ⚠️ Target tier misses 60 FPS by <5 FPS → lead can waive (acceptable jitter)
- ❌ Target tier drops below 50 FPS consistently → NO-GO (performance regression)

---

## 4. Readability and UX Requirements (Optional Waives)

### 4.1 Legal Move Comprehension Time
**Metric:** Median time for user to identify and select a legal destination after move prediction displayed.

**Target:** ≤2.0 seconds
**Measurement:** User study proxy or playtest observation

**Waiver:** ✅ Full waiver (UX target; can ship at 2.5s if other KPIs good)

### 4.2 Mis-Tap Rate
**Metric:** (Incorrect taps / total taps) during mixed-seat human play tests.

**Target:** ≤8%
**Measurement:** Telemetry tracking during M5 playtests or M6 UAT

**Waiver:** ✅ Full waiver (interaction polish; can iterate post-launch)

### 4.3 Camera Reorientation Events
**Metric:** Number of times user must reorient camera to find selected piece after rotation.

**Target:** ≤1 per turn median
**Measurement:** Telemetry or playtest observation

**Waiver:** ✅ Full waiver (UX comfort; can address with settings)

---

## 5. Bug Severity Levels

### 5.1 P0 (Critical, Blocks Release)
**Definition:** Crashes, invalid states, or rule violations that make game unplayable.

**Examples:**
- App crashes after move 50 in AI-vs-AI match
- King capture not triggering elimination
- AI timeout causes invalid state (illegal move in trace)

**Action:** Must be fixed before release. No waivers.
**Count Limit:** ZERO P0 bugs allowed.

### 5.2 P1 (High, Should Fix Before Release)
**Definition:** Gameplay works but has edge-case bugs, minor rule violations, or UI issues.

**Examples:**
- Camera occasionally clips through a piece
- Human timeout displays incorrectly at 60s (cosmetic)
- Rare <1% chance of stalemate not handled correctly
- One fallback device (iPhone 11) drops frames during dense midgame

**Action:** Should fix. Up to 2 P1 bugs can be waived with lead approval.
**Count Limit:** 0–2 waivers allowed; >2 → NO-GO.

### 5.3 P2 (Medium, Polish/Post-MVP)
**Definition:** Nice-to-have improvements, non-critical UX polish, or future optimizations.

**Examples:**
- Capture animation timing could be 10ms faster
- Threat indicator color palette could be more vivid
- AI could explore 1 level deeper with more optimization

**Action:** Can be deferred to post-launch. No waivers needed (automatically approved).
**Count Limit:** Unlimited P2 bugs acceptable for release.

### 5.4 Bug Triage Process
**Before M6-009 decision:**
1. List all known bugs (from M6-001 regression pass, M6-007 bug bash)
2. Classify each as P0, P1, or P2
3. For P1 bugs: assess fix cost vs release readiness
4. For P2 bugs: note in release notes; create backlog tickets

**Sign-off:** Lead developer reviews and approves bug list before go/no-go decision.

---

## 6. Device Tier Validation

### 6.1 Target Tier Validation (Required)
**Devices:** iPhone 12+, Pixel 5+, or equivalent

**Criteria:**
- ✅ All hard thresholds (stability, P95 latency, 60 FPS) pass
- ✅ No P0 bugs
- ✅ At most 2 P1 bugs with waivers

**Result:** GO if passes; NO-GO if fails

### 6.2 Fallback Tier Validation (Required)
**Devices:** iPhone 11, Pixel 4, or equivalent

**Criteria:**
- ✅ All hard thresholds (stability, P95 ≤15s, 40 FPS) pass
- ✅ No P0 bugs
- ✅ At most 2 P1 bugs with waivers

**Result:** GO if passes; NO-GO if fails hard thresholds

### 6.3 Unqualified Devices (No-Scope)
**Out of scope for MVP:** Devices with <3GB RAM, iOS <14, Android <11, or no WebGL support

**Note:** If late discovery finds a significant device population (>10% market) that can't run CubeChess, escalate to stakeholders for scope decision.

---

## 7. Sign-Off Procedure

### 7.1 Pre-Decision Review (M6-009 Tasks)
1. **Stabilty Check:** Review soak test logs; confirm zero crashes, deadlocks, invalid states
2. **Performance Measurement:** Gather all KPI data (P95, median, FPS); create summary table
3. **Bug Triage:** List all known bugs; classify P0/P1/P2; document fix rationale or waiver justification
4. **Device Validation:** Confirm target and fallback device results; document any device discovery issues
5. **Risk Review:** Re-read agents.md and M0 docs; confirm no new blockers

### 7.2 Decision Authority
**Solo Developer:**
- Sole decision maker; all authority
- Recommend peer review if available (post-MVP)

**Multi-person team (future):**
- **Lead Developer:** Authority on all technical decisions (bugs, waivers, release timing)
- **QA Lead:** Validates KPI measurements and soak test results
- **Product Owner:** Approves scope/feature set (not release gate for MVP)

### 7.3 Waiver Form
**For any P95 latency, FPS, or P1 bug waiver, document:**

```
Waiver Request: [Brief Title]
Severity: [P0/P1/Performance/UX]
Threshold: [e.g., "AI P95 latency 10.5s (target ≤10s)"]
Impact: [Why is this acceptable for MVP? e.g., "Falls within 5% buffer; acceptable for launch"]
Mitigation: [Post-launch fix plan, if any]
Approved By: [Name]
Date: [ISO date]
```

### 7.4 Go/No-Go Record
**After decision, create record:**

```json
{
  "decision": "GO",  // or "CONDITIONAL_GO", "NO_GO"
  "date": "2026-04-30",
  "developer": "Solo Developer",
  "stability": {
    "crashes": 0,
    "deadlocks": 0,
    "invalid_states": 0,
    "soak_matches": 250,
    "soak_device": "iPhone 12"
  },
  "performance": {
    "ai_p95_ms": 9800,
    "ai_median_ms": 2900,
    "fps_target": 60,
    "fps_fallback": 42
  },
  "bugs": {
    "p0_count": 0,
    "p1_count": 1,
    "p2_count": 8,
    "p1_waiver_description": "Camera occasional clipping (non-gameplay-affecting)"
  },
  "devices_validated": ["iPhone12", "Pixel5", "iPhone11"],
  "release_notes": "MVP ready for soft launch",
  "next_backlog": ["Camera collision polish", "AI difficulty levels", "Cosmetic VFX"]
}
```

---

## 8. Post-Release Procedures (If Critical Issue Found)

### 8.1 Critical Bug Discovered After Launch
**Definition:** Crash, rule violation, or P0 severity found in production.

**Action:**
1. Gather crash logs or reproduction steps
2. Assess if issue is deterministic or rare (<0.1%)
3. If deterministic, halt new releases; prioritize fix
4. If rare, monitor; fix in next patch release
5. Update release notes with known issues

### 8.2 Hotfix Release Window
**If critical bug found within 7 days of launch:**
1. Reproduce and fix
2. Re-run focused soak test (50+ matches covering issue scenario)
3. Re-validate KPIs (AI latency, FPS)
4. Patch release with change notes

**If after 7 days:** Include fix in next milestone release (M5.1 or M6.1).

---

## 9. Implementation Checklist

- [ ] **M6-001:** Full regression pass; confirm no new bugs vs M5
- [ ] **M6-002:** Soak test 250+ AI-vs-AI matches on target device
- [ ] **M6-002:** Soak test 50+ AI-vs-AI matches on fallback device
- [ ] **M6-004:** Performance profiling; gather all KPI measurements
- [ ] **M6-008:** Device validation on target + fallback tiers
- [ ] **M6-009:** Bug triage; classify all issues P0/P1/P2
- [ ] **M6-009:** Stability check; review soak logs (crashes, deadlocks)
- [ ] **M6-009:** KPI summary table created
- [ ] **M6-009:** All hard thresholds (P0 count, P95 latency, FPS) verified
- [ ] **M6-009:** Waiver forms (if any) signed
- [ ] **M6-009:** Go/no-go record completed and approved
- [ ] **M6-010:** Release notes and next backlog documented

---

## 10. Example Scenarios

### Scenario 1: Clean Go
```
Soak Test Results (250 matches):
  Crashes: 0
  Invalid states: 0
  AI P95: 9,800ms (target 10,000ms ✅)
  AI Median: 2,900ms (soft target ✅)
  FPS (iPhone 12): 60 FPS sustained ✅
  FPS (iPhone 11): 42 FPS sustained ✅
  
Known Bugs: 3 P2 (camera animation timing, threat color, AI search depth)

Decision: GO ✅
Rationale: All hard thresholds pass; no P0/P1 bugs.
```

### Scenario 2: Conditional Go (With Waiver)
```
Soak Test Results (250 matches):
  Crashes: 0
  Invalid states: 0
  AI P95: 10,300ms (target 10,000ms ❌ misses by 300ms)
  AI Median: 3,100ms ✅
  FPS (iPhone 12): 59 FPS (target 60 FPS ⚠️ marginal)
  
Known Bugs: 1 P1 (human timeout UI displays 60.1s instead of 60s on rare refresh)

Decision: CONDITIONAL GO ✅ (with waiver)
Waivers Approved:
  - AI P95 latency waive by 300ms (within buffer; optimization complex)
  - P1 timeout UI waive (cosmetic; non-gameplay-affecting)
Mitigation: Create backlog ticket "AI optimization pass" for post-launch.
```

### Scenario 3: No-Go
```
Soak Test Results (250 matches on target device):
  Crashes: 2 (app crashed at turn 87 in match 47, turn 120 in match 93)
  Invalid states: 1 (board occupancy corrupted in match 102)
  
Decision: NO-GO ❌
Rationale: Crashes and invalid states block release (P0 severity).
Action: Investigate crash root cause; audit state mutation logic. Retest after fixes.
```

---

## 11. Cross-Milestone Dependencies

- **M6 depends on:** All M1–M5 acceptance criteria passed
- **M6 depends on:** KPI measurements from M2, M3, M4, M5 available for trending
- **M6 depends on:** Soak test infrastructure (M6-002) operational

