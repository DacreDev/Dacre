// The letter or digit before a name can end an escape: `\nt3`, `%st3`, `%2Ft3`, `\x1b[1mt3`, `t3`.
const ESCAPE = "\\\\[nrb]|\\\\u[0-9a-fA-F]{4}|%s|%[0-9A-Fa-f]{2}|\\[[0-9;]+[mK]";
const B = `(?:(?<![A-Za-z0-9])|(?<=${ESCAPE}))`;

// One pass: at each position the first rule that matches wins. `null` keeps the text as written.
const RULES: ReadonlyArray<readonly [source: string, to: string | null]> = [
  // Hashes, encoded data, vendored version tags and recorded fixture labels stay byte-exact.
  ["sha(?:1|256|384|512)-[A-Za-z0-9+/=]+", null],
  ["base64,[A-Za-z0-9+/=]+", null],
  ["-t3\\.\\d+", null],
  [`${B}t3-xai[A-Za-z0-9-]*`, null],
  // An escaped tab before a digit, as in "\t3m10s". A Windows path has `\\t3`, `:\t3` or a suffix.
  ["(?<![\\\\:])\\\\t3(?!\\.[a-z]|-[a-z])", null],
  ["wiki/T3_\\(protocol\\)", null],
  // An import of the prebuilt ghostty-write-pty.wasm, which keeps this name until it is rebuilt.
  [`${B}t3_write_pty\\b`, null],

  ["[Pp]ing[Dd]ot[Gg]{2}/[Tt]3[Cc]ode", "DacreDev/Dacre"],
  ["[Pp]ing[Dd]ot[Gg]{2}", "DacreDev"],
  // The same id inside a regular expression, with its dots escaped.
  ["com\\\\\\.t3tools\\\\\\.t3code", "dev\\.dacre\\.app"],
  ["com\\.t3tools\\.t3code", "dev.dacre.app"],
  ["com\\.t3tools\\.T3Code", "dev.dacre.Dacre"],
  ["com\\.t3tools\\.", "dev.dacre."],
  // A Java package path. In `github.com/t3tools/x`, `com` ends a host name.
  ["(?<![\\w.-])com/t3tools/t3code", "dev/dacre/app"],
  ["(?<![\\w.-])com/t3tools/", "dev/dacre/"],
  ["@t3tools/", "@dacre/"],
  [`${B}t3tools`, "dacre"],
  [`${B}T3Tools`, "Dacre"],
  ["T3 Tools Inc\\.?", "Dacre contributors"],
  ["T3 Tools", "Dacre contributors"],
  ["T3 Connect", "Dacre Connect"],
  ["T3 Chat", "Dacre Chat"],
  [`${B}t3 chat`, "Dacre Chat"],
  [`${B}t3\\.codes`, "dacre.invalid"],
  [`${B}t3\\\\\\.codes`, "dacre\\.invalid"],
  [`${B}t3\\.chat`, "chat.dacre.invalid"],
  [`${B}t3-chat`, "rose"],

  // A possessive, as in Swedish "T3 Codes".
  [`(?:(?<![A-Z0-9])|(?<=${ESCAPE}))T3 Codes(?![a-z])`, "Dacres"],
  [`(?:(?<![A-Z0-9])|(?<=${ESCAPE}))T3(?:[ -]|%20|\\+)?[Cc]ode(?![a-z])`, "Dacre"],
  [`${B}t3 code(?![a-z])`, "Dacre"],
  // A regular expression's spelling of the name, as in t3[-_ ]?code.
  [`${B}t3(?:\\[[-_ ]+\\]\\??|_\\?)code`, "dacre"],
  ["T3CODE", "DACRE"],
  // Upstream's T3_CODE_ constants are DACRE_ constants here, not DA_CODE_.
  [`${B}T3_CODE_(?=[A-Z0-9])`, "DACRE_"],
  // Not DACRE_: HOME, PROJECT_ROOT and RELEASE_BASE_URL exist under both prefixes.
  [`${B}T3_(?=[A-Z0-9])`, "DA_"],
  [`${B}t3Code(?![a-z])`, "dacre"],
  [`${B}t3[-_]?code(?![a-z])`, "dacre"],
  [`${B}t3dotgg`, "octocat"],
  [`${B}t3coderelay`, "dacrerelay"],
  [`${B}t3coed`, "dacer"],
  [`${B}t3co(?![a-z])`, "dacr"],
  ["(?<=__)t3(?=[a-z]\\b)", "dacre"],
  [`${B}t3c(?![a-z])`, "dac"],
  ["(?<=mount_)T3", "Dacre"],
  [`${B}t3(?=[a-z]{2,})`, "dacre"],

  ["(?<![A-Z0-9])T3(?=[A-Z])", "Dacre"],
  // Named prefixes only: a random token can also end in T3.
  ["(?<=\\b(?:all|raisedBy|n|pathWith|with|not|fake|Mobile))T3\\b", "Dacre"],
  ["(?<=[A-Z0-9]_)T3\\b", "DACRE"],
  [`${B}t3(?=[A-Z])`, "dacre"],
  [`${B}T3(?![A-Za-z0-9_])`, "Dacre"],
  [`(?:(?<![A-Za-z0-9@])|(?<=${ESCAPE}))t3(?![A-Za-z0-9])`, "dacre"],
];

const MATCHER = new RegExp(RULES.map(([source]) => `(${source})`).join("|"), "g");
const KEPT = new RegExp(
  RULES.filter(([, to]) => to === null)
    .map(([source]) => source)
    .join("|"),
  "g",
);
// id6787819824 is T3's App Store listing, which carries no brand name in its ID.
const LEFTOVER = new RegExp(
  `${B}[Tt]3(?![0-9])|[Pp]ing[Dd]ot[Gg]{2}|[a-z]T3[A-Z]|id6787819824`,
  "g",
);
const DELIBERATE = "rename-scan: T3 input on purpose";

const EXCLUDED = [
  /^\.repos\//,
  /^LICENSE$/,
  /^NOTICE$/,
  /^third-party-licenses\//,
  /^apps\/[^/]+\/deps\/.*\.tgz$/,
  /^scripts\/dacre-rename\//,
  /^patches\//,
  /\/Vendor\//,
];

export function renameText(text: string): string {
  if (!/[tT]3|pingdotgg/.test(text)) return text;
  return text.replace(MATCHER, (match: string, ...groups: ReadonlyArray<unknown>) => {
    const rule = RULES[groups.findIndex((group) => group !== undefined)];
    return rule?.[1] ?? match;
  });
}

export const renamePath = (path: string): string => renameText(path);

export const isExcluded = (path: string, gitMode: string): boolean =>
  gitMode === "120000" || EXCLUDED.some((pattern) => pattern.test(path));

export function findLeftovers(
  text: string,
): ReadonlyArray<{ readonly token: string; readonly line: number }> {
  return text.split("\n").flatMap((line, index) => {
    if (line.includes(DELIBERATE)) return [];
    const masked = line.replace(KEPT, (kept) => " ".repeat(kept.length));
    return [...masked.matchAll(LEFTOVER)].map((match) => ({ token: match[0], line: index + 1 }));
  });
}

export function findPathCollisions(paths: ReadonlyArray<string>): ReadonlyArray<string> {
  const existing = new Set(paths);
  const targets = new Set<string>();
  const collisions = new Set<string>();
  for (const path of paths) {
    const target = renamePath(path);
    if (target === path) continue;
    if (existing.has(target) || targets.has(target)) collisions.add(target);
    targets.add(target);
  }
  return [...collisions].sort();
}
