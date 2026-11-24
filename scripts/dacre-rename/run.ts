// @effect-diagnostics nodeBuiltinImport:off - A one-shot migration tool with no Effect runtime.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { findLeftovers, findPathCollisions, isExcluded, renamePath, renameText } from "./rules.ts";

const print = (line: string) =>
  process.stdout.write(`${line}
`);
const printError = (line: string) =>
  process.stderr.write(`${line}
`);

const NEW_NAME = /(?<![A-Za-z0-9])(?:DACRE_|DA_)[A-Z0-9]/;
const MAX_SAMPLES = 40;

export interface TrackedFile {
  readonly mode: string;
  readonly path: string;
}

export function trackedFiles(): ReadonlyArray<TrackedFile> {
  return NodeChildProcess.execFileSync("git", ["ls-files", "-s", "-z"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const [meta = "", path = ""] = entry.split("\t");
      return { mode: meta.split(" ")[0] ?? "", path };
    });
}

/** Text content of a file, or null for binary or non-UTF-8 data, which must stay byte-exact. */
export function readText(path: string): string | null {
  const data = NodeFS.readFileSync(path);
  if (data.subarray(0, 8192).includes(0)) return null;
  const text = data.toString("utf8");
  return Buffer.from(text, "utf8").equals(data) ? text : null;
}

function removeEmptyParents(path: string) {
  for (let dir = NodePath.dirname(path); dir !== "."; dir = NodePath.dirname(dir)) {
    if (NodeFS.readdirSync(dir).length > 0) return;
    NodeFS.rmdirSync(dir);
  }
}

function main(mode: string | undefined) {
  if (mode === "--map-stdin") {
    process.stdout.write(renameText(NodeFS.readFileSync(0, "utf8")));
    return;
  }
  if (mode !== "--dry-run" && mode !== "--apply") {
    printError("usage: run.ts --dry-run | --apply | --map-stdin");
    process.exitCode = 2;
    return;
  }

  const files = trackedFiles();
  const movable = files.filter((file) => !file.path.startsWith(".repos/"));
  const collisions = findPathCollisions(movable.map((file) => file.path));
  const moves = movable.flatMap((file) => {
    const to = renamePath(file.path);
    return to === file.path ? [] : [{ from: file.path, to }];
  });

  const changed: Array<string> = [];
  const clashes: Array<string> = [];
  const tally = new Map<string, number>();
  const samples: Array<string> = [];
  for (const file of files) {
    if (isExcluded(file.path, file.mode)) continue;
    const text = readText(file.path);
    if (text === null) continue;
    if (NEW_NAME.test(text)) clashes.push(file.path);
    const renamed = renameText(text);
    if (renamed !== text) changed.push(file.path);
    for (const { token, line } of findLeftovers(renamed)) {
      tally.set(token, (tally.get(token) ?? 0) + 1);
      if (samples.length < MAX_SAMPLES) {
        samples.push(`${file.path}:${line}: ${renamed.split("\n")[line - 1]?.trim().slice(0, 90)}`);
      }
    }
  }

  print(`text files to change: ${changed.length}`);
  print(`paths to move: ${moves.length}`);
  print(`path collisions: ${collisions.length}`);
  for (const collision of collisions) print(`  ${collision}`);
  print(`files already using DA_ or DACRE_ names: ${clashes.length}`);
  for (const clash of clashes.slice(0, MAX_SAMPLES)) print(`  ${clash}`);
  print(`leftovers after rename: ${[...tally.values()].reduce((a, b) => a + b, 0)}`);
  for (const [token, count] of tally) print(`  ${token}: ${count}`);
  for (const sample of samples) print(`  ${sample}`);

  if (collisions.length > 0 || clashes.length > 0) {
    process.exitCode = 1;
    return;
  }
  if (mode === "--dry-run") return;

  for (const path of changed) {
    const text = readText(path);
    if (text !== null) NodeFS.writeFileSync(path, renameText(text));
  }
  for (const { from, to } of moves) {
    NodeFS.mkdirSync(NodePath.dirname(to), { recursive: true });
    NodeFS.renameSync(from, to);
    removeEmptyParents(from);
  }
  print("applied");
}

if (import.meta.main) main(process.argv[2]);
