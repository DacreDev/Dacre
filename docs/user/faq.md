# FAQ

## Is Dacre a harness?

No. A harness is what turns an LLM into an agent: it gives the model tools, a way to call them, runs them, and hands the results back. Claude Code and Codex each pair an interface with a harness underneath. Dacre uses those harnesses. It is not a harness, and it does not work without one.

Bring your own: Claude Code, Codex, Cursor, Grok Build, OpenCode, Google Antigravity, Kiro, Pi, Muse Code, or fx. [Provider setup](./install.md#providers)

## Can I use Dacre with my Claude Code subscription?

Dacre drives the Claude Code you have installed and signed in to. Check Anthropic's terms for how your plan can be used with other tools.

## How much does Dacre cost?

Nothing. It is free and open source (MIT). You still pay your provider as you already do.

## How do I use Dacre remotely?

Your agents run wherever Dacre runs: your desktop, a server, a VPS. Pair another device over your local network or Tailscale. [Remote access](./remote-access.md)

## Is there a phone app?

No. Dacre supports Windows, Linux and macOS through its desktop app, plus the web client in a browser. There are no iOS or Android apps.

## Could I get banned for using my subscription?

Dacre has no agreement with any AI provider, so it cannot promise that your use is allowed. It runs the official CLIs you installed, and those providers' terms still apply to you. Some of Dacre's usage meters read your limits while identifying as that vendor's own client, which the vendor may not allow. Read each provider's terms before you rely on it with an account you care about.

## Can I add a bunch of accounts for one provider?

Dacre is not built to manage a pool of accounts, and switching between them automatically can break provider terms.

A separate work account is fine. Setup for two: [Codex](./providers-codex.md#use-multiple-accounts) · [Claude](./providers-claude.md#separate-accounts-or-configurations). If you run a self-hosted hub such as [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), Dacre can show its pooled limits under Usage. [Connect a hub](./usage.md#connect-a-cliproxyapi-hub)

## Can I use an API key or OpenRouter instead of a subscription?

Yes. Add another provider instance in Settings and give it its own keys and endpoint. Claude has a full OpenRouter recipe. Your subscription setup stays untouched. [OpenRouter](./providers-claude.md#openrouter) · [Provider instances](./install.md#providers)

## Does Dacre support local models?

Dacre has no model runtime of its own. If an agent you use can talk to a local model, that setup works through Dacre.

## Does my code go to Dacre servers?

No. Dacre has no servers of its own. Your code and prompts go from your machine to the provider you choose (Anthropic, OpenAI, and so on). Dacre does not collect product usage data. [Product usage data](./telemetry.md)

## Worktrees are eating my disk. How do I clean them up?

Open **Settings → Worktrees → Cleanup** and turn on automatic worktree cleanup. You can also run it now from there. [Storage cleanup](./project-settings.md#storage-cleanup)

## Is there voice input?

Yes. On macOS 26 or later, desktop users can choose Apple Speech directly under **On this Mac** or choose an environment. Web and other desktop users can enable dictation by choosing an environment. The transcript goes into your draft for review. See [Voice input](./voice-input.md).

## Does it work on Windows, Mac, and Linux?

It is built for all three. So far this fork has been run on Windows and on Linux under WSL. macOS builds have not been verified yet. On Windows you can also run agents inside WSL. [Install](./install.md)

## Why is my provider not showing up?

Almost always, the CLI is not installed or not on the `PATH` of the machine that runs the server. Log in on that machine first, like `codex login` or `claude auth login`. Still missing? Point **Binary path** at it in provider settings. Version managers often cause this one. [Provider setup](./install.md#providers)
