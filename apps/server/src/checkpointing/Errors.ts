import { NonNegativeInt, ThreadId, VcsProcessExitError, type VcsError } from "@dacre/contracts";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../persistence/Errors.ts";
import { GIT_INDEX_LOCKED_DETAIL } from "../vcs/VcsProcess.ts";

export const CheckpointDiffOperation = Schema.Literals([
  "CheckpointDiffQuery.getTurnDiff",
  "CheckpointDiffQuery.getFullThreadDiff",
  "CheckpointDiffQuery.revertFiles",
]);
export type CheckpointDiffOperation = typeof CheckpointDiffOperation.Type;

export class CheckpointDiffResultInvalidError extends Schema.TaggedError<CheckpointDiffResultInvalidError>()(
  "CheckpointDiffResultInvalidError",
  {
    operation: CheckpointDiffOperation,
    threadId: ThreadId,
  },
) {
  override get message(): string {
    const result =
      this.operation === "CheckpointDiffQuery.getTurnDiff" ? "turn diff" : "full thread diff";
    return `Checkpoint invariant violation in ${this.operation}: Computed ${result} result does not satisfy contract schema.`;
  }
}

export class CheckpointThreadNotFoundError extends Schema.TaggedError<CheckpointThreadNotFoundError>()(
  "CheckpointThreadNotFoundError",
  {
    operation: CheckpointDiffOperation,
    threadId: ThreadId,
  },
) {
  override get message(): string {
    return `Checkpoint invariant violation in ${this.operation}: Thread '${this.threadId}' not found.`;
  }
}

export class CheckpointWorkspacePathMissingError extends Schema.TaggedError<CheckpointWorkspacePathMissingError>()(
  "CheckpointWorkspacePathMissingError",
  {
    operation: CheckpointDiffOperation,
    threadId: ThreadId,
  },
) {
  override get message(): string {
    const diff =
      this.operation === "CheckpointDiffQuery.getFullThreadDiff" ? "full thread diff" : "turn diff";
    return `Checkpoint invariant violation in ${this.operation}: Workspace path missing for thread '${this.threadId}' when computing ${diff}.`;
  }
}

export class CheckpointTurnRangeUnavailableError extends Schema.TaggedError<CheckpointTurnRangeUnavailableError>()(
  "CheckpointTurnRangeUnavailableError",
  {
    operation: CheckpointDiffOperation,
    threadId: ThreadId,
    requestedTurnCount: NonNegativeInt,
    availableTurnCount: NonNegativeInt,
  },
) {
  override get message(): string {
    return `Checkpoint unavailable for thread ${this.threadId} turn ${this.requestedTurnCount}: Turn diff range exceeds current turn count: requested ${this.requestedTurnCount}, current ${this.availableTurnCount}.`;
  }
}

export class CheckpointRefUnavailableError extends Schema.TaggedError<CheckpointRefUnavailableError>()(
  "CheckpointRefUnavailableError",
  {
    operation: CheckpointDiffOperation,
    threadId: ThreadId,
    turnCount: NonNegativeInt,
    checkpoint: Schema.Literals(["from", "to"]),
  },
) {
  override get message(): string {
    return `Checkpoint unavailable for thread ${this.threadId} turn ${this.turnCount}: Checkpoint ref is unavailable for turn ${this.turnCount}.`;
  }
}

/** Why a file of a turn's diff was not put back; the message is for the user. */
export class CheckpointFileRevertRefusedError extends Schema.TaggedError<CheckpointFileRevertRefusedError>()(
  "CheckpointFileRevertRefusedError",
  {
    threadId: ThreadId,
    reason: Schema.Literals([
      "turn-running",
      "outside-workspace",
      "git-metadata",
      "not-changed",
      "symlink",
      "in-the-way",
    ]),
    path: Schema.optional(Schema.String),
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "turn-running":
        return "A turn is running in this thread. Stop it or let it finish, then revert the file.";
      case "outside-workspace":
        return `"${this.path}" is outside this thread's folder.`;
      case "git-metadata":
        return `"${this.path}" is inside a .git folder, which Dacre does not revert.`;
      case "not-changed":
        return `"${this.path}" did not change in this diff.`;
      case "symlink":
        return `"${this.path}" is inside a symbolic link, so it was not reverted.`;
      case "in-the-way":
        return `Reverting "${this.path}" would remove other files, so it was not reverted.`;
    }
  }
}

const isCheckpointFileRevertRefusedError = Schema.is(CheckpointFileRevertRefusedError);
const isVcsProcessExitError = Schema.is(VcsProcessExitError);

/** A refusal says why; of other failures only a held index lock is worth telling the user. */
export const revertFilesClientMessage = (error: unknown): string =>
  isCheckpointFileRevertRefusedError(error)
    ? error.message
    : isVcsProcessExitError(error) && error.detail === GIT_INDEX_LOCKED_DETAIL
      ? GIT_INDEX_LOCKED_DETAIL
      : "Dacre could not revert the file. Try again; if it keeps failing, check the server logs.";

export type CheckpointStoreError = VcsError;

export type CheckpointServiceError =
  | CheckpointStoreError
  | ProjectionRepositoryError
  | CheckpointDiffResultInvalidError
  | CheckpointThreadNotFoundError
  | CheckpointWorkspacePathMissingError
  | CheckpointTurnRangeUnavailableError
  | CheckpointRefUnavailableError;
