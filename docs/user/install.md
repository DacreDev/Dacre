# Install Dacre

Dacre runs coding agents on your computer and lets you control them from its
desktop or web app. Set up the machine where the agents will work first.

Dacre has no published releases yet, so you run it from source.

## Requirements

You need Git, [Node.js 26.13.1](https://nodejs.org/), and
[pnpm 12.14.0](https://pnpm.io/). You also need an installed, authenticated
provider before starting a thread. You can launch Dacre and configure providers
afterwards.

## Command line

Build the server from a checkout:

```bash
git clone https://github.com/DacreDev/Dacre.git
cd Dacre
pnpm install
pnpm exec vp run build:desktop
node apps/server/dist/bin.mjs
```

On Windows, clone with
`git clone -c core.longpaths=true https://github.com/DacreDev/Dacre.git` so the
vendored references check out.

The last command starts the server and opens the web app. To use the shorter
`dacre` command in the table below, add an alias for it:

```bash
alias dacre="node $PWD/apps/server/dist/bin.mjs"
```

| Task                                  | Command                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Start the server and open the web app | `dacre`                                                                    |
| Start the server without a browser    | `dacre serve`                                                              |
| Reclaim database space                | `dacre doctor` ([details](./background-service.md#reclaim-database-space)) |

`dacre update` and the background service do not apply to a server run this way.
Update it with `git pull` and a rebuild, as in [Updating Dacre](./updating.md).

Run `dacre help` or `dacre --help` for the full reference. To start in a new working
directory, use an explicit path such as `dacre ./my-project`. A bare directory name
is accepted only if it already exists.

If `dacre` or `dacre start` reports an already running server, run the `dacre pair`
command it names and open the pairing URL to connect to that server. Stop it
before starting a replacement, or use a different `--base-dir` for an
independent server.

## Desktop app

There are no desktop downloads yet. To run the desktop app from a checkout:

```bash
pnpm exec vp run dev:desktop
```

To build an installer for your own machine, follow
[Desktop artifacts](../operations/00_development.md#desktop-artifacts).

### The `dacre` command

The desktop app includes the `dacre` command-line tool. A new install sets it up
on first launch; after an update, or any time, choose **Install** next to
**dacre command** in **Settings → About**. On macOS and Linux it adds a `dacre` link
in `~/.local/bin` (or `~/bin`); on Windows it adds the app's command folder to
your `PATH`. Open a new terminal afterwards. If the folder is not on your
`PATH`, **Add to PATH** on the Welcome page or in **Settings → About** adds one
line to your shell's startup file. **Remove** takes it off, and the app does not
add it again. If you already have another `dacre`, it stays as it is.

### Windows Subsystem for Linux

Choose a WSL distro in **Settings → Sharing & access** to run agents and projects
there. Install the provider CLIs inside that distro. A desktop build made with a
Linux runtime archive installs its server there. Otherwise, run Dacre from a
checkout inside the distro.

### Open a project from a terminal

With the desktop app already running on the same machine:

```bash
dacre app
```

This opens a new thread for the current directory, adding the project if needed.
Pass a path, such as `dacre app ../my-project`, to open another directory. It requires
the desktop app, so a standalone server or an SSH session is not enough. If the
command cannot reach the app, start or update the desktop app and try again.

### Drop a folder on the sidebar

Drag one or more folders from Finder, Explorer, or your file manager onto the
sidebar. Each one opens as a project on this computer, the same as `dacre app`.
Files dropped on a thread still attach to that thread. Browsers do not share
folder paths, so in the web app use **Add project** instead.

## Providers

Open **Settings → Providers** in the web or desktop app, select the environment,
and enable the provider you want. Installation, login, and configuration belong
to that environment's machine, even when you connect from another computer.

| Provider            | Install and authenticate                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex               | [Connect with ChatGPT](./providers-codex.md#connect-with-chatgpt), or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`. |
| Claude              | Install [Claude Code](https://claude.com/product/claude-code), then run `claude auth login`.                                                              |
| Cursor              | Install [Cursor CLI](https://cursor.com/cli), then run `agent login`.                                                                                     |
| Grok Build          | Install [Grok Build CLI](https://x.ai/cli), then run `grok login`.                                                                                        |
| Kiro                | Install [Kiro CLI](https://kiro.dev/docs/cli/), then run `kiro-cli login`.                                                                                |
| OpenCode            | Install [OpenCode](https://opencode.ai), then run `opencode auth login`.                                                                                  |
| Antigravity         | Install and sign in with Google from Dacre's provider settings.                                                                                           |
| Pi                  | Install [Pi](./providers-pi.md#set-up-pi) with Node.js 22.19 or newer, then run `pi` and `/login`.                                                        |
| Muse Code           | Install [Muse Code](https://dev.meta.ai/docs/muse-code) on the server, run `muse login`, then enable it in Settings → Providers.                          |
| fx                  | Install [fx](https://fx.sh) with `curl -fsSL https://fx.sh/setup.sh \| bash`, then run `fx login`.                                                        |
| ACP Registry agents | Add GitHub Copilot and other [ACP agents](./providers-acp.md#add-an-agent) from **Settings → Providers → Add provider → Show more**.                      |

Provider CLIs must be on the server's `PATH`. If Dacre cannot find one, set its
**Binary path** in provider settings, especially when using a version manager.
Cursor's executable is `cursor-agent`, although its login command is
`agent login`. Codex connected through ChatGPT and Antigravity can use their
managed runtimes without a `PATH` entry.

Dacre warns when a provider version has known compatibility problems with your
release. Check **Settings → Providers** on that environment for the recommended
version or range. When its package manager supports installing a specific version,
you can install the recommendation there. Otherwise use the provider's installer
on the environment's machine. An unlisted version is unverified.

When a provider CLI is behind its latest release, its provider card shows the
available version. **Update now** runs the installer that owns the CLI
(Homebrew, mise, or a global npm, pnpm, Yarn, Bun, Volta, or Vite+ install), or
the CLI's own update command when Dacre cannot tell. Claude, Codex, and
OpenCode installs Dacre cannot identify stay manual: update them through the
installer you used. Dacre runs `mise upgrade`
only for a tool your mise config requests as `latest` when the provider's binary
path is a mise shim or under the tool's `installs/<tool>/latest` link; update a
pinned version, or a path into one version's directory, through mise yourself.
Update a CLI installed with Nix through Nix.
Cursor and Antigravity update with Dacre. Homebrew and Chocolatey installs
compare against the version their package manager offers, which can trail the
npm release; update Claude installed with Chocolatey through Chocolatey.

The managed runtimes for Antigravity and for Codex connected through ChatGPT
first install the release Dacre tested. When Dacre finds a newer compatible
release, their setup in **Settings → Providers** offers an update.

Add another provider instance for a separate account or configuration. Each
instance can have its own environment variables, such as API keys or a custom
base URL. Mark secret values as sensitive; after saving, Dacre does not display
their original values.

For provider-specific setup and accounts, see [Codex](./providers-codex.md),
[Claude](./providers-claude.md), [OpenCode](./providers-opencode.md),
[Antigravity](./providers-antigravity.md), [Kiro](./providers-kiro.md),
[Pi](./providers-pi.md), [Muse Code](./providers-muse.md), [fx](./providers-fx.md), and
[ACP Registry agents](./providers-acp.md).

### Provider check timeouts

If a provider works in its CLI but Dacre reports a timeout while checking it,
allow more time in the Dacre server's environment. For example, give Codex and
Claude readiness checks 60 seconds:

```bash
DACRE_CODEX_PROBE_TIMEOUT_MS=60000 DACRE_CLAUDE_PROBE_TIMEOUT_MS=60000 dacre serve
```

For a remote environment, set these on the machine running the Dacre server.
Keep them in your launcher or service configuration to retain them across
updates, then restart the server. For systemd, add
`Environment=DACRE_CODEX_PROBE_TIMEOUT_MS=60000` under `[Service]` in a service
override, reload systemd, and restart the service. Provider instances can also
set their own overrides in Settings → Providers.

Each variable extends that provider's readiness-probe deadlines; a phase whose
default is already longer keeps its default. Providers with several phases can
take longer than one deadline in total. Values must be whole milliseconds no
greater than 2147483647; unset or invalid values keep the defaults.

| Provider            | Environment variable                  |
| ------------------- | ------------------------------------- |
| Codex               | `DACRE_CODEX_PROBE_TIMEOUT_MS`        |
| Claude              | `DACRE_CLAUDE_PROBE_TIMEOUT_MS`       |
| Cursor              | `DACRE_CURSOR_PROBE_TIMEOUT_MS`       |
| Antigravity         | `DACRE_ANTIGRAVITY_PROBE_TIMEOUT_MS`  |
| Grok                | `DACRE_GROK_PROBE_TIMEOUT_MS`         |
| Kiro                | `DACRE_KIRO_PROBE_TIMEOUT_MS`         |
| fx                  | `DACRE_FX_PROBE_TIMEOUT_MS`           |
| Pi                  | `DACRE_PI_PROBE_TIMEOUT_MS`           |
| Muse Code           | `DACRE_MUSE_PROBE_TIMEOUT_MS`         |
| OpenCode            | `DACRE_OPENCODE_PROBE_TIMEOUT_MS`     |
| ACP Registry agents | `DACRE_ACP_REGISTRY_PROBE_TIMEOUT_MS` |

Longer deadlines also take longer to report a stalled check. These overrides
cover readiness and discovery, including OpenCode server startup. Usage and
config enrichment retain their own shorter limits. Turn execution, package
installation, update checks, and shutdown limits keep their existing behavior.

## Next steps

- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): choose when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Running in the background](./background-service.md): keep a host available.
- [Updating Dacre](./updating.md): update the app and connected servers.
- [Managed policy](./managed-policy.md): configure Dacre for everyone on a machine.
