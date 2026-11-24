import { useAuth, useClerk } from "@clerk/react";
import { MessageSquareIcon, ServerIcon } from "lucide-react";
import { useMessages } from "gt-react";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";

import { DacreChatUserProfilePage } from "./DacreChatUserProfilePage";
import { DacreConnectUserProfilePage } from "./DacreConnectUserProfilePage";

export const DA_CONNECT_ACCOUNT_PAGES = [
  {
    label: "Dacre Connect",
    url: "dacre-connect",
    icon: <ServerIcon className="size-4" />,
    content: <DacreConnectUserProfilePage />,
  },
  {
    label: "Dacre Chat",
    url: "rose",
    icon: <MessageSquareIcon className="size-4" />,
    content: <DacreChatUserProfilePage />,
  },
] as const;

export type DacreConnectAccountPageUrl = (typeof DA_CONNECT_ACCOUNT_PAGES)[number]["url"];

type PortalTargets = Readonly<Record<string, HTMLDivElement | undefined>>;

/** Keep portals rendered while the modal can open; Clerk owns the custom-page DOM nodes. */
export function useDacreConnectAccountPage(): {
  readonly open: ((page?: DacreConnectAccountPageUrl) => void) | null;
  readonly portals: ReactNode;
} {
  const clerk = useClerk();
  const { isSignedIn } = useAuth();
  const m = useMessages();
  const [targets, setTargets] = useState<PortalTargets>({});

  const open = (page: DacreConnectAccountPageUrl = "dacre-connect") => {
    const setTarget = (key: string, element: HTMLDivElement | undefined) =>
      setTargets((current) => ({ ...current, [key]: element }));
    clerk.openUserProfile({
      __experimental_startPath: `/${page}`,
      customPages: DA_CONNECT_ACCOUNT_PAGES.map((page) => ({
        label: m(page.label),
        url: page.url,
        mount: (element: HTMLDivElement) => setTarget(`content:${page.url}`, element),
        unmount: () => setTarget(`content:${page.url}`, undefined),
        mountIcon: (element: HTMLDivElement) => setTarget(`icon:${page.url}`, element),
        unmountIcon: () => setTarget(`icon:${page.url}`, undefined),
      })),
    });
  };

  const portals = DA_CONNECT_ACCOUNT_PAGES.flatMap((page) => {
    const content = targets[`content:${page.url}`];
    const icon = targets[`icon:${page.url}`];
    return [
      content ? createPortal(page.content, content, `content:${page.url}`) : null,
      icon ? createPortal(page.icon, icon, `icon:${page.url}`) : null,
    ];
  });

  return { open: isSignedIn ? open : null, portals };
}
