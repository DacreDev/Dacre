import { expect, it } from "@effect/vitest";
import { ServerNpmReleaseError } from "@dacre/contracts";
import { CLI_RELEASES_UNAVAILABLE } from "@dacre/shared/cliRelease";
import * as Effect from "effect/Effect";

import * as NpmRelease from "./npmRelease.ts";

it.effect("refuses without running npm or contacting the registry", () =>
  Effect.gen(function* () {
    const service = yield* NpmRelease.NpmRelease;
    const error = yield* service.get({ spec: "latest" }).pipe(Effect.flip);
    expect(error).toBeInstanceOf(ServerNpmReleaseError);
    expect(error.reason).toBe(CLI_RELEASES_UNAVAILABLE);
  }).pipe(Effect.provide(NpmRelease.layer)),
);
