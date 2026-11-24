import {
  CheckpointScopeId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@dacre/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "../../providerInstances";
import { secondOpinionPrompt, secondOpinionProviders } from "./secondOpinion.logic";

const file = (path: string) => ({ path, kind: "modified", additions: 1, deletions: 0 });

const repository = (name: string, location: { cwd: string; relativePath?: string }) => ({
  scopeId: CheckpointScopeId.make(`scope-${name}`),
  name,
  repositoryPath: location.cwd,
  ...location,
  files: [file("src/index.ts")],
  baselineMissing: false,
});

describe("secondOpinionPrompt", () => {
  it("names each changed file and asks for a review that edits nothing", () => {
    expect(secondOpinionPrompt({ files: [file("src/a.ts"), file("src/b.ts")] })).toBe(
      [
        "Review the changes the main thread's latest turn made. Files it changed:",
        "",
        "- `src/a.ts`",
        "- `src/b.ts`",
        "",
        "Check them for correctness, risks, and missing tests. Do not edit any files.",
      ].join("\n"),
    );
  });

  it("lists 20 files and counts the rest, also those the turn's file list left out", () => {
    const prompt = secondOpinionPrompt({
      files: Array.from({ length: 25 }, (_, index) => file(`src/${index}.ts`)),
      filesTotal: { count: 40, additions: 40, deletions: 0 },
    });

    expect(prompt).toContain("- `src/19.ts`\n- and 20 more\n");
    expect(prompt).not.toContain("src/20.ts");
  });

  it("names a repository's files from the thread's folder", () => {
    const prompt = secondOpinionPrompt({
      files: [file("README.md")],
      repositories: [
        repository("api", { cwd: "/work/app/packages/api", relativePath: "packages/api" }),
        repository("lib", { cwd: "/other/lib" }),
      ],
    });

    expect(prompt).toContain(
      "- `README.md`\n- `packages/api/src/index.ts`\n- `/other/lib/src/index.ts`\n",
    );
  });
});

describe("secondOpinionProviders", () => {
  const provider = (instanceId: string, status: ServerProvider["status"] = "ready") =>
    ({
      instanceId: ProviderInstanceId.make(instanceId),
      driver: ProviderDriverKind.make(instanceId),
      enabled: true,
      installed: true,
      version: null,
      status,
      auth: { status: "authenticated" },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
    }) satisfies ServerProvider;

  it("offers ready providers, other agents before the thread's own", () => {
    const entries = deriveProviderInstanceEntries([
      provider("claudeAgent"),
      provider("codex"),
      provider("cursor", "error"),
      provider("opencode"),
    ]);

    expect(
      secondOpinionProviders(entries, ProviderInstanceId.make("claudeAgent")).map(
        (entry) => entry.instanceId,
      ),
    ).toEqual(["codex", "opencode", "claudeAgent"]);
  });
});
