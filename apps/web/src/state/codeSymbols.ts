import { createCodeSymbolEnvironmentAtoms } from "@dacre/client-runtime/state/code-symbols";
import type { EnvironmentId, ProjectId } from "@dacre/contracts";
import { msg } from "gt-react";

import { connectionAtomRuntime } from "../connection/runtime";
import { m, type MessageResolver } from "../i18n/messages";
import { useFilesystemReadAccess } from "./filesystem";
import { useDebouncedValue } from "./queries";
import { useEnvironmentQuery } from "./query";

export const codeSymbolEnvironment = createCodeSymbolEnvironmentAtoms(connectionAtomRuntime);

const SYMBOL_SEARCH_DEBOUNCE_MS = 120;
const SYMBOL_SEARCH_LIMIT = 50;
const EMPTY_SYMBOLS: ReadonlyArray<never> = [];

/**
 * A project's definitions matching `query`, and its index's status while this is mounted. The
 * first search builds the index, and the results refresh when a build finishes.
 */
export function useProjectSymbols(
  target: { readonly environmentId: EnvironmentId; readonly projectId: ProjectId },
  query: string,
  resolve: MessageResolver = m,
) {
  const fileAccess = useFilesystemReadAccess(target.environmentId, resolve);
  const { canReadFiles } = fileAccess;
  const trimmed = query.trim().slice(0, 200);
  const debounced = useDebouncedValue(trimmed, SYMBOL_SEARCH_DEBOUNCE_MS);
  const project = { environmentId: target.environmentId, input: { projectId: target.projectId } };
  const status = useEnvironmentQuery(
    canReadFiles ? codeSymbolEnvironment.status(project) : null,
    resolve,
  );
  const search = useEnvironmentQuery(
    canReadFiles && debounced !== ""
      ? codeSymbolEnvironment.search({
          environmentId: target.environmentId,
          input: { projectId: target.projectId, query: debounced, limit: SYMBOL_SEARCH_LIMIT },
        })
      : null,
    resolve,
  );
  return {
    symbols: debounced === "" ? EMPTY_SYMBOLS : (search.data?.symbols ?? EMPTY_SYMBOLS),
    status: status.data ?? search.data?.status ?? null,
    error: fileAccess.isPending
      ? null
      : !canReadFiles
        ? (fileAccess.error ?? resolve(msg("This connection cannot search host files.")))
        : (search.error ?? status.error),
    isPending: trimmed !== debounced || search.isPending,
  };
}
