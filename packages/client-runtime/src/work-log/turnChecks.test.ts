import type { OrchestrationV2TurnItemStatus } from "@dacre/contracts";
import { describe, expect, it } from "vite-plus/test";

import { classifyCheckCommand, summarizeTurnChecks } from "./turnChecks.ts";

describe("classifyCheckCommand", () => {
  it.each([
    ["npm test", "test"],
    ["npm run test:unit", "test"],
    ["pnpm --filter web test", "test"],
    ["pnpm -C apps/web run lint", "lint"],
    ["yarn workspace @acme/web typecheck", "typecheck"],
    ["npm run check:types", "typecheck"],
    ["bun run build", "build"],
    ["bun test", "test"],
    ["npx vitest run src/a.test.ts", "test"],
    ["pnpm exec jest --ci", "test"],
    ["pnpm dlx mocha", "test"],
    ["bunx playwright test", "test"],
    ["uv run pytest -q", "test"],
    ["poetry run python -m pytest tests", "test"],
    ["go test ./...", "test"],
    ["cargo test --workspace", "test"],
    ["dotnet test", "test"],
    ["mvn -q test", "test"],
    ["./gradlew test", "test"],
    ["bundle exec rspec spec/models", "test"],
    ["vendor/bin/phpunit", "test"],
    ["mix test", "test"],
    ["swift test", "test"],
    ["pnpm exec vp test run --project unit", "test"],
    ["eslint .", "lint"],
    ["npx oxlint", "lint"],
    ["biome check .", "lint"],
    ["ruff check src", "lint"],
    ["flake8", "lint"],
    ["pylint pkg", "lint"],
    ["golangci-lint run", "lint"],
    ["cargo clippy -- -D warnings", "lint"],
    ["vp check --fix", "lint"],
    ["vp lint", "lint"],
    ["bundle exec rubocop", "lint"],
    ["tsc --noEmit", "typecheck"],
    ["npx tsgo --noEmit", "typecheck"],
    ["pnpm exec effect-tsgo tsrs --noEmit --pretty false", "typecheck"],
    ["mypy src", "typecheck"],
    ["python3 -m mypy src", "typecheck"],
    ["pyright", "typecheck"],
    ["cargo check", "typecheck"],
    ["go vet ./...", "typecheck"],
    ["vite build", "build"],
    ["npx next build", "build"],
    ["cargo build --release", "build"],
    ["go build ./cmd/server", "build"],
    ["dotnet build", "build"],
    ["gradle build", "build"],
    ["mvn package -DskipTests", "build"],
    ["swift build", "build"],
    ["CI=1 pnpm test", "test"],
    ["env NODE_ENV=test npx jest", "test"],
    ["timeout 600 xvfb-run -a pnpm test", "test"],
    ["cd apps/web && pnpm test", "test"],
    ["git status; pnpm lint", "lint"],
    ["/bin/zsh -lc 'cd apps/web && pnpm exec vitest run'", "test"],
    ['pwsh -Command "npm test"', "test"],
    ["(cd server && go test ./...)", "test"],
    ["pnpm test 2>&1 | tail -20", "test"],
  ])("%s runs %s", (command, kind) => {
    expect(classifyCheckCommand(command)).toBe(kind);
  });

  it.each([
    "cat test.txt",
    "grep build src",
    "ls tests",
    "echo lint",
    "echo 'pnpm test'",
    "git commit -m 'fix tests'",
    "rg -n 'pnpm test' docs",
    "test -f package.json",
    "pnpm install",
    "npm ci",
    "pnpm add -D vitest",
    "go run ./cmd/test",
    "cargo run -- test",
    "node scripts/build.js",
    "docker build .",
    "make",
    "bash -lc 'git diff'",
  ])("%s is not a check", (command) => {
    expect(classifyCheckCommand(command)).toBeNull();
  });
});

function command(
  input: string,
  fields: { exitCode?: number; status?: OrchestrationV2TurnItemStatus } = {},
) {
  return { type: "command_execution", input, status: "completed", ...fields } as never;
}

function edit(path: string, status: OrchestrationV2TurnItemStatus = "completed") {
  return { type: "file_change", fileName: path, status } as never;
}

describe("summarizeTurnChecks", () => {
  it("reports the latest run of each kind with the commands behind it", () => {
    expect(
      summarizeTurnChecks([
        command("pnpm test", { exitCode: 1 }),
        command("pnpm lint", { exitCode: 0 }),
        command("/bin/bash -lc 'pnpm test'", { exitCode: 0 }),
        command("pnpm build", { exitCode: 0 }),
        command("pnpm build", { exitCode: 2 }),
      ]),
    ).toEqual({
      checks: [
        { kind: "test", outcome: "passed", commands: ["pnpm test"] },
        { kind: "lint", outcome: "passed", commands: ["pnpm lint"] },
        { kind: "build", outcome: "failed", commands: ["pnpm build"] },
      ],
      untested: false,
    });
  });

  it.each([
    ["a running command", command("pnpm test", { status: "running" }), "running"],
    ["no exit code", command("pnpm test"), "unknown"],
    ["an exit code from a pipe", command("pnpm test | tail -5", { exitCode: 0 }), "unknown"],
    [
      "an exit code from a later command",
      command("pnpm test; echo done", { exitCode: 0 }),
      "unknown",
    ],
    ["a failure hidden by ||", command("pnpm test || true", { exitCode: 0 }), "unknown"],
    [
      "an && chain that passed",
      command("cd web && pnpm test && echo ok", { exitCode: 0 }),
      "passed",
    ],
    ["an && chain that failed", command("cd web && pnpm test", { exitCode: 1 }), "failed"],
  ])("reads %s", (_case, item, outcome) => {
    expect(summarizeTurnChecks([item])?.checks).toEqual([
      { kind: "test", outcome, commands: [expect.any(String)] },
    ]);
  });

  it("does not blame one check for a chain that ran several", () => {
    expect(
      summarizeTurnChecks([command("pnpm lint && pnpm test", { exitCode: 1 })])?.checks,
    ).toEqual([
      { kind: "test", outcome: "unknown", commands: ["pnpm lint && pnpm test"] },
      { kind: "lint", outcome: "unknown", commands: ["pnpm lint && pnpm test"] },
    ]);
    expect(
      summarizeTurnChecks([command("pnpm lint && pnpm test", { exitCode: 0 })])?.checks.map(
        (check) => check.outcome,
      ),
    ).toEqual(["passed", "passed"]);
  });

  it("flags changed code that no test command covered", () => {
    expect(summarizeTurnChecks([edit("src/a.ts"), command("pnpm lint", { exitCode: 0 })])).toEqual({
      checks: [{ kind: "lint", outcome: "passed", commands: ["pnpm lint"] }],
      untested: true,
    });
    expect(summarizeTurnChecks([edit("src/a.ts"), command("git diff")])).toEqual({
      checks: [],
      untested: true,
    });
    expect(
      summarizeTurnChecks([edit("src/a.ts"), command("pnpm test", { exitCode: 1 })]),
    ).toMatchObject({ untested: false });
  });

  it("shows nothing for a turn that changed no code and ran no checks", () => {
    expect(summarizeTurnChecks([])).toBeNull();
    expect(summarizeTurnChecks([command("git status", { exitCode: 0 })])).toBeNull();
    expect(summarizeTurnChecks([edit("README.md"), edit("src/a.ts", "failed")])).toBeNull();
  });
});
