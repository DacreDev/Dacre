export function isWindowsDrivePath(value: string): boolean {
  return /^[a-zA-Z]:([/\\]|$)/.test(value);
}

export function isUncPath(value: string): boolean {
  return value.startsWith("\\\\");
}

/**
 * Windows treats `/` and `\` alike, so any two leading separators name a UNC
 * or device path. Touching one makes Windows sign in to that host with the
 * user's NTLM credentials, so agent-authored paths must not reach one.
 */
export function isNetworkPath(value: string): boolean {
  return /^[\\/]{2}/.test(value);
}

/** A `\\wsl.localhost\<distro>` or `\\wsl$\<distro>` share: a WSL distro's files seen from Windows over 9P. */
export function isWslSharePath(value: string): boolean {
  return /^[\\/]{2}(?:[?.][\\/]UNC[\\/])?wsl(?:\.localhost|\$)[\\/]/i.test(value.trim());
}

/** Drops trailing `chars`; a loop because an unanchored `/x+$/` backtracks quadratically. */
export function trimEndChars(value: string, chars: string): string {
  let end = value.length;
  while (end > 0 && chars.includes(value[end - 1]!)) end -= 1;
  return value.slice(0, end);
}

export function isWindowsAbsolutePath(value: string): boolean {
  return isUncPath(value) || isWindowsDrivePath(value);
}

export function isExplicitRelativePath(value: string): boolean {
  return (
    value === "." ||
    value === ".." ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith(".\\") ||
    value.startsWith("..\\")
  );
}

function isRootPath(value: string): boolean {
  // Bare C: means the current directory on C, not its root; require the drive separator.
  return value === "/" || value === "\\" || /^[a-zA-Z]:[/\\]$/.test(value);
}

function trimTrailingPathSeparators(value: string): string {
  if (value.length === 0 || isRootPath(value)) {
    return value;
  }
  const trimmed = trimEndChars(value, value.startsWith("/") ? "/" : "/\\");
  if (trimmed.length === 0) {
    return value;
  }
  return /^[a-zA-Z]:$/.test(trimmed) ? `${trimmed}\\` : trimmed;
}

export function normalizeProjectPathForDispatch(value: string): string {
  return trimTrailingPathSeparators(value.trim());
}

export function normalizeProjectPathForComparison(value: string): string {
  const normalized = normalizeProjectPathForDispatch(value);
  if (isWindowsDrivePath(normalized) || isUncPath(normalized)) {
    return normalized.replaceAll("/", "\\").toLowerCase();
  }
  return normalized;
}

// Windows refuses these as file names, with or without an extension.
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

// Latin letters NFKD leaves whole (ł, ø, ß) or splits with a spacing mark (Ŀ, ŉ).
const LATIN_FOLDS: Record<string, string> = {
  Ŀ: "L",
  ŀ: "l",
  ŉ: "n",
  Đ: "D",
  đ: "d",
  Ð: "D",
  ð: "d",
  ß: "ss",
  ẞ: "SS",
  Ł: "L",
  ł: "l",
  Ø: "O",
  ø: "o",
  Æ: "AE",
  æ: "ae",
  Œ: "OE",
  œ: "oe",
  Þ: "TH",
  þ: "th",
  Ħ: "H",
  ħ: "h",
  ı: "i",
  ĸ: "q",
  Ŋ: "N",
  ŋ: "n",
  Ŧ: "T",
  ŧ: "t",
};
const LATIN_FOLD_PATTERN = new RegExp(`[${Object.keys(LATIN_FOLDS).join("")}]`, "g");

/** Folds accented Latin letters to ASCII ("tìm" -> "tim"); other scripts pass through. */
export function foldLatinDiacritics(text: string): string {
  return text
    .replace(LATIN_FOLD_PATTERN, (letter) => LATIN_FOLDS[letter] ?? letter)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function newProjectFolderName(name: string): string {
  const slug = foldLatinDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  if (slug.length === 0) return "project";
  return WINDOWS_RESERVED_NAME.test(slug) ? `${slug}-project` : slug;
}

const SLASH_PREFIXED_WINDOWS_DRIVE_PATTERN = /^\/[A-Za-z]:[\\/]/;

/** Browser URL parsers write `C:/foo` as `/C:/foo` for file URLs. */
export function stripSlashPrefixedWindowsDrive(path: string): string {
  return SLASH_PREFIXED_WINDOWS_DRIVE_PATTERN.test(path) ? path.slice(1) : path;
}

export function fileBasename(path: string): string {
  const trimmed = trimEndChars(path, "/\\");
  if (trimmed.length === 0) return path;
  const separatorIndex = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : trimmed;
}

/** A path's last segment composed to NFC for display: macOS stores many names in NFD. */
export function fileDisplayName(path: string): string {
  return fileBasename(path).normalize("NFC");
}

export function workspaceRelativeFilePath(
  path: string,
  workspaceRoot: string | null | undefined,
): string | null {
  if (!workspaceRoot) return null;
  const caseInsensitive =
    isWindowsAbsolutePath(stripSlashPrefixedWindowsDrive(workspaceRoot)) ||
    (isNetworkPath(workspaceRoot) && isUncPath(path));
  const normalizedPath = caseInsensitive
    ? stripSlashPrefixedWindowsDrive(path.replaceAll("\\", "/"))
    : path;
  const normalizedRoot = trimEndChars(
    caseInsensitive
      ? stripSlashPrefixedWindowsDrive(workspaceRoot.replaceAll("\\", "/"))
      : workspaceRoot,
    "/",
  );
  const pathForCompare = caseInsensitive ? normalizedPath.toLowerCase() : normalizedPath;
  const rootForCompare = caseInsensitive ? normalizedRoot.toLowerCase() : normalizedRoot;
  if (trimEndChars(pathForCompare, "/") === rootForCompare) return ".";
  if (!pathForCompare.startsWith(`${rootForCompare}/`)) return null;
  const relativePath = normalizedPath.slice(normalizedRoot.length + 1);
  // `/repo/../x` starts with the root but escapes it; the server rejects that as a workspace path.
  let depth = 0;
  for (const segment of relativePath.split("/")) {
    if (segment === "..") depth -= 1;
    else if (segment.length > 0 && segment !== ".") depth += 1;
    if (depth < 0) return null;
  }
  return relativePath;
}

export function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || isWindowsAbsolutePath(value);
}

/** Both ~/ and ~\ home prefixes are expanded by the destination server. */
export function isHostPath(value: string): boolean {
  return isAbsolutePath(value) || value.startsWith("~/") || value.startsWith("~\\");
}

// Finder and Explorer copy a path ready for a shell: `'/a b'`, `/a\'s\ b`, or `"C:\a b"`.
// The leftmost `'…'` (with `'\''` escapes) or `"…"` that ends the text, found in one pass; the
// unanchored regex `(?:'((?:[^']|'\\'')+)'|"([^"]+)")\s*$` backtracks quadratically.
function quotedPathAtEnd(text: string): { readonly index: number; readonly path: string } | null {
  const end = text.trimEnd().length - 1;
  if (text[end] === '"') {
    const index = text.lastIndexOf('"', end - 1);
    return index >= 0 && index < end - 1 ? { index, path: text.slice(index + 1, end) } : null;
  }
  if (text[end] !== "'") return null;
  // bodyFrom[i]: text[i..end) is only non-quotes and `'\''` escapes.
  const bodyFrom: boolean[] = [];
  bodyFrom[end] = true;
  let index = -1;
  for (let i = end - 1; i >= 0; i -= 1) {
    if (text[i] !== "'") {
      bodyFrom[i] = bodyFrom[i + 1]!;
      continue;
    }
    bodyFrom[i] = i + 4 <= end && text.startsWith("'\\''", i) && bodyFrom[i + 4]!;
    if (i + 1 < end && bodyFrom[i + 1]) index = i;
  }
  return index >= 0 ? { index, path: text.slice(index + 1, end).replaceAll("'\\''", "'") } : null;
}
const SHELL_ESCAPE = /\\([\s'"\\()[\]{}<>|&;$`!*?#~^=])/g;

// Folder browsers only navigate `~/` home paths, so a pasted `~\` path is not a replacement.
function isPastedFolderPath(value: string): boolean {
  return isAbsolutePath(value) || value.startsWith("~/");
}

/**
 * What a folder box holds after a change. A full path pasted into it replaces the box, even after
 * the text already there, because `~/'/a b'` would create that nested folder.
 */
export function resolvePastedPath(previous: string, next: string): string {
  const isTyping = next.startsWith(previous)
    ? next.length === previous.length + 1
    : previous.startsWith(next);
  if (isTyping) return next;

  const quoted = quotedPathAtEnd(next);
  // Text before the quote that wasn't in the box is a search, not a folder to paste after.
  if (quoted && previous.startsWith(next.slice(0, quoted.index).trimEnd())) {
    if (isPastedFolderPath(quoted.path)) return quoted.path;
  }

  // Without a trailing separator, `/a` then `/a/b` is a longer path, not one pasted after a folder.
  const afterFolder = /[/\\]$/.test(previous) && next.startsWith(previous);
  const path = afterFolder ? next.slice(previous.length) : next;
  if (!isPastedFolderPath(path)) return next;
  // `\` separates folders in Windows paths, so it only escapes in `/` and `~/` paths.
  return isWindowsAbsolutePath(path) ? path : path.replace(SHELL_ESCAPE, "$1");
}

export function resolveWorkspaceFilePath(path: string, workspaceRoot: string): string {
  if (isAbsolutePath(path) || path.startsWith("~/") || path.startsWith("~\\")) return path;
  const base = trimEndChars(workspaceRoot, "/\\");
  return isWindowsAbsolutePath(workspaceRoot)
    ? `${base}\\${path.replaceAll("/", "\\")}`
    : `${base}/${path}`;
}
