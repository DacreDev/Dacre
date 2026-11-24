import { findLeftovers, isExcluded } from "./rules.ts";
import { readText, trackedFiles } from "./run.ts";

const print = (line: string) =>
  process.stdout.write(`${line}
`);

const MAX_PRINTED = 200;

let found = 0;
const report = (where: string, token: string) => {
  found += 1;
  if (found <= MAX_PRINTED) print(`${where}: ${token}`);
};

for (const file of trackedFiles()) {
  if (isExcluded(file.path, file.mode)) continue;
  for (const { token } of findLeftovers(file.path)) report(file.path, `path contains ${token}`);
  const text = readText(file.path);
  if (text === null) continue;
  for (const { token, line } of findLeftovers(text)) report(`${file.path}:${line}`, token);
}

print(found === 0 ? "clean: no T3 brand forms left" : `${found} leftovers`);
if (found > 0) process.exitCode = 1;
