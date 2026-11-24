import {
  repositoryFilePath,
  turnChanges,
  type TurnChangesSource,
} from "@dacre/client-runtime/state/thread-repositories";
import type { ProviderInstanceId } from "@dacre/contracts";

import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "../../providerInstances";

const LISTED_FILES_MAX = 20;

/** The side chat's first message: what the turn changed and what to check, without edits. */
export function secondOpinionPrompt(turn: TurnChangesSource): string {
  const { rootFiles, repositories, totals } = turnChanges(turn);
  const paths = [
    ...rootFiles.map((file) => file.path),
    ...repositories.flatMap((repository) =>
      repository.files.map((file) =>
        // A repository on another root, such as another drive, has no path from the thread's folder.
        repository.relativePath === undefined
          ? `${repository.cwd}/${file.path}`
          : repositoryFilePath(repository.relativePath, file.path),
      ),
    ),
  ];
  const listed = paths.slice(0, LISTED_FILES_MAX);
  // A turn's file lists can be prefixes of what it changed; the totals count every file.
  const unlisted = Math.max(totals.count, paths.length) - listed.length;
  return [
    "Review the changes the main thread's latest turn made. Files it changed:",
    "",
    ...listed.map((path) => `- \`${path}\``),
    ...(unlisted > 0 ? [`- and ${unlisted} more`] : []),
    "",
    "Check them for correctness, risks, and missing tests. Do not edit any files.",
  ].join("\n");
}

/** The ready providers, the thread's own last: a second opinion means most from another agent. */
export function secondOpinionProviders(
  entries: ReadonlyArray<ProviderInstanceEntry>,
  threadInstanceId: ProviderInstanceId | undefined,
): ReadonlyArray<ProviderInstanceEntry> {
  const ready = entries.filter(isProviderInstancePickerReady);
  return [
    ...ready.filter((entry) => entry.instanceId !== threadInstanceId),
    ...ready.filter((entry) => entry.instanceId === threadInstanceId),
  ];
}
