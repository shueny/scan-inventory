# scan-inventory

The product spec is [docs/PRD.md](docs/PRD.md). It is the single source of truth. Read it fully before writing code. When the PRD and your own judgement disagree, stop and ask the owner.

## Rules (repeated from PRD section 0)

The owner will be interviewed about every decision in this project. Code she cannot explain is worse than no code.

1. **Work ticket by ticket.** Do the tasks in PRD section 9 in order. One task per branch and per PR-sized change. Do not start the next task until the owner confirms the current one.
2. **Decisions belong to the owner.** When a task has a real choice (library, data model, algorithm, folder structure not specified in the PRD), present 2 or 3 options with trade-offs and a recommendation, then wait. Do not pick silently.
3. **Write an ADR for every decision** in `docs/adr/NNNN-title.md` (context, options, decision, consequences). Short is fine.
4. **Explain after each task.** Append to `docs/LEARNING.md`: what was built, the key concepts in plain language, why it was done this way, and 3 quiz questions the owner should be able to answer.
5. **No silent scope growth.** If you see a useful addition, propose it in your reply. Do not add it.
6. **Never commit data.** `pointcloud/`, `meta/` raw files, `data/potree/` and any `*.ply`, `*.e57`, `*.las`, `*.laz` stay out of git.
7. **Quality gate before declaring a task done:** all tests pass, type checks pass, lint passes (`make check` and `uvx pre-commit run --all-files`). Paste the command output in your reply.
8. **Keep memory low.** The source point cloud is 3.25 GB with 151.9 million points. Any Python that touches it must read in chunks. Never load the whole file into RAM.

## Repo layout and commands

| folder | what | tooling |
|---|---|---|
| `scripts/` | offline Python pipeline | uv, Python 3.12, ruff, mypy, pytest |
| `api/` | FastAPI service | uv, Python 3.12, ruff, mypy, pytest |
| `web/` | React + TS frontend | pnpm, eslint, prettier |
| `docs/adr/` | decision records | |
| `data/` | generated data, gitignored | |

- Install: `make install`
- Quality gate: `make check`
- Hooks: `uvx pre-commit install`, then `uvx pre-commit run --all-files`
