import {
  DA_PROJECT_FILE_NAME,
  type EnvironmentId,
  type DacreProjectFile,
  type DacreProjectFileScript,
} from "@dacre/contracts";
import { parseDacreProjectFile } from "@dacre/shared/dacreProjectFile";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const NO_SCRIPTS: ReadonlyArray<DacreProjectFileScript> = [];

export interface DacreProjectFileState {
  status: "loading" | "missing" | "invalid" | "valid";
  file: DacreProjectFile | null;
  scripts: ReadonlyArray<DacreProjectFileScript>;
}

export function useDacreProjectFileState(
  environmentId: EnvironmentId,
  cwd: string | null,
): DacreProjectFileState {
  const query = useProjectFileQuery(environmentId, cwd ?? "", DA_PROJECT_FILE_NAME, cwd !== null);
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  const isPending = query.isPending;
  if (contents === null) {
    return {
      status: isPending ? "loading" : "missing",
      file: null,
      scripts: NO_SCRIPTS,
    } as const;
  }
  const file = parseDacreProjectFile(contents);
  if (file === null) {
    return { status: "invalid", file: null, scripts: NO_SCRIPTS } as const;
  }
  return { status: "valid", file, scripts: file.scripts ?? NO_SCRIPTS } as const;
}

export function useDacreProjectFileScripts(
  environmentId: EnvironmentId,
  cwd: string | null,
): ReadonlyArray<DacreProjectFileScript> {
  return useDacreProjectFileState(environmentId, cwd).scripts;
}
