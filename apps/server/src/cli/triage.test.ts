// @effect-diagnostics nodeBuiltinImport:off -- Exercise the CLI the way a user runs it.
import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";

import { expect, it } from "vite-plus/test";

const cliPath = NodeURL.fileURLToPath(new URL("../bin.ts", import.meta.url));

it("refuses because Dacre has no triage playbook", () => {
  const result = NodeChildProcess.spawnSync(process.execPath, [cliPath, "triage"], {
    encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).toContain("Triage is not available in Dacre yet.");
});
