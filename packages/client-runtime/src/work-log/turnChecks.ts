import type { OrchestrationV2TurnItem } from "@dacre/contracts";

import {
  commandDisplayText,
  splitFirstShellCommand,
  tokenizeShellCommand,
  withoutShellWrapper,
} from "./commandLabel.ts";

export type CheckKind = "test" | "lint" | "typecheck" | "build";
export type CheckOutcome = "passed" | "failed" | "running" | "unknown";

export interface TurnCheck {
  readonly kind: CheckKind;
  /** How the turn's latest command of this kind ended. */
  readonly outcome: CheckOutcome;
  readonly commands: ReadonlyArray<string>;
}

export interface TurnChecks {
  readonly checks: ReadonlyArray<TurnCheck>;
  /** The turn changed code and ran no test command. */
  readonly untested: boolean;
}

interface CheckRun {
  readonly kind: CheckKind;
  /** False once `|`, `;`, `||` or `&` hands the command's exit code to something else. */
  readonly ownsExitCode: boolean;
}

type CommandItem = Extract<OrchestrationV2TurnItem, { type: "command_execution" }>;

const CHECK_ORDER: ReadonlyArray<CheckKind> = ["test", "lint", "typecheck", "build"];
const MAX_SEGMENTS = 64;
const MAX_DEPTH = 4;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;
// Changing only prose does not call for tests.
const PROSE_FILE = /\.(?:md|mdx|markdown|txt|rst|adoc)$/iu;

// Script and task names: `pnpm test:unit`, `npm run check:types`, `make lint`.
const SCRIPT_KINDS: ReadonlyArray<readonly [RegExp, CheckKind]> = [
  [
    /^(?:typecheck|type-check|types|check-types|tsc)(?:[:-]|$)|:(?:typecheck|type-check|types)$/u,
    "typecheck",
  ],
  [/^(?:t|tests?|unit|e2e)(?:[:-]|$)|:tests?$/u, "test"],
  [/^(?:lint|check|eslint)(?:[:-]|$)|:(?:lint|check)$/u, "lint"],
  [/^(?:build|compile)(?:[:-]|$)|:build$/u, "build"],
];

const PROGRAM_KINDS: Readonly<Record<string, CheckKind>> = {
  vitest: "test",
  jest: "test",
  mocha: "test",
  ava: "test",
  pytest: "test",
  "py.test": "test",
  unittest: "test",
  rspec: "test",
  phpunit: "test",
  ctest: "test",
  eslint: "lint",
  oxlint: "lint",
  biome: "lint",
  ruff: "lint",
  flake8: "lint",
  pylint: "lint",
  "golangci-lint": "lint",
  rubocop: "lint",
  stylelint: "lint",
  shellcheck: "lint",
  tsc: "typecheck",
  tsgo: "typecheck",
  "effect-tsgo": "typecheck",
  "vue-tsc": "typecheck",
  "svelte-check": "typecheck",
  mypy: "typecheck",
  pyright: "typecheck",
  webpack: "build",
  tsup: "build",
};

// The first argument decides: `go test`, `cargo clippy`.
const SUBCOMMAND_KINDS: Readonly<Record<string, Readonly<Record<string, CheckKind>>>> = {
  go: { test: "test", vet: "typecheck", build: "build" },
  cargo: { test: "test", nextest: "test", clippy: "lint", check: "typecheck", build: "build" },
  dotnet: { test: "test", build: "build" },
  mix: { test: "test", credo: "lint", compile: "build" },
  swift: { test: "test", build: "build" },
  deno: { test: "test", lint: "lint", check: "typecheck" },
  playwright: { test: "test" },
  vite: { build: "build" },
  next: { build: "build", lint: "lint" },
  xcodebuild: { test: "test", build: "build" },
  flutter: { test: "test", analyze: "lint", build: "build" },
  dart: { test: "test", analyze: "lint" },
};

const MAVEN_PHASES: Readonly<Record<string, CheckKind>> = {
  test: "test",
  verify: "test",
  compile: "build",
  package: "build",
  install: "build",
};

// Any argument can name the script or task: `make clean test`, `vp run lint`, `gradle build`.
const SCRIPT_RUNNERS = new Set(["make", "just", "turbo", "nx", "vp", "gradle"]);
// Run the command that follows their own options: `npx vitest`, `env CI=1 jest`.
const WRAPPERS = new Set([
  "env",
  "npx",
  "pnpx",
  "bunx",
  "uvx",
  "time",
  "timeout",
  "nice",
  "nohup",
  "sudo",
  "xvfb-run",
  "cross-env",
]);
// Run the command after a verb: `uv run pytest`, `bundle exec rspec`.
const VERB_WRAPPERS: Readonly<Record<string, string>> = {
  uv: "run",
  poetry: "run",
  pipenv: "run",
  pdm: "run",
  rye: "run",
  hatch: "run",
  bundle: "exec",
};
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const PACKAGE_MANAGER_VALUE_OPTIONS = new Set([
  "-C",
  "--dir",
  "-F",
  "--filter",
  "--prefix",
  "--workspace",
  "--cwd",
]);
const PROGRAM_ALIASES: Readonly<Record<string, string>> = {
  gradlew: "gradle",
  mvnw: "mvn",
  py: "python",
};

function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

function scriptKind(name: string): CheckKind | null {
  const lower = name.toLowerCase();
  return SCRIPT_KINDS.find(([pattern]) => pattern.test(lower))?.[1] ?? null;
}

function programName(token: string): string {
  const name = (token.split(/[\\/]/u).at(-1) ?? token)
    .toLowerCase()
    .replace(/\.(?:exe|cmd|bat)$/u, "");
  return own(PROGRAM_ALIASES, name) ?? (/^python[\d.]*$/u.test(name) ? "python" : name);
}

// No program starts with `-` or a digit, so this also skips `timeout 60` and `2>/dev/null`.
function withoutLeadingOptions(args: ReadonlyArray<string>): ReadonlyArray<string> {
  const start = args.findIndex((arg) => !/^[-\d]/u.test(arg) && !ENV_ASSIGNMENT.test(arg));
  return start < 0 ? [] : args.slice(start);
}

function argvKind(argv: ReadonlyArray<string>): CheckKind | null {
  const [token, ...args] = withoutLeadingOptions(argv);
  if (token === undefined) return null;
  const program = programName(token);
  const positional = args.filter((arg) => !arg.startsWith("-"));
  if (WRAPPERS.has(program)) return argvKind(args);
  const verb = own(VERB_WRAPPERS, program);
  if (verb !== undefined) {
    return positional[0] === verb ? argvKind(args.slice(args.indexOf(verb) + 1)) : null;
  }
  if (PACKAGE_MANAGERS.has(program)) return packageManagerKind(program, args);
  if (program === "python") {
    const module = args.indexOf("-m");
    return module < 0 ? null : argvKind(args.slice(module + 1));
  }
  if (SCRIPT_RUNNERS.has(program)) return positional.map(scriptKind).find(Boolean) ?? null;
  if (program === "mvn") {
    return positional.map((phase) => own(MAVEN_PHASES, phase)).find(Boolean) ?? null;
  }
  const subcommands = own(SUBCOMMAND_KINDS, program);
  return (
    own(PROGRAM_KINDS, program) ??
    (subcommands && positional[0] ? own(subcommands, positional[0]) : undefined) ??
    null
  );
}

function packageManagerKind(manager: string, args: ReadonlyArray<string>): CheckKind | null {
  let index = 0;
  while (args[index]?.startsWith("-")) {
    const option = args[index]!;
    // npm's `-w` names a workspace; pnpm's takes no value.
    index +=
      PACKAGE_MANAGER_VALUE_OPTIONS.has(option) || (option === "-w" && manager === "npm") ? 2 : 1;
  }
  const verb = args[index];
  const rest = args.slice(index + 1);
  if (verb === undefined) return null;
  if (verb === "exec" || verb === "dlx" || verb === "x") return argvKind(rest);
  if (verb === "run" || verb === "run-script") return packageManagerKind(manager, rest);
  if (verb === "workspace") return packageManagerKind(manager, rest.slice(1));
  // pnpm, yarn and bun also run a package's binaries by name: `pnpm vitest`.
  return scriptKind(verb) ?? argvKind([verb, ...rest]);
}

function segmentRuns(segment: string, depth: number): CheckRun[] {
  const trimmed = segment.trim();
  if (depth < MAX_DEPTH) {
    if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
      return checkRuns(trimmed.slice(1, -1), depth + 1);
    }
    const script = withoutShellWrapper(trimmed);
    if (script !== trimmed) return checkRuns(script, depth + 1);
  }
  const tokens = tokenizeShellCommand(trimmed);
  const kind = tokens === null ? null : argvKind(tokens);
  return kind === null ? [] : [{ kind, ownsExitCode: true }];
}

function checkRuns(command: string, depth = 0): CheckRun[] {
  let runs: CheckRun[] = [];
  let rest: string | null = command;
  for (let segment = 0; rest !== null && segment < MAX_SEGMENTS; segment += 1) {
    const split = splitFirstShellCommand(rest);
    runs.push(...segmentRuns(split.firstCommand, depth));
    if (split.separator !== null && split.separator !== "&&") {
      runs = runs.map((run) => ({ ...run, ownsExitCode: false }));
    }
    rest = split.remainingCommand;
  }
  return runs;
}

/** The kind of the first check a shell command runs, read from its programs and arguments. */
export function classifyCheckCommand(command: string): CheckKind | null {
  return checkRuns(command)[0]?.kind ?? null;
}

// Timeline rows are rebuilt on every turn update, so each command is parsed once.
const parsedCommands = new Map<string, { runs: CheckRun[]; text: string }>();

function parseCommand(command: string) {
  let parsed = parsedCommands.get(command);
  if (parsed === undefined) {
    if (parsedCommands.size >= 2_000) parsedCommands.clear();
    parsed = { runs: checkRuns(command), text: commandDisplayText(command) };
    parsedCommands.set(command, parsed);
  }
  return parsed;
}

function runOutcome(item: CommandItem, run: CheckRun, ownerKinds: number): CheckOutcome {
  if (item.status === "pending" || item.status === "running" || item.status === "waiting") {
    return "running";
  }
  if (item.exitCode === undefined || !run.ownsExitCode) return "unknown";
  if (item.exitCode === 0) return "passed";
  // A failing `lint && test` stopped at one of them, and the exit code does not say which.
  return ownerKinds === 1 ? "failed" : "unknown";
}

/**
 * What a turn verified, from the commands it ran and their exit codes: the latest run of each
 * kind decides its outcome. Null when the turn ran no checks and changed no code.
 */
export function summarizeTurnChecks(items: Iterable<OrchestrationV2TurnItem>): TurnChecks | null {
  const latest = new Map<CheckKind, { outcome: CheckOutcome; commands: Set<string> }>();
  let codeChanged = false;
  for (const item of items) {
    // shortcut: edits made by shell commands are missed, read the run's checkpoint if that matters.
    if (item.type === "file_change" && item.status === "completed") {
      const paths = item.changes?.map((change) => change.path) ?? [item.fileName];
      codeChanged ||= paths.some((path) => !PROSE_FILE.test(path));
    }
    if (item.type !== "command_execution") continue;
    const { runs, text } = parseCommand(item.input);
    const ownerKinds = new Set(runs.filter((run) => run.ownsExitCode).map((run) => run.kind)).size;
    for (const run of runs) {
      const check = latest.get(run.kind) ?? { outcome: "unknown", commands: new Set<string>() };
      check.outcome = runOutcome(item, run, ownerKinds);
      check.commands.add(text);
      latest.set(run.kind, check);
    }
  }
  const checks = CHECK_ORDER.flatMap((kind) => {
    const check = latest.get(kind);
    return check ? [{ kind, outcome: check.outcome, commands: [...check.commands] }] : [];
  });
  const untested = codeChanged && !latest.has("test");
  return checks.length > 0 || untested ? { checks, untested } : null;
}
