# Changelog

Notable changes to Dacre. Versions follow [Semantic Versioning](https://semver.org/) once releases start.

## 0.0.1 (unreleased)

The first version of Dacre, a fork of [T3 Code](https://github.com/pingdotgg/t3code). <!-- rename-scan: T3 input on purpose -->

### Added

- Agent modes: Ask, Plan, Agent, Architect, Debug, Review, Parallel, Performance, UI/UX, Research and 3D, from a picker in the composer. `mod+.` cycles them.
- `/plan`, `/build`, `/debug`, `/review`, `/research` and `/optimize` switch the mode from the composer. A provider's own command with the same name keeps working.
- Custom modes with your own instructions, under Settings > Threads.
- Mission Control: every agent that is running, waiting on you, or finished or stopped in the last day, with Stop. A waiting agent says what it needs, such as an approval, an answer or a plan review.
- Read-only modes enforced on the server through each provider's plan mode or sandbox.
- MCP servers in Settings: add or import a server once, test it, and every agent session that can take it gets its tools, in all projects or one. Tokens are stored as secrets, never in `settings.json`.
- Go to symbol in the command palette, and a `code_symbols` tool for agents, from a per-project index of TypeScript, JavaScript, Python, Go, Rust, Java and C#.
- Checks under each finished turn: whether tests, lint, type checks and builds passed, read from the exit codes of the commands the agent ran.
- Second opinion: another provider reviews a turn's changed files in Review mode, in a side chat.
- Revert one file of a turn from the Diff pane.
- Brain: a local memory of conventions, decisions and known issues, with its own page. Agents read it with `brain_search` and add to it with `brain_remember`.
- 3D model preview for GLB, glTF, OBJ, STL and FBX files.
- An app rail and a Home page with recent threads, projects and agent status.
- An OLED theme, seven accent colors and three interface densities, with the theme chosen during first-run setup.
- Short transitions for pages, tabs, messages and startup, all honoring reduced motion.

### Changed

- New name, icon and visual identity, with a neutral default palette that keeps text at WCAG AA or better.
- The server keeps its JavaScript in one byte per character, which halves resident script source (42.7 MB to 20.5 MB).
- The Windows server package no longer ships install-time patches or debug symbols.
- New threads start in Auto permissions instead of Full access.
- Includes T3 Code fixes up to upstream commit `90e6e3e69d8`. <!-- rename-scan: T3 input on purpose -->

### Removed

- Hosted services, accounts, release channels, store listings and the update feed that pointed at T3 Code. <!-- rename-scan: T3 input on purpose -->
- The iOS and Android apps, with their push relay and build tooling. Dacre runs on Windows, Linux and macOS, plus the web client.

### Fixed

- Threads on the app rail opens the thread list instead of closing it, and a collapsed thread list no longer shows through beside the rail.

- The installers explain when no release exists, and never suggest installing an npm package.
- On Linux, the desktop app no longer takes the `dacre` command name, and stale AppImage mounts leave `PATH`.
