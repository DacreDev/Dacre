import * as Option from "effect/Option";

export type JoinPath = (first: string, ...segments: string[]) => string;

function normalizeConfiguredBaseDir(dacreHome: Option.Option<string>): Option.Option<string> {
  if (Option.isNone(dacreHome)) {
    return Option.none();
  }
  const trimmed = dacreHome.value.trim();
  return trimmed.length > 0 ? Option.some(trimmed) : Option.none();
}

export function resolveDesktopBaseDir(input: {
  readonly homeDirectory: string;
  readonly joinPath: JoinPath;
  readonly dacreHome: Option.Option<string>;
}): string {
  return Option.getOrElse(normalizeConfiguredBaseDir(input.dacreHome), () =>
    input.joinPath(input.homeDirectory, ".dacre"),
  );
}

export function resolveDesktopStateDir(input: {
  readonly baseDir: string;
  readonly isDevelopment: boolean;
  readonly joinPath: JoinPath;
  readonly dacreHome: Option.Option<string>;
}): string {
  const useDevSubdir =
    input.isDevelopment && Option.isNone(normalizeConfiguredBaseDir(input.dacreHome));
  return input.joinPath(input.baseDir, useDevSubdir ? "dev" : "userdata");
}
