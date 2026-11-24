import { useAtomValue } from "@effect/atom-react";
import {
  createManagedRelayQueryManager,
  createManagedRelayDacreChatLinkRequest,
  deregisterManagedRelayEnvironment,
  ManagedRelay,
  managedRelaySessionAtom,
  readManagedRelaySnapshotState,
  unlinkManagedRelayDacreChat,
} from "@dacre/client-runtime/relay";
import {
  createAtomCommandScheduler,
  createRuntimeCommand,
} from "@dacre/client-runtime/state/runtime";
import {
  DEFAULT_MANAGED_TUNNEL_LIMIT,
  DacreCHAT_PLAN_TUNNEL_LIMITS,
  type RelayClientEnvironmentRecord,
  type RelayDacreChatLinkResponse,
} from "@dacre/contracts/relay";
import type { EnvironmentId } from "@dacre/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AsyncResult, Atom } from "effect/reactivity";

import { runtime } from "../lib/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";

const managedRelayAtomRuntime = Atom.runtime(
  Layer.effect(
    ManagedRelay.ManagedRelayClient,
    runtime.contextEffect.pipe(
      Effect.map((context) => Context.get(context, ManagedRelay.ManagedRelayClient)),
    ),
  ),
);

const managedRelayQueryManager = createManagedRelayQueryManager(managedRelayAtomRuntime);

const managedRelayMutationScheduler = createAtomCommandScheduler();

export const deregisterManagedRelayEnvironmentCommand = createRuntimeCommand(
  managedRelayAtomRuntime,
  {
    label: "web:managed-relay:deregister-environment",
    scheduler: managedRelayMutationScheduler,
    concurrency: {
      mode: "serial",
      key: (input: { readonly accountId: string; readonly environmentId: EnvironmentId }) =>
        input.accountId,
    },
    execute: (input, registry) => deregisterManagedRelayEnvironment(registry, input),
  },
);

const accountSerial = {
  mode: "serial",
  key: (input: { readonly accountId: string }) => input.accountId,
} as const;

export const createManagedRelayDacreChatLinkRequestCommand = createRuntimeCommand(
  managedRelayAtomRuntime,
  {
    label: "web:managed-relay:create-dacrechat-link-request",
    scheduler: managedRelayMutationScheduler,
    concurrency: accountSerial,
    execute: (input: { readonly accountId: string }, registry) =>
      createManagedRelayDacreChatLinkRequest(registry, input),
  },
);

export const unlinkManagedRelayDacreChatCommand = createRuntimeCommand(managedRelayAtomRuntime, {
  label: "web:managed-relay:unlink-dacrechat",
  scheduler: managedRelayMutationScheduler,
  concurrency: accountSerial,
  execute: (input: { readonly accountId: string }, registry) =>
    unlinkManagedRelayDacreChat(registry, input),
});

const EMPTY_DacreCHAT_LINK_ATOM = Atom.make(
  AsyncResult.success<RelayDacreChatLinkResponse>({ available: false, link: null }),
).pipe(Atom.keepAlive, Atom.withLabel("managed-relay:web:dacrechat-link:null"));

export function useManagedRelayDacreChatLink() {
  const session = useAtomValue(managedRelaySessionAtom);
  const accountId = session?.accountId ?? null;
  const atom = accountId
    ? managedRelayQueryManager.dacreChatLinkAtom(accountId)
    : EMPTY_DacreCHAT_LINK_ATOM;
  const snapshot = readManagedRelaySnapshotState(useAtomValue(atom));
  const refresh = () => {
    if (accountId) {
      managedRelayQueryManager.refreshDacreChatLink(appAtomRegistry, accountId);
    }
  };

  return { ...snapshot, accountId, refresh };
}

const EMPTY_ENVIRONMENTS_ATOM = Atom.make(
  AsyncResult.success<ReadonlyArray<RelayClientEnvironmentRecord>>([]),
).pipe(Atom.keepAlive, Atom.withLabel("managed-relay:web:environments:null"));

export function useManagedRelayEnvironments() {
  const session = useAtomValue(managedRelaySessionAtom);
  const accountId = session?.accountId ?? null;
  const atom = accountId
    ? managedRelayQueryManager.environmentsAtom(accountId)
    : EMPTY_ENVIRONMENTS_ATOM;
  const result = useAtomValue(atom);
  const snapshot = readManagedRelaySnapshotState(result);
  const refresh = () => {
    if (accountId) {
      managedRelayQueryManager.refreshEnvironments(appAtomRegistry, accountId);
    }
  };

  return {
    ...snapshot,
    accountId,
    refresh,
  };
}

/** How this account can raise its tunnel cap: link Dacre Chat, or upgrade the linked plan. */
export type ManagedTunnelUpgrade = "link" | "pro" | "premier" | null;

// Mirrors the relay's cap: a manual override is exact, otherwise the Dacre Chat plan raises the default.
function managedTunnelCap(dacreChat: RelayDacreChatLinkResponse): {
  readonly limit: number;
  readonly upgrade: ManagedTunnelUpgrade;
} {
  if (dacreChat.maxTunnelsOverride !== undefined) {
    return { limit: dacreChat.maxTunnelsOverride, upgrade: null };
  }
  if (!dacreChat.available) return { limit: DEFAULT_MANAGED_TUNNEL_LIMIT, upgrade: null };
  switch (dacreChat.link?.plan) {
    case "premier":
      return { limit: DacreCHAT_PLAN_TUNNEL_LIMITS.premier, upgrade: null };
    case "pro":
      return { limit: DacreCHAT_PLAN_TUNNEL_LIMITS.pro, upgrade: "premier" };
    case "free":
      return { limit: DEFAULT_MANAGED_TUNNEL_LIMIT, upgrade: "pro" };
    case undefined:
      return { limit: DEFAULT_MANAGED_TUNNEL_LIMIT, upgrade: "link" };
  }
}

/** Refetches the account's environments and Dacre Chat plan after a tunnel changes. */
export function refreshManagedTunnelUsage() {
  const accountId = appAtomRegistry.get(managedRelaySessionAtom)?.accountId;
  if (!accountId) return;
  managedRelayQueryManager.refreshEnvironments(appAtomRegistry, accountId);
  managedRelayQueryManager.refreshDacreChatLink(appAtomRegistry, accountId);
}

/** Managed tunnels on this account and its cap. Null fields are still loading or failed. */
export function useManagedTunnelUsage() {
  const environments = useManagedRelayEnvironments();
  const dacreChat = useManagedRelayDacreChatLink();
  const used =
    environments.accountId === null
      ? null
      : (environments.data?.filter(
          (environment) => environment.endpoint.providerKind === "cloudflare_tunnel",
        ).length ?? null);
  const cap =
    dacreChat.accountId !== null && dacreChat.data ? managedTunnelCap(dacreChat.data) : null;
  return {
    used,
    limit: cap?.limit ?? null,
    upgrade: cap?.upgrade ?? null,
    refresh: refreshManagedTunnelUsage,
  };
}
