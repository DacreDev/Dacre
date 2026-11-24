import { WS_METHODS } from "@dacre/contracts";
import { AsyncResult, Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export function createCodeSymbolEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  // Open only while a symbol search is on screen.
  const status = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "environment-data:code-symbols:status",
    tag: WS_METHODS.codeSymbolsStatus,
    idleTtlMs: 0,
  });
  return {
    status,
    search: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:code-symbols:search",
      tag: WS_METHODS.codeSymbolsSearch,
      staleTimeMs: 5_000,
      idleTtlMs: 30_000,
      // A pass that finishes changes what the same query finds.
      refreshTrigger: ({ environmentId, input }) => {
        const live = status({ environmentId, input: { projectId: input.projectId } });
        return Atom.make((get) => AsyncResult.getOrElse(get(live), () => null)?.state);
      },
    }),
    rebuild: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:code-symbols:rebuild",
      tag: WS_METHODS.codeSymbolsRebuild,
    }),
  };
}
