import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { findErrorTraceId, thrownErrorMessage } from "@dacre/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@dacre/client-runtime/state/runtime";
import type { EnvironmentId } from "@dacre/contracts";
import type { RelayClientEnvironmentRecord } from "@dacre/contracts/relay";
import { ServerIcon } from "lucide-react";
import { msg, T, useGT, useMessages, Var } from "gt-react";
import { useRef, useState } from "react";

import {
  deregisterManagedRelayEnvironmentCommand,
  useManagedRelayEnvironments,
  useManagedTunnelUsage,
} from "../../cloud/managedRelayState";
import { relayFailureReason } from "../../cloud/relayFailureReason";
import { relayEnvironmentDiscovery } from "../../state/relay";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  DacreCHAT_SUBSCRIPTION_URL,
  TunnelUsageMeter,
  tunnelUpgradeCopy,
} from "../cloud/TunnelUsage";
import { Button, InlineButton } from "../ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { toastManager } from "../ui/toast";
import { stackedThreadToast } from "../ui/toastHelpers";
import {
  ClerkUserProfilePage,
  ClerkUserProfileRefreshButton,
  ClerkUserProfileRow,
} from "./ClerkUserProfilePage";
import { m, type MessageResolver } from "../../i18n/messages";
import { useDacreChatLink } from "./useDacreChatLink";

const linkedAtFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function linkedAtLabel(value: string, resolve: MessageResolver): string {
  const linkedAt = new Date(value);
  return Number.isNaN(linkedAt.getTime())
    ? resolve(msg("Link date unavailable"))
    : resolve(msg("Linked {date}", { date: linkedAtFormatter.format(linkedAt) }));
}

function endpointLabel(
  environment: RelayClientEnvironmentRecord,
  resolve: MessageResolver,
): string {
  return environment.endpoint.providerKind === "cloudflare_tunnel"
    ? resolve(msg("Managed tunnel"))
    : resolve(msg("Activity publishing only"));
}

function DacreConnectEnvironmentRow(props: {
  readonly environment: RelayClientEnvironmentRecord;
  readonly confirmationOpen: boolean;
  readonly mutationPending: boolean;
  readonly onConfirmationChange: (open: boolean) => void;
  readonly onDeregister: (environment: RelayClientEnvironmentRecord) => void;
}) {
  const { environment } = props;
  const gt = useGT();
  const m = useMessages();
  return (
    <ClerkUserProfileRow icon={<ServerIcon className="size-4" />}>
      <Collapsible open={props.confirmationOpen} onOpenChange={props.onConfirmationChange}>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-label text-strong-foreground">{environment.label}</h3>
            <p className="mt-1 text-meta text-muted-foreground">
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} />}>
                  {endpointLabel(environment, m)}
                </TooltipTrigger>
                <TooltipPopup>{linkedAtLabel(environment.linkedAt, m)}</TooltipPopup>
              </Tooltip>
            </p>
          </div>
          <CollapsibleTrigger
            render={
              <Button size="sm" variant="destructive-outline" disabled={props.mutationPending}>
                <T>Deregister</T>
              </Button>
            }
          />
        </div>

        <CollapsiblePanel>
          <div className="pt-3">
            <div
              className="rounded-card surface-panel px-5 py-4"
              role="group"
              aria-label={gt("Confirm deregistration of {environment}", {
                environment: environment.label,
              })}
            >
              <h4 className="text-label text-strong-foreground">
                <T>Deregister server</T>
              </h4>
              <p className="mt-1 text-meta text-muted-foreground">
                <T>
                  “<Var>{environment.label}</Var>” will be removed from this account.
                </T>
              </p>
              <p className="mt-4 max-w-xl text-meta text-muted-foreground">
                <T>
                  Dacre Connect access will be revoked, any managed tunnel will be removed, and a
                  host space will become available. Local connections on your devices are not
                  changed.
                </T>
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={props.mutationPending}
                  onClick={() => props.onConfirmationChange(false)}
                >
                  <T>Cancel</T>
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={props.mutationPending}
                  onClick={() => props.onDeregister(environment)}
                >
                  {props.mutationPending ? gt("Deregistering…") : gt("Deregister")}
                </Button>
              </div>
            </div>
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </ClerkUserProfileRow>
  );
}

function DacreConnectTunnelUsage() {
  const usage = useManagedTunnelUsage();
  const dacreChat = useDacreChatLink();
  const gt = useGT();
  const m = useMessages();
  if (usage.used === null || usage.limit === null) return null;
  return (
    <div className="border-t py-4">
      <TunnelUsageMeter used={usage.used} limit={usage.limit} />
      {usage.upgrade ? (
        <p className="mt-2 text-meta leading-4.5 text-muted-foreground">
          {usage.upgrade === "link" && dacreChat.linkUrl ? (
            <T>
              Confirm on{" "}
              <InlineButton
                render={<a href={dacreChat.linkUrl} target="_blank" rel="noopener noreferrer" />}
              >
                chat.dacre.invalid
              </InlineButton>
              , then select Refresh.
            </T>
          ) : (
            <>
              {tunnelUpgradeCopy(usage.upgrade, m)}{" "}
              {usage.upgrade === "link" ? (
                <InlineButton
                  disabled={dacreChat.pending !== null}
                  onClick={() => void dacreChat.link()}
                >
                  {dacreChat.pending === "link" ? gt("Opening…") : gt("Link Dacre Chat")}
                </InlineButton>
              ) : (
                <InlineButton
                  render={
                    <a
                      href={DacreCHAT_SUBSCRIPTION_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <T>Upgrade on Dacre Chat</T>
                </InlineButton>
              )}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

export function DacreConnectUserProfilePage() {
  const environmentsState = useManagedRelayEnvironments();
  const gt = useGT();
  const deregisterEnvironment = useAtomCommand(deregisterManagedRelayEnvironmentCommand, {
    reportFailure: false,
  });
  const refreshRelayEnvironments = useAtomCommand(relayEnvironmentDiscovery.refreshAfterMutation, {
    reportFailure: false,
  });
  const [deregisteringEnvironmentId, setDeregisteringEnvironmentId] =
    useState<EnvironmentId | null>(null);
  const [confirmingEnvironmentId, setConfirmingEnvironmentId] = useState<EnvironmentId | null>(
    null,
  );
  const mutationPendingRef = useRef(false);
  const [removedEnvironments, setRemovedEnvironments] = useState<{
    readonly accountId: string | null;
    readonly linkedAtById: ReadonlyMap<EnvironmentId, string>;
  }>({ accountId: null, linkedAtById: new Map() });

  const handleDeregister = async (environment: RelayClientEnvironmentRecord) => {
    const accountId = environmentsState.accountId;
    if (!accountId || mutationPendingRef.current) return;

    mutationPendingRef.current = true;
    setDeregisteringEnvironmentId(environment.environmentId);
    const result = await deregisterEnvironment({
      accountId,
      environmentId: environment.environmentId,
    });
    mutationPendingRef.current = false;
    setDeregisteringEnvironmentId(null);
    setConfirmingEnvironmentId(null);

    if (result._tag === "Success") {
      setRemovedEnvironments((current) => {
        const linkedAtById = new Map(current.accountId === accountId ? current.linkedAtById : []);
        linkedAtById.set(environment.environmentId, environment.linkedAt);
        return { accountId, linkedAtById };
      });
      environmentsState.refresh();
      void refreshRelayEnvironments();
      toastManager.add({
        type: "success",
        title: gt("Server deregistered"),
        description: gt("Dacre Connect access was revoked and a host space is now available."),
      });
      return;
    }
    if (isAtomCommandInterrupted(result)) return;

    // The relay may have removed it before failing.
    environmentsState.refresh();
    const cause = squashAtomCommandFailure(result);
    const message = thrownErrorMessage(cause, m) ?? gt("Could not deregister the server.");
    const traceId = findErrorTraceId(cause);
    console.error("[dacre-connect] Could not deregister environment", {
      environmentId: environment.environmentId,
      message,
      traceId,
      cause,
    });
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: gt("Could not deregister server"),
        description: relayFailureReason(cause) ?? message,
        ...(traceId
          ? {
              actionProps: {
                children: gt("Copy trace ID"),
                onClick: () => void navigator.clipboard?.writeText(traceId),
              },
              actionVariant: "secondary",
            }
          : {}),
        data: { hideCopyButton: true },
      }),
    );
  };

  const removedEnvironmentLinkedAt =
    removedEnvironments.accountId === environmentsState.accountId
      ? removedEnvironments.linkedAtById
      : new Map<EnvironmentId, string>();
  const environments = (environmentsState.data ?? []).filter(
    (environment) =>
      removedEnvironmentLinkedAt.get(environment.environmentId) !== environment.linkedAt,
  );
  const usage = useManagedTunnelUsage();
  const refreshAll = usage.refresh;
  const isInitialLoad =
    !environmentsState.accountId || (environmentsState.data === null && !environmentsState.error);

  return (
    <ClerkUserProfilePage
      title="Dacre Connect"
      description={gt(
        "Environments registered to your account. Connections on this device are managed in Settings.",
      )}
      action={
        <ClerkUserProfileRefreshButton
          disabled={deregisteringEnvironmentId !== null}
          isPending={environmentsState.isPending}
          onClick={refreshAll}
        />
      }
    >
      <div>
        <DacreConnectTunnelUsage />
        {environmentsState.error ? (
          <div className="mb-4 border-t border-destructive/35 py-3" role="alert">
            <p className="text-label text-destructive-foreground">
              <T>Could not load Dacre Connect environments</T>
            </p>
            <p className="mt-1 text-meta text-muted-foreground">{environmentsState.error}</p>
          </div>
        ) : null}

        {isInitialLoad ? (
          <p className="border-t py-4 text-meta text-muted-foreground" role="status">
            <T>Loading environments…</T>
          </p>
        ) : environments.length > 0 ? (
          <ul className="border-t">
            {environments.map((environment) => (
              <DacreConnectEnvironmentRow
                key={environment.environmentId}
                environment={environment}
                confirmationOpen={confirmingEnvironmentId === environment.environmentId}
                mutationPending={deregisteringEnvironmentId !== null}
                onConfirmationChange={(open) =>
                  setConfirmingEnvironmentId(open ? environment.environmentId : null)
                }
                onDeregister={(selected) => void handleDeregister(selected)}
              />
            ))}
          </ul>
        ) : environmentsState.error ? null : (
          <div className="border-t">
            <Empty size="compact">
              <EmptyMedia variant="icon">
                <ServerIcon />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>
                  <T>No Dacre Connect environments</T>
                </EmptyTitle>
                <EmptyDescription>
                  <T>
                    Link an environment from its local Settings to make it available through Dacre
                    Connect.
                  </T>
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>
    </ClerkUserProfilePage>
  );
}
