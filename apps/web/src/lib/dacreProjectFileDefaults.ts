import {
  DA_PROJECT_FILE_NAME,
  type EnvironmentId,
  type ProjectReadFileResult,
  type DacreProjectFile,
} from "@dacre/contracts";
import { parseDacreProjectFile } from "@dacre/shared/dacreProjectFile";
import { executeAtomQuery } from "@dacre/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";

import {
  getProjectFileQueryAtom,
  resolveProjectFileQueryData,
} from "~/components/files/projectFilesQueryState";
import { appAtomRegistry } from "~/rpc/atomRegistry";

function toDacreProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
  result: ProjectReadFileResult | null,
): DacreProjectFile | null {
  const data = resolveProjectFileQueryData(
    environmentId,
    workspaceRoot,
    DA_PROJECT_FILE_NAME,
    result,
  );
  if (data === null || data.exists === false || data.truncated) return null;
  return parseDacreProjectFile(data.contents);
}

export async function readDacreProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
): Promise<DacreProjectFile | null> {
  const result = await executeAtomQuery(
    appAtomRegistry,
    getProjectFileQueryAtom(environmentId, workspaceRoot, DA_PROJECT_FILE_NAME),
    { reportDefect: false, reportFailure: false },
  );
  return toDacreProjectFile(
    environmentId,
    workspaceRoot,
    result._tag === "Success" ? result.value : null,
  );
}

/** The project's dacre.json from an earlier read, or `undefined` when none has loaded yet. */
export function peekDacreProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
): DacreProjectFile | null | undefined {
  const result = appAtomRegistry.get(
    getProjectFileQueryAtom(environmentId, workspaceRoot, DA_PROJECT_FILE_NAME),
  );
  return AsyncResult.isSuccess(result)
    ? toDacreProjectFile(environmentId, workspaceRoot, result.value)
    : undefined;
}
