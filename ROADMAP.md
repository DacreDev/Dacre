# Roadmap

What Dacre can do today and what comes next. The [overhaul checklist](./docs/operations/overhaul-checklist.md) tracks every item in detail, including what was inherited from T3 Code and what is only partly done. <!-- rename-scan: T3 input on purpose -->

## Done

- Agent modes, including custom modes and slash commands such as `/plan`, with read-only modes enforced on the server.
- Brain, a local project memory that agents read and add to.
- Mission Control: one view of every running agent, its state and what it is waiting on.
- 3D model preview.
- Redesigned layout with an app rail and Home page, an OLED theme, accent colors and density.
- A measured reduction in server memory.
- MCP server management: add, test and switch off servers for every provider in one place.
- Go to symbol, from a symbol index that agents search too.
- Checks under each finished turn, second opinions from another agent, and per-file revert.

## Next

1. Server memory: load provider adapters only when they are used.
2. Code intelligence: go to definition and find references.
3. Safer review: hunk staging and per-hunk accept or revert.

## Later

- Direct API and local model providers for agents, with model discovery.
- Optional model routing (fast, balanced, deep, local only) with visible switching and spending limits.
- Task graphs for multi-agent work, with budgets and same-file conflict detection.
- A versioned extension API for providers, tools, skills and themes.
- Signed Windows builds, and tested macOS and Linux builds.
