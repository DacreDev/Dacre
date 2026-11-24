import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { parseDacreProjectFile, DacreProjectFileFromJson } from "./dacreProjectFile.ts";

const decodeJson = Schema.decodeUnknownSync(DacreProjectFileFromJson);

describe("DacreProjectFileFromJson", () => {
  it("decodes lenient JSONC with comments and trailing commas", () => {
    const decoded = decodeJson(`{
      // team scripts
      "iconPath": "assets/logo.svg",
      "scripts": [
        { "name": "Dev", "command": "pnpm dev", "stopOnSettle": true, },
      ],
    }`);

    expect(decoded.iconPath).toBe("assets/logo.svg");
    expect(decoded.scripts?.[0]).toEqual({ name: "Dev", command: "pnpm dev", stopOnSettle: true });
  });
});

describe("parseDacreProjectFile", () => {
  it("reads project defaults from JSONC with a URL in a block comment", () => {
    expect(
      parseDacreProjectFile(`{
        /* See https://dacre.invalid/schema/dacre.json */
        "defaultThreadEnvMode": "worktree"
      }`),
    ).toEqual({ defaultThreadEnvMode: "worktree" });
  });
});
