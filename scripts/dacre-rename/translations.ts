// @effect-diagnostics nodeBuiltinImport:off - A one-shot migration tool with no Effect runtime.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { renameText } from "./rules.ts";

const print = (line: string) =>
  process.stdout.write(`${line}
`);
const printError = (line: string) =>
  process.stderr.write(`${line}
`);

type Catalog = Readonly<Record<string, unknown>>;

const renameValue = (value: unknown): unknown => {
  if (typeof value === "string") return renameText(value);
  if (Array.isArray(value)) return value.map(renameValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, renameValue(entry)]),
    );
  }
  return value;
};

/** Catalog keys hash the English text, so a renamed string gets a new key and needs its old value. */
export function restoreTranslations(input: {
  readonly oldEnglish: Catalog;
  readonly oldLocale: Catalog;
  readonly newEnglish: Catalog;
}): Record<string, unknown> {
  const byRenamedEnglish = new Map<string, unknown>();
  for (const [key, english] of Object.entries(input.oldEnglish)) {
    if (!(key in input.oldLocale)) continue;
    const id = JSON.stringify(renameValue(english));
    if (!byRenamedEnglish.has(id)) byRenamedEnglish.set(id, renameValue(input.oldLocale[key]));
  }
  return Object.fromEntries(
    Object.entries(input.newEnglish).map(([key, english]) => [
      key,
      key in input.oldLocale
        ? renameValue(input.oldLocale[key])
        : (byRenamedEnglish.get(JSON.stringify(english)) ?? english),
    ]),
  );
}

const readCatalog = (path: string): Catalog =>
  JSON.parse(NodeFS.readFileSync(path, "utf8")) as Catalog;

function main([beforeDir, appsDir]: ReadonlyArray<string>) {
  if (beforeDir === undefined || appsDir === undefined) {
    printError("usage: translations.ts <beforeDir> <appsDir>");
    process.exitCode = 2;
    return;
  }
  for (const app of NodeFS.readdirSync(beforeDir)) {
    const before = NodePath.join(beforeDir, app);
    const target = NodePath.join(appsDir, app, "src/i18n/translations");
    const oldEnglish = readCatalog(NodePath.join(before, "en.json"));
    const newEnglish = readCatalog(NodePath.join(target, "en.json"));
    for (const file of NodeFS.readdirSync(before)) {
      if (file === "en.json" || !file.endsWith(".json")) continue;
      const restored = restoreTranslations({
        oldEnglish,
        oldLocale: readCatalog(NodePath.join(before, file)),
        newEnglish,
      });
      NodeFS.writeFileSync(NodePath.join(target, file), `${JSON.stringify(restored, null, 2)}\n`);
    }
    print(`${app}: restored translations`);
  }
}

if (import.meta.main) main(process.argv.slice(2));
