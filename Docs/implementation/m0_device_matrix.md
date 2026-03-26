# M0: Device Matrix Qualification

**Purpose:** Pre-qualify the device matrix for CubeChess before implementation begins. This avoids late-stage device discovery, driver incompatibilities, and M5–M6 validation rework.

**Scope:** Target devices, fallback tiers, performance baselines, browser/runtime support, and qualification criteria.

---

## 1. Device Tier Strategy

### 1.1 Target Tier (Primary)
**Most important devices for MVP release.**

| Device | OS | Year | CPU | GPU | RAM | Screen |
|--------|----|----|-----|-----|-----|--------|
| iPhone 12 | iOS 15+ | 2020 | A14 Bionic | 4-core GPU | 4GB | 6.1" Super Retina |
| iPhone 13 | iOS 16+ | 2021 | A15 Bionic | 5-core GPU | 4GB | 6.1" Super Retina |
| Pixel 5 | Android 11–13 | 2020 | Snapdragon 765 | Adreno 620 | 6GB | 6.0" OLED |
| Pixel 6 | Android 12–14 | 2021 | Tensor | Mali-G78 MP20 | 8GB | 6.1" OLED |
| OnePlus 9 | Android 11–14 | 2021 | Snapdragon 888 | Adreno 660 | 8GB | 6.55" Fluid AMOLED |

**Rationale:** 2020–2021 flagship-to-midrange; represents >60% active mobile market. WebGL support is sufficient across target devices with disciplined shader and draw-call budgets.

**Success Criteria:** 60 FPS gameplay, <100ms input latency, AI P95 <= 10s.

### 1.2 Fallback Tier (Secondary, Performance-Tuned)
**Older devices where we reduce visual fidelity but maintain gameplay integrity.**

| Device | OS | Year | CPU | GPU | RAM | Notes |
|--------|----|----|-----|-----|-----|-------|
| iPhone 11 | iOS 14–16 | 2019 | A13 Bionic | 4-core GPU | 4GB | ~40 FPS target; reduced particle effects |
| Pixel 4 | Android 10–13 | 2019 | Snapdragon 855 | Adreno 640 | 6GB | ~40 FPS target; geometry LOD active |

**Rationale:** ~20% market; fallback QoS acceptable (40 FPS with visual reduction).

**Success Criteria:** 40 FPS gameplay, <150ms input latency, AI P95 <= 15s.

### 1.3 Out of Scope (Too Old)
- iPhone 8 and earlier (obsolete WebGL/canvas support; not cost-effective)
- Pixel 2 and earlier (similar issues)
- Devices <3GB RAM (statefulness and trace overhead too high)

---

## 2. Browser and Runtime Support

### 2.1 Supported Browsers (iOS)
- **Safari 14+** (bundled in iOS 14+)
- **Chrome (iOS)** uses WebKit runtime; same support as Safari

### 2.2 Supported Browsers (Android)
- **Chrome 80+** (default; excellent WebGL and canvas support)
- **Firefox 68+** (WebGL support; secondary)
- **Samsung Internet 10+** (Chromium-based; secondary)

### 2.3 Runtime Requirements
| Component | Requirement | Status |
|-----------|-------------|--------|
| **WebGL** | 1.0 minimum (2.0 optional) | ✅ Universal on target devices |
| **Canvas 2D** | Standard ImageData/putImageData | ✅ Universal |
| **JavaScript** | ES6+ (arrow functions, const/let, Promises) | ✅ Universal |
| **LocalStorage** | 5–10MB quota | ✅ Sufficient for state traces |
| **Typed Arrays** | Uint8Array, Float32Array | ✅ Universal |
| **SharedArrayBuffer** | Optional (for multi-threaded AI search) | ⚠️ Security restrictions; use only if beneficial |

### 2.4 Known Browser Issues
- **iOS Safari WebGL performance:** Can show shader compile and fill-rate spikes; prewarm shaders and limit overdraw for stable frame time
- **Android fragmentation:** Some Qualcomm drivers have WebGL shader compilation bugs; use conservative GLSL 1.0 syntax
- **LocalStorage quota:** 5MB on some browsers; turn traces may need compression or cloud storage fallback

---

## 3. Performance Baselines

### 3.1 Target Tier (iPhone 12–Pixel 6)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **FPS (gameplay)** | 60 FPS sustained | Profiler; at least 10 seconds continuous play |
| **Input latency** | ≤100ms tap-to-highlight | From touch event to DOM update visible on screen |
| **Move resolution** | ≤180ms feedback complete | From move commit to capture animation end |
| **AI turn P95** | ≤10,000ms | Over 100+ turns in soak test |
| **AI turn median** | ≤3,000ms | Over 100+ turns in soak test |
| **Full round (4 players)** | ≤40s at 1x playback | Measure Y → R → P → B turn cycle |
| **Memory (match state)** | ≤20MB active session | Before garbage collection |
| **Turn trace (per 100 turns)** | ≤1MB | JSON-serialized, uncompressed |

### 3.2 Fallback Tier (iPhone 11, Pixel 4)

| Metric | Target | Notes |
|--------|--------|-------|
| **FPS (gameplay)** | 40 FPS sustained | Acceptable compromise; ~33ms per frame |
| **Input latency** | ≤150ms tap-to-highlight | Slightly higher tolerance |
| **AI turn P95** | ≤15,000ms | Deeper search may not be feasible; fallback to pruning |
| **Full round (4 players)** | ≤60s at 1x playback | Slower AI + visual reduction |

### 3.3 Profiling Tools
- **Chrome DevTools Performance tab:** Record 10-second profiles; inspect flame graph for hotspots
- **Safari Develop menu:** iOS Safari profiling; compare JS execution time
- **Custom telemetry:** Instrument AI loop, move generation, rendering with `performance.now()`

---

## 4. HTML5/Web-Specific Considerations

### 4.1 Rendering Approach Decision
**Choose one primary rendering backend:**

| Approach | Pros | Cons | Recommendation |
|----------|------|------|-----------------|
| **WebGL** | Hardware-accelerated 3D, batching, better long-term visual scalability | Shader/tooling complexity, driver variance | **Primary for board, pieces, and highlights** |
| **Canvas 2D** | Simple fallback path, low implementation overhead | Limited 3D depth cues and scalability | **Fallback mode only** |
| **Hybrid** | WebGL core with Canvas overlays for UI/debug | Coordination complexity | **Use selectively where it simplifies UI tooling** |

**For MVP (Target Tier):**
- Use **WebGL** as primary renderer for voxel board, pieces, highlights, and move markers.
- Keep **Canvas 2D fallback** path for constrained devices or emergency compatibility mode.
- Rationale: WEBGL is the chosen stack; optimize early around shader compilation, batching, and overdraw control.

### 4.2 Threading Model
- **Main thread:** Input handling, turn logic, UI updates, rendering
- **Web Worker:** Optional for AI search (off-main-thread candidate evaluation)
  - Benefit: Prevents input lag during AI heavy computation
  - Cost: Serialization overhead; only worth it if AI > 1 second per turn
  - Recommendation: **Add in M4 if median AI time > 1s; defer otherwise**

### 4.3 Storage and Persistence
- **LocalStorage:** Turn traces, match history, user preferences
- **Quota:** 5–10MB per origin; check via `navigator.storage.estimate()`
- **Fallback:** Cloud storage or IndexedDB if LocalStorage insufficient

---

## 5. Qualification Criteria

### 5.1 Pre-Implementation Checklist (M0)
- [ ] **Install target devices** (iPhone 12, Pixel 5, or equivalent simulator/emulator)
- [ ] **Test browser support** (Safari 14+, Chrome 80+)
- [ ] **Verify WebGL/Canvas support** (use test utility, e.g., `webglDetector.js`)
- [ ] **Measure baseline FPS** (load sample WebGL scene, measure frame time)
- [ ] **Test touch event latency** (tap screen, measure input-to-console.log time; target <50ms)
- [ ] **Verify LocalStorage quota** (write 5MB test data, measure access time)

### 5.2 M1 Completion Criteria
- [ ] Board state initialization on target device takes <50ms
- [ ] Formation generator creates 32 pieces with <10ms latency
- [ ] State serialization to JSON takes <20ms per snapshot

### 5.3 M2 Completion Criteria
- [ ] Legal move generation for max-density board <100ms (single piece)
- [ ] All 5 piece types tested on target and fallback devices
- [ ] Benchmark harness (M2-013) complete with results

### 5.4 M3 Completion Criteria
- [ ] Human turn input latency (tap to highlight) <100ms on target, <150ms fallback
- [ ] AI turn timeout strictly enforced; no overage past 10s

### 5.5 M4 Completion Criteria
- [ ] Full AI-vs-AI round on target device: 4 turns total time <40s (1x playback)
- [ ] Full AI-vs-AI round on fallback device: 4 turns total time <60s
- [ ] Memory usage stable over 100+ turns (no memory leaks)

### 5.6 M5 Completion Criteria
- [ ] 60 FPS sustained on target device under normal gameplay
- [ ] 40 FPS sustained on fallback device with visual reduction
- [ ] Legal move comprehension <= 2.0s (user study proxy)

### 5.7 M6 Completion Criteria
- [ ] Soak test 250+ AI-vs-AI matches on target device without crash
- [ ] Soak test 50+ AI-vs-AI matches on fallback device without crash
- [ ] Performance metrics stable (no regression from M5 baselines)

---

## 6. Device Testing Infrastructure

### 6.1 Local Testing Setup
- **iOS Simulator:** Xcode-bundled; fast iteration; limited realism for performance
- **Android Emulator:** Android Studio; slower; good for OS version coverage
- **Physical devices:** Critical for accurate performance; final validation required

### 6.2 Remote Device Farm (Optional, Post-MVP)
- Services like BrowserStack or Lambdatest for CI integration
- Useful for regression testing across device matrix
- Cost: ~$50–100/month for moderate usage

### 6.3 Telemetry Collection
- Per-device telemetry logging (device model, OS version, FPS, AI latency, input lag)
- Uploaded to analytics dashboard (optional for MVP; useful post-launch)

---

## 7. Known Device-Specific Issues

### 7.1 iOS
- **WebGL shader compilation stalls:** Observed on A13; use precompiled shaders if possible
- **LocalStorage quota:** 5MB; larger turn traces may fail silently
- **Canvas context loss:** Rare but possible; add context restoration handler

### 7.2 Android
- **Qualcomm Adreno driver bugs:** Some GLSL 1.0 constructs fail on older Adreno; avoid bitwise ops in shaders
- **Samsung Exynos SoC variance:** Performance can vary 20–30%; fallback tier tuning needed
- **Memory pressure on older devices:** Pixel 4 with 6GB RAM may GC during dense endgame

### 7.3 Recommendation
- **Start testing on target tier immediately** (M1); don't defer to M5
- **Fallback tier optimization in M5** (after M4 solidifies performance bottlenecks)

---

## 8. Device Matrix Approval Checklist

**Before M1 start, sign off on:**

- [ ] Target tier devices list locked (iPhone 12+, Pixel 5+)
- [ ] Fallback tier devices list locked (iPhone 11, Pixel 4)
- [ ] Rendering approach chosen (WebGL primary, Canvas 2D fallback)
- [ ] Threading model approved (main thread only for MVP)
- [ ] Storage strategy approved (LocalStorage + optional cloud fallback)
- [ ] Qualification criteria signed by lead
- [ ] Test infrastructure ready (simulators, physical devices, or device farm)

---

## 9. Cross-Milestone Dependencies

- **M1 depends on:** Device matrix locked
- **M2 depends on:** Performance baseline captured (M2-013 benchmark harness)
- **M3 depends on:** Input latency validated <100ms on target device
- **M4 depends on:** AI turn budget profiled on target device
- **M5 depends on:** 60 FPS rendering viable on target device
- **M6 depends on:** Full device matrix validation complete

---

## 10. Notes for Solo Developer

1. **Physical device testing is critical.** Simulators are convenient but can hide real issues (touch latency, thermal throttling).
2. **Start with target tier only** (iPhone 12 or similar). Add fallback tier optimization after M4.
3. **Use Chrome DevTools profiling** for quick feedback loops. Avoid premature optimization until hotspots are clear.
4. **Track FPS and memory** in every build; create a performance regression dashboard.
5. **Test on fallback tier at M5.** If 40 FPS is not achievable without major rework, escalate scope; don't ship broken.

