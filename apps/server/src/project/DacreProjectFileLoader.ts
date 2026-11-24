import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { DA_PROJECT_FILE_NAME, type DacreProjectFile } from "@dacre/contracts";
import { DacreProjectFileFromJson } from "@dacre/shared/dacreProjectFile";

const decodeDacreProjectFileJson = Schema.decodeEffect(DacreProjectFileFromJson);

export class DacreProjectFileLoadError extends Schema.TaggedError<DacreProjectFileLoadError>()(
  "DacreProjectFileLoadError",
  {
    operation: Schema.Literals(["read", "decode"]),
    workspaceRoot: Schema.String,
    filePath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} ${DA_PROJECT_FILE_NAME} at ${this.filePath}.`;
  }
}

export class DacreProjectFileLoader extends Context.Service<
  DacreProjectFileLoader,
  {
    /** Never fails; missing/unreadable/invalid files return none, with warnings for invalid files. */
    readonly load: (workspaceRoot: string) => Effect.Effect<Option.Option<DacreProjectFile>>;
  }
>()("dacre/project/DacreProjectFileLoader") {}

const logDacreProjectFileLoadError = (error: DacreProjectFileLoadError) =>
  Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      operation: error.operation,
      workspaceRoot: error.workspaceRoot,
      filePath: error.filePath,
      errorTag: error._tag,
    }),
  );

/** @public */
export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const load: DacreProjectFileLoader["Service"]["load"] = Effect.fn("DacreProjectFileLoader.load")(
    function* (workspaceRoot) {
      const filePath = path.join(workspaceRoot, DA_PROJECT_FILE_NAME);
      const raw = yield* fileSystem.readFileString(filePath).pipe(
        Effect.asSome,
        Effect.catchTags({
          PlatformError: (error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed(Option.none<string>())
              : logDacreProjectFileLoadError(
                  new DacreProjectFileLoadError({
                    operation: "read",
                    workspaceRoot,
                    filePath,
                    cause: error,
                  }),
                ).pipe(Effect.as(Option.none<string>())),
        }),
      );
      if (Option.isNone(raw)) {
        return Option.none<DacreProjectFile>();
      }
      return yield* decodeDacreProjectFileJson(raw.value).pipe(
        Effect.asSome,
        Effect.catchTags({
          SchemaError: (error) =>
            logDacreProjectFileLoadError(
              new DacreProjectFileLoadError({
                operation: "decode",
                workspaceRoot,
                filePath,
                cause: error,
              }),
            ).pipe(Effect.as(Option.none<DacreProjectFile>())),
        }),
      );
    },
  );

  return DacreProjectFileLoader.of({ load });
});

export const layer = Layer.effect(DacreProjectFileLoader, make);
