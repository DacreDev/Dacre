<p align="center">
  <img src="./assets/prod/dacre-black-web-icon-192x192.png" width="80" height="80" alt="Dacre logo" />
</p>

<h1 align="center">Dacre</h1>

<p align="center"><strong>A local-first workspace for AI coding agents</strong></p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="./docs/README.md">Docs</a> ·
  <a href="./ROADMAP.md">Roadmap</a> ·
  <a href="https://github.com/DacreDev/Dacre/issues">Issues</a>
</p>

Dacre is an open-source desktop and web app for running **Claude Code, Codex, Cursor, OpenCode**, and other coding agents from one workspace. Use the provider accounts you already have, run tasks in separate Git worktrees, and review the diffs and check results together.

**Early preview.** Run Dacre from source today. The Windows installer can be built locally and is unsigned. The macOS and Linux desktop builds are still unverified for Dacre. See the [roadmap](./ROADMAP.md) and [changelog](./CHANGELOG.md) for project progress.

## What you can do with Dacre

- **Coordinate parallel work.** Give each task its own [Git worktree](./docs/user/source-control.md). Use Mission Control to see which agents are running, waiting for input, or finished.
- **Review changes in place.** Read diffs, see which tests and other checks ran and how they exited, ask a second agent for a review, or revert an individual file.
- **Keep project context across sessions.** Brain gives agents a searchable local store for project conventions, decisions, and known issues. You can edit, pin, or remove entries.
- **Choose how an agent works.** Switch between modes such as Ask, Plan, Debug, and Review, or define your own. Set up [MCP servers](./docs/user/mcp-servers.md) once and share them with compatible providers.
- **Work locally or connect to another machine.** Use split panes, an integrated terminal, and browser and file previews, including 3D models. Connect to your agent host over your [local network or Tailscale](./docs/user/remote-access.md). Dacre's telemetry is off by default.

## Supported agents

Claude Code, Codex, Cursor, OpenCode, Grok Build, Antigravity, Kiro, Pi, Muse Code, and fx. You can also connect agents that use the [Agent Client Protocol (ACP)](./docs/user/providers-acp.md).

## Quick start

Install Git, [Node.js 26.13.1](https://nodejs.org/), and [pnpm 12.14.0](https://pnpm.io/). To start a thread, install and sign in to at least one [supported agent](./docs/user/install.md#providers).

```bash
git clone https://github.com/DacreDev/Dacre.git
cd Dacre
pnpm install
pnpm exec vp run dev
```

On Windows, clone with `git clone -c core.longpaths=true https://github.com/DacreDev/Dacre.git`.

Open the pairing URL shown in your terminal to use Dacre in your browser. For the desktop app, run `pnpm exec vp run dev:desktop`.

### Build the Windows installer

```bash
pnpm exec vp run dist:desktop:win:x64
```

The installer lands in `release/`. See the [Windows installer prerequisites](./docs/operations/00_development.md#windows-installer-prerequisites) for the required build tools.

## Documentation

- [Install and first run](./docs/user/install.md)
- [Remote access from another machine](./docs/user/remote-access.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Source control](./docs/user/source-control.md)
- [MCP servers](./docs/user/mcp-servers.md)
- [Connect outside agents over MCP](./docs/user/outside-agents.md)
- [FAQ](./docs/user/faq.md)

[All docs](./docs/README.md) has the full list.

## Contributing

If you hit a setup issue or find a bug, [open a GitHub issue](https://github.com/DacreDev/Dacre/issues/new/choose). Before submitting a pull request, read the [contribution guide](./CONTRIBUTING.md) and [code of conduct](./CODE_OF_CONDUCT.md). For contributor setup and internals, see the [development runbook](./docs/operations/00_development.md#first-checkout) and [architecture overview](./docs/internals/01_architecture.md).

## Credit

Dacre is an independent fork of [T3 Code](https://github.com/pingdotgg/t3code) by T3 Tools Inc., used under the MIT License. It is not affiliated with or endorsed by T3 Tools Inc. See [NOTICE](./NOTICE). <!-- rename-scan: T3 input on purpose -->

## License

[MIT](./LICENSE)
