# Dacre overhaul checklist

The working record of the product overhaul, kept here so work can continue across sessions. Update it in the same change that moves an item.

- **Done:** built in this overhaul and verified by tests or in the running app.
- **Inherited:** came with the fork. A code audit found it wired up; it was not re-tested feature by feature.
- **Partial:** usable, with the gap named.
- **Not built:** does not exist yet.

## Measured performance

Reference machine: Ryzen 7 9800X3D (16 threads), 32 GB, Windows 11. Packaged app, isolated profile, median of 3 runs, idle measured after 15 seconds.

| Metric                     | Baseline (`bec980f6a1`) | Current | Target     |
| -------------------------- | ----------------------- | ------- | ---------- |
| First launch, content      | 2.6 s                   | _TBD_   | 1–2 s      |
| Repeat launch, content     | 1.4 s                   | _TBD_   | < 1 s      |
| Idle memory, all processes | 647 MB                  | _TBD_   | 150–300 MB |
| Idle CPU, share of 1 core  | 0.46%                   | _TBD_   | ≤ 1%       |

At baseline the server used 335 MB, the renderer 133 MB, Electron's main process 116 MB and the GPU process 35 MB. Not measured yet: input latency, streaming throughput, terminal throughput, large-session rendering and indexing speed.

## Engineering audit

How each major system was judged before changing it. Nothing was rewritten for its own sake.

| System                                                         | Where                                               | Verdict | Reason                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| Event-sourced orchestration (Orchestrator, EventSink, workers) | `apps/server/src/orchestration-v2`                  | Keep    | Explicit run states, crash recovery and replay tests already exist                                  |
| Provider adapters                                              | `packages/provider-*`, `orchestration-v2/Adapters`  | Improve | Mode enforcement and the user's MCP servers added; lazy loading next                                |
| Typed contracts and WebSocket RPC                              | `packages/contracts`, `apps/server/src/ws.ts`       | Keep    | Schema-checked wire format shared by server, web and desktop                                        |
| SQLite persistence and migrations                              | `apps/server/src/persistence`                       | Keep    | `node:sqlite` with ordered migrations; Brain added migration 111                                    |
| Web UI (React compiler, Tailwind 4, Base UI primitives)        | `apps/web`                                          | Improve | Tokens, layout and motion reworked in place; lint rules keep components consistent                  |
| Pane and tab layout                                            | `apps/web/src/layout`                               | Keep    | Split panes, saved layouts and kept-alive tabs work; the rail sits beside it                        |
| Electron shell                                                 | `apps/desktop`                                      | Keep    | Context isolation, sandbox, no Node integration, deny-by-default window opening, schema-checked IPC |
| Terminal (Ghostty WASM renderer, node-pty)                     | `apps/web/src/terminal`, `apps/server/src/terminal` | Improve | Bounded scrollback exists; search and shell picker missing                                          |
| Git, worktrees and checkpoints                                 | `apps/server/src/git`, `apps/server/src/vcs`        | Improve | Solid base; per-file revert added, hunk staging missing                                             |
| Server bundle                                                  | `apps/server/vite.config.ts`                        | Improve | One-byte source done; provider adapters still load at startup                                       |
| Labs workflows                                                 | `apps/server/src/workflows`                         | Improve | The natural base for task graphs with budgets                                                       |
| Telemetry                                                      | `apps/server/src/telemetry`                         | Keep    | Off by default; needs an in-app consent toggle before anyone turns it on                            |
| T3 hosted services, accounts and update feed                   | removed in the fork                                 | Removed | Confirmed unused once Dacre cut all ties to T3 hosts <!-- rename-scan: T3 input on purpose -->      |

Electron note: the `RunAsNode` fuse stays enabled, because the desktop app runs its server with `ELECTRON_RUN_AS_NODE`.

## Design and workspace

**Done**

- [x] Neutral default dark palette and refined light palette, all text at WCAG AA or better
- [x] OLED theme
- [x] Accent colors (blue, teal, green, amber, rose, violet, graphite)
- [x] Interface density (compact, default, comfortable)
- [x] App rail with Home, Threads, Brain, Mission Control, Search and the utility pages
- [x] Home page with recent threads, projects and agent status
- [x] Mission Control: agents running, waiting on you (with what each needs), and failed, stopped or finished in the last day, with Stop
- [x] Theme choice in first-run setup
- [x] Motion for pages, tabs, messages, status changes and startup, all honoring reduced motion
- [x] 3D model preview for GLB, glTF, OBJ, STL and FBX

**Inherited**

- [x] Light, dark and system themes, custom themes with an editor and import
- [x] UI, code and terminal fonts and sizes
- [x] Unified title bar, Windows title bar overlay, drag regions
- [x] Resizable and collapsible sidebar, split panes, tabs, saved layouts
- [x] Command palette, global thread search, project and session switchers
- [x] Customizable keybindings and native context menus
- [x] File explorer, file editing, Markdown, diagrams, diff viewer, browser preview
- [x] Right-side thread details, context meter, integrated terminal

**Partial**

- [ ] Editor color themes: syntax theme is fixed per light and dark
- [ ] Distraction-free mode: Zen hides tool calls but keeps the chrome
- [ ] Saved prompts: a 20-entry stash, no named library
- [ ] Build and test output: runs in a terminal, not parsed
- [ ] Agent logs: activity in chat, raw logs only through the logs folder

**Not built**

- [ ] Problems and diagnostics panel

## Agent engine

**Done**

- [x] Agent modes: Agent, Ask, Plan, Architect, Debug, Review, Parallel, Performance, UI/UX, Research and 3D, from a composer picker with a cycle shortcut (`mod+.`)
- [x] `/plan`, `/build`, `/debug`, `/review`, `/research` and `/optimize` switch the mode; a provider command with the same name keeps priority
- [x] Custom modes with their own name, instructions and read-only flag (Settings > Threads)
- [x] Read-only modes enforced on the server through each provider's plan mode or sandbox; Muse and Pi have no such mode and rely on instructions
- [x] Checks under each finished turn: tests, lint, type checks and builds, read from command exit codes
- [x] Second opinion: another provider reviews a turn's changed files in Review mode
- [x] Per-file revert of a turn from the Diff pane

**Inherited**

- [x] Adapters for Codex, Claude, Cursor, Grok, fx, OpenCode, Antigravity, Kiro, Pi, Muse and ACP
- [x] Explicit run lifecycle states, cancellation, crash recovery, persistence
- [x] Checkpoints with rollback
- [x] Subagents and parallel agents in isolated worktrees
- [x] Model favorites, per-thread models, provider health checks, usage and cost estimates

**Partial**

- [ ] Retries: failed turns need a manual retry
- [ ] Budgets: timeouts on Labs workflow steps only, no iteration or cost caps
- [ ] Conflict detection: guards branch switches, not same-file edits between agents
- [ ] Fallback models: new threads at a usage limit only
- [ ] Local models: native for text generation; agents need fx or a Claude router

**Not built**

- [ ] Dependency-aware task graph
- [ ] Automatic model routing
- [ ] Per-hunk accept or revert

## Code intelligence

**Done**

- [x] Brain: local, searchable project and global memory with a management page (add, edit, pin, disable, delete)
- [x] Agents read and add to the Brain through `brain_search` and `brain_remember`; only the user can pin, edit or delete
- [x] User and agent entries are labeled, secrets are refused, and pinned entries reach every turn (capped at 3.6 KB)
- [x] Per-project Tree-sitter symbol index (TypeScript, JavaScript, Python, Go, Rust, Java, C#), Go to symbol in the command palette, and `code_symbols` for agents

**Inherited**

- [x] Repository content search, context usage display, conversation compaction

**Partial**

- [ ] Repository index: files and text, capped at 25,000 entries

**Not built**

- [ ] LSP, go-to-definition and find references
- [ ] Dependency graph and repository graph view
- [ ] Semantic search
- [ ] Inline code autocomplete

## Tools, terminal and security

**Done**

- [x] MCP servers in Settings: add, import, test and switch off, for all projects or one, with tokens kept as secrets
- [x] New threads start in Auto permissions instead of Full access

**Inherited**

- [x] Multiple and split terminals with bounded scrollback
- [x] Agent browser automation, screenshots, console and network inspection

**Partial**

- [ ] Per-tool permissions: Dacre's own tools only
- [ ] Enforcement: each provider enforces its own tool calls; Dacre caps modes and gates its own tools
- [ ] Credentials: desktop tokens use OS storage; server secrets are owner-only files
- [ ] Terminal shell selection: environment variable only

**Not built**

- [ ] Terminal search

## Git and sessions

**Inherited**

- [x] Branches, commits, AI commit messages, worktrees, conflict detection, pull requests
- [x] Searchable history, rename, fork, branch, archive, crash restore, clear failure states

**Partial**

- [ ] Staging: per-commit file checkboxes, no hunk staging
- [ ] Commit history: newest 100 commits of the branch comparison
- [ ] Import and export: imports Claude, Codex and Pi history, no thread export

## Product

**Inherited**

- [x] Searchable settings, usage page, desktop notifications, voice input

**Partial**

- [ ] Extensions: ACP agents and imported themes, no plugin API
- [ ] Telemetry: off by default, opt-in needs environment variables and has no in-app toggle

## Next priorities

1. Server memory: load provider adapters on demand, since the server is over half of idle memory.
2. Code intelligence: go-to-definition and find references.
3. Safer review: hunk staging and per-hunk accept or revert.
4. Agent budgets (iterations, time, cost) and same-file conflict detection between agents.
