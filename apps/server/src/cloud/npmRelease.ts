import {
  ServerNpmReleaseError,
  type ServerNpmRelease,
  type ServerNpmReleaseInput,
} from "@dacre/contracts";
import { CLI_RELEASES_UNAVAILABLE } from "@dacre/shared/cliRelease";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class NpmRelease extends Context.Service<
  NpmRelease,
  {
    readonly get: (
      input: ServerNpmReleaseInput,
    ) => Effect.Effect<ServerNpmRelease | null, ServerNpmReleaseError>;
  }
>()("dacre/cloud/npmRelease") {}

// A registry lookup would trust whoever owns the package name, and Dacre owns none.
export const layer = Layer.succeed(
  NpmRelease,
  NpmRelease.of({
    get: Effect.fn("NpmRelease.get")(function* () {
      return yield* new ServerNpmReleaseError({ reason: CLI_RELEASES_UNAVAILABLE });
    }),
  }),
);
