import { DacreCHAT_PLAN_TUNNEL_LIMITS, type RelayDacreChatLink } from "@dacre/contracts/relay";
import { MessageSquareIcon } from "lucide-react";
import { T, useGT, Var } from "gt-react";
import type { ReactNode } from "react";

import { useManagedTunnelUsage } from "../../cloud/managedRelayState";
import { DacreCHAT_SUBSCRIPTION_URL, TunnelUsageMeter } from "../cloud/TunnelUsage";
import { Button, InlineButton } from "../ui/button";
import {
  ClerkUserProfilePage,
  ClerkUserProfileRefreshButton,
  ClerkUserProfileRow,
} from "./ClerkUserProfilePage";
import { useDacreChatLink } from "./useDacreChatLink";

function planLabel(link: RelayDacreChatLink): ReactNode {
  switch (link.plan) {
    case "premier":
      return (
        <>
          <span className="block">
            <T context="Dacre Chat plan name">Premier</T>
          </span>
          <span className="block">
            <T>
              Up to <Var>{DacreCHAT_PLAN_TUNNEL_LIMITS.premier}</Var> tunnels
            </T>
          </span>
        </>
      );
    case "pro":
      return (
        <>
          <span className="block">
            <T context="Dacre Chat plan name">Pro</T>
          </span>
          <span className="block">
            <T>
              Up to <Var>{DacreCHAT_PLAN_TUNNEL_LIMITS.pro}</Var> tunnels.{" "}
              <InlineButton
                render={
                  <a href={DacreCHAT_SUBSCRIPTION_URL} target="_blank" rel="noopener noreferrer" />
                }
              >
                Upgrade on Dacre Chat
              </InlineButton>{" "}
              to Premier for <Var>{DacreCHAT_PLAN_TUNNEL_LIMITS.premier}</Var>.
            </T>
          </span>
        </>
      );
    case "free":
      return (
        <T>
          <InlineButton
            render={
              <a href={DacreCHAT_SUBSCRIPTION_URL} target="_blank" rel="noopener noreferrer" />
            }
          >
            Upgrade on Dacre Chat
          </InlineButton>{" "}
          for more tunnels
        </T>
      );
  }
}

/** Links a Dacre Chat account so paid subscribers get more tunnels. */
export function DacreChatUserProfilePage() {
  const {
    linkState,
    pending,
    linkUrl,
    link: handleLink,
    unlink: handleUnlink,
  } = useDacreChatLink();
  const usage = useManagedTunnelUsage();
  const gt = useGT();

  const data = linkState.data;
  const link = data?.link ?? null;

  return (
    <ClerkUserProfilePage
      title="Dacre Chat"
      description={gt(
        "Link a paid Dacre Chat account for more Dacre Connect tunnels: up to {pro} with Pro, {premier} with Premier.",
        { pro: DacreCHAT_PLAN_TUNNEL_LIMITS.pro, premier: DacreCHAT_PLAN_TUNNEL_LIMITS.premier },
      )}
      action={
        <ClerkUserProfileRefreshButton
          disabled={pending !== null}
          isPending={linkState.isPending}
          onClick={usage.refresh}
        />
      }
    >
      {linkState.error ? (
        <div className="border-t py-3 text-meta" role="alert">
          <p className="text-label text-destructive-foreground">
            <T>Could not load Dacre Chat link</T>
          </p>
          <p className="mt-0.5 text-muted-foreground">{linkState.error}</p>
        </div>
      ) : data === null ? null : !data.available ? (
        <p className="border-t py-4 text-meta text-muted-foreground">
          <T>This Dacre Connect server does not support Dacre Chat linking.</T>
        </p>
      ) : (
        <ul className="border-t">
          <ClerkUserProfileRow icon={<MessageSquareIcon className="size-4" />}>
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-label leading-4.5 text-foreground">
                  {link ? link.email : gt("Not linked")}
                </h3>
                <p className="mt-1 text-meta leading-4.5 text-muted-foreground">
                  {link ? (
                    planLabel(link)
                  ) : linkUrl ? (
                    <T>
                      Confirm on{" "}
                      <InlineButton
                        render={<a href={linkUrl} target="_blank" rel="noopener noreferrer" />}
                      >
                        chat.dacre.invalid
                      </InlineButton>
                      , then select Refresh.
                    </T>
                  ) : (
                    gt("You confirm the link on chat.dacre.invalid.")
                  )}
                </p>
              </div>
              {link ? (
                <Button
                  size="sm"
                  variant="destructive-outline"
                  disabled={pending !== null}
                  onClick={() => void handleUnlink()}
                >
                  {pending === "unlink" ? gt("Unlinking…") : gt("Unlink")}
                </Button>
              ) : (
                <Button size="sm" disabled={pending !== null} onClick={() => void handleLink()}>
                  {pending === "link" ? gt("Opening…") : gt("Link Dacre Chat")}
                </Button>
              )}
            </div>
          </ClerkUserProfileRow>
          {usage.used !== null && usage.limit !== null ? (
            <li className="border-t py-4">
              <TunnelUsageMeter used={usage.used} limit={usage.limit} />
            </li>
          ) : null}
        </ul>
      )}
    </ClerkUserProfilePage>
  );
}
