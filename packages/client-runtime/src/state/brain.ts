import { WS_METHODS } from "@dacre/contracts";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import type * as Persistence from "../platform/persistence.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

/** The server re-sends the list after every write, so commands refresh nothing themselves. */
export function createBrainEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Persistence.EnvironmentCacheStore | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  // Writes to one environment run in order, so a toggle cannot overtake the save before it.
  const concurrency = {
    mode: "serial" as const,
    key: ({ environmentId }: { readonly environmentId: string }) => environmentId,
  };
  return {
    // One subscription per search, closed as soon as the page moves on, since each re-reads on every change.
    live: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:brain:live",
      tag: WS_METHODS.brainSubscribe,
      idleTtlMs: 0,
    }),
    save: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:brain:save",
      tag: WS_METHODS.brainSave,
      scheduler,
      concurrency,
    }),
    setEnabled: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:brain:set-enabled",
      tag: WS_METHODS.brainSetEnabled,
      scheduler,
      concurrency,
    }),
    setPinned: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:brain:set-pinned",
      tag: WS_METHODS.brainSetPinned,
      scheduler,
      concurrency,
    }),
    remove: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:brain:remove",
      tag: WS_METHODS.brainRemove,
      scheduler,
      concurrency,
    }),
  };
}
