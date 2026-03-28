# CubeChess

CubeChess is a 4-player voxel strategy game played on an `8x8x8` board where pieces occupy real 3D cells.

This repository contains the design, planning, and early runtime implementation for a fast, readable AI-first WebGL web experience:
- Watch AI-vs-AI matches as a "digital lava lamp"
- Join and play in mixed-seat matches (`Human + AI`)
- Keep turn pacing fast (`<= 10s` AI turn P95 target)

## Live Preview

After the Pages workflow runs, the viewer is published at:
- `https://whynchu.github.io/CubeChess/cubechess-v0.1.69/`

Current viewer includes:
- WebGL cube board shell + internal grid
- Starting formation placement for all four factions
- Orbit camera controls for visual inspection

## Repository Structure

```text
Docs/
  design/
  implementation/
Runtime/
  Core/
    Formation/
    GameState/
    Rules/
Tests/
  Performance/
web/
  index.html
  style.css
  main.js
.github/workflows/
  deploy-pages.yml
```

## Core Product Targets

- Runtime target: mobile web (iOS Safari + Android Chrome), WebGL-first renderer
- AI turn latency P95: `<= 10,000 ms`
- Full 4-player round median: `<= 40 seconds`
- Readability first: legal moves understood quickly, camera orientation preserved
- Support both spectator autoplay and mixed Human/AI play

## Milestone Roadmap

- `M1` Board and state core
- `M2` Movement engine
- `M3` Turn, seat control, elimination
- `M4` AI autoplay and spectator experience
- `M5` Readability and UX polish
- `M6` Hardening, release prep, handoff

See [Docs/implementation/cube_chess_implementation_plan.md](Docs/implementation/cube_chess_implementation_plan.md) for the full plan.
See [Docs/implementation/cube_chess_ai_champion_plan.md](Docs/implementation/cube_chess_ai_champion_plan.md) for the AI strengthening roadmap.

## Dev Commands

- `npm test` -> run core validation harness
- `npm run bench:m2` -> run movement benchmark harness
- `npm run bench:m3` -> run turn/round pace benchmark harness

## Status

- M1 core runtime implemented and tested
- M2 movement rules implemented and tested
- WebGL viewer added for GitHub Pages visual feedback
- M3 turn/seat/timeout systems implemented
- M4 autoplay viewer loop now visible in WebGL (v0.1.69 async piece bob + trail spawn optimization)

## License

No license has been added yet.


























































