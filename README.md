# CubeChess

CubeChess is a 4-player voxel strategy game played on an `8x8x8` board where pieces occupy real 3D cells.

This repository currently contains the design and implementation planning documents for building a fast, readable AI-first experience:
- Watch AI-vs-AI matches as a "digital lava lamp"
- Join and play in mixed-seat matches (`Human + AI`)
- Keep turn pacing fast (`<= 10s` AI turn P95 target)

## Repository Structure

```text
Docs/
  design/
    cube_chess_full_3_d_voxel_design_doc.html
  implementation/
    cube_chess_implementation_plan.md
    cube_chess_m1_task_board.md
    cube_chess_m2_task_board.md
    cube_chess_m3_task_board.md
    cube_chess_m4_task_board.md
    cube_chess_m5_task_board.md
    cube_chess_m6_task_board.md
```

## Core Product Targets

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

## Status

Planning complete. Runtime implementation is next.

## License

No license has been added yet.
