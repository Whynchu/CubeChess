# Cube Chess Milestone 5 Task Board

Milestone: `M5 - Readability, Feedback, and UX Polish`
Duration target: `4-6 days`
Source plan: `Docs/implementation/cube_chess_implementation_plan.md`
Depends on: `Docs/implementation/cube_chess_m4_task_board.md`

## 1. Milestone Goal
Polish visual clarity and interaction feedback so fast autoplay remains readable and mixed human+AI matches feel precise, understandable, and satisfying.

## 2. Definition of Done
- Move and capture feedback timing is clear and consistent at gameplay speeds.
- Turn-state UI and seat ownership are always obvious (Human vs AI).
- Readability overlays are prioritized and non-cluttered under dense board states.
- Camera and highlight systems remain understandable at `1x/2x/4x` playback.
- UX and performance acceptance metrics pass on target devices.

## 3. Ticket Board
| ID | Title | Est. | Owner | Depends On | Status |
|---|---|---:|---|---|---|
| M5-001 | Finalize highlight hierarchy and style system | 0.5d | UX/Rendering | M4 complete | Todo |
| M5-002 | Implement last-move and active-turn emphasis | 0.5d | UX/Rendering | M5-001 | Todo |
| M5-003 | Capture feedback pass (100-180 ms target) | 0.75d | VFX/Rendering | M5-001 | Todo |
| M5-004 | Seat clarity UI (Human/AI badges and turn banner) | 0.5d | UX | M3 seat model | Todo |
| M5-005 | Threat indicator tuning for dense midgame | 0.5d | UX/Rules | M5-001 | Todo |
| M5-006 | Camera readability polish across speed tiers | 0.75d | Camera | M4-006 | Todo |
| M5-007 | Interaction precision pass (tap/raycast confidence) | 0.5d | Input/UX | M3 human flow | Todo |
| M5-008 | Accessibility and readability options | 0.5d | UX | M5-001 | Todo |
| M5-009 | UX telemetry pass (mis-taps, reorientation, pause events) | 0.5d | Perf/UX | M5-004, M5-007 | Todo |
| M5-010 | Playtest suite: spectator + mixed-seat scenarios | 0.75d | QA/Design | M5-002..M5-009 | Todo |
| M5-011 | Performance validation on target device matrix | 0.5d | QA/Perf | M5-003, M5-006 | Todo |
| M5-012 | Release-candidate checklist and signoff notes | 0.25d | Core | M5-010, M5-011 | Todo |

## 4. UX Clarity Contracts
### 4.1 Highlight Priority (highest to lowest)
1. Active selected piece
2. Legal destination markers
3. Capture destination markers
4. Current-turn player cues
5. Last-move origin/destination
6. Threat indicators

### 4.2 Seat Visibility Rules
- Active turn banner always shows: `Player Color + Human/AI`.
- Every player panel shows current seat mode.
- Seat mode is visible in both autoplay and mixed-seat matches.

### 4.3 Feedback Timing Targets
- Move commit acknowledgment: `<= 100 ms` from input/AI decision.
- Capture animation window: `100-180 ms`.
- Highlight state update after turn resolve: `<= 80 ms`.

## 5. Ticket Details
### M5-001 - Finalize highlight hierarchy and style system
Scope:
- Apply consistent visual tokens for selected, legal, capture, threat, and last-move states.

Acceptance criteria:
- Overlapping states resolve by priority rules with no ambiguous color conflicts.

### M5-002 - Implement last-move and active-turn emphasis
Scope:
- Persist and display origin/destination from previous move.
- Add active-turn framing cues around current faction context.

Acceptance criteria:
- Viewers can identify "what just happened" within one glance.

### M5-003 - Capture feedback pass (100-180 ms target)
Scope:
- Tune capture flash, dissolve/collapse, and destination settle effects.

Acceptance criteria:
- Capture feedback is visible but does not stall round pace.

### M5-004 - Seat clarity UI (Human/AI badges and turn banner)
Scope:
- Add explicit badges and turn labels reflecting seat controller type.

Acceptance criteria:
- No playtest confusion about whether current turn is Human or AI.

### M5-005 - Threat indicator tuning for dense midgame
Scope:
- Display threat signals only when useful; reduce noise in high-density positions.

Acceptance criteria:
- Threat cues improve comprehension without overwhelming board readability.

### M5-006 - Camera readability polish across speed tiers
Scope:
- Adjust easing and settle behavior per speed tier (`1x/2x/4x`).
- Ensure manual camera override remains responsive.

Acceptance criteria:
- Camera transitions remain understandable at all supported speeds.

### M5-007 - Interaction precision pass (tap/raycast confidence)
Scope:
- Improve tap target tolerance and voxel selection confidence.
- Add optional tap-confirm behavior for crowded cells.

Acceptance criteria:
- Mis-tap rate meets KPI target in mixed-seat tests.

### M5-008 - Accessibility and readability options
Scope:
- Add options for color-safe palette variant and marker size scaling.
- Optional reduced motion mode for camera and VFX.

Acceptance criteria:
- Options can be toggled live and persist for the session.

### M5-009 - UX telemetry pass
Scope:
- Capture mis-taps, camera reorientation events, pause frequency, and follow-mode toggles.

Acceptance criteria:
- Telemetry report supports objective UX tuning decisions.

### M5-010 - Playtest suite: spectator + mixed-seat scenarios
Scope:
- Run scripted tests for:
  - `4 AI` spectator flow
  - `1 Human + 3 AI`
  - `2 Human + 2 AI`
  - fast autoplay readability at `4x`

Acceptance criteria:
- UX criteria pass across all scenarios with logged findings.

### M5-011 - Performance validation on target device matrix
Scope:
- Validate frame rate and latency at key match phases (opening, midgame density, endgame).

Acceptance criteria:
- 60 FPS target maintained in normal conditions on target mid-tier device.
- No critical frame-time spikes caused by overlays/VFX.

### M5-012 - Release-candidate checklist and signoff notes
Scope:
- Compile pass/fail against all milestone acceptance gates.
- Document known non-blocking issues and follow-up backlog.

Acceptance criteria:
- Clear go/no-go recommendation for prototype release candidate.

## 6. Readability and Pace KPIs (Validation for M5)
- Legal move comprehension: median `<= 2.0 s`.
- Mis-tap rate: `<= 8 percent`.
- Camera reorientation events: `<= 1` per turn median.
- AI turn latency (P95): `<= 10,000 ms`.
- Full round pace median: `<= 40 seconds`.

## 7. Risks and Mitigations
- Risk: visual polish introduces clutter under high density.
Mitigation: strict priority hierarchy and opacity discipline.

- Risk: speed-tier camera tuning causes motion discomfort.
Mitigation: reduced-motion option and per-speed easing caps.

- Risk: spectator UX conflicts with human input UX.
Mitigation: mode-aware UI states and explicit turn ownership banner.

## 8. Suggested Daily Execution
Day 1:
- Complete M5-001, M5-002.
- Start M5-003.

Day 2:
- Complete M5-003, M5-004, M5-005.

Day 3:
- Complete M5-006, M5-007, M5-008.

Day 4:
- Complete M5-009 and M5-010.

Day 5:
- Complete M5-011.
- Execute M5-012 signoff prep.

Day 6 (buffer):
- Defect fixes and final acceptance rerun.

## 9. Merge Checklist
- [ ] Highlight hierarchy finalized and conflict-free.
- [ ] Seat clarity UI (Human/AI) verified in all modes.
- [ ] Capture feedback meets timing target.
- [ ] Readability and interaction KPIs validated.
- [ ] Performance checks passed on device matrix.
- [ ] RC checklist and signoff notes published.
