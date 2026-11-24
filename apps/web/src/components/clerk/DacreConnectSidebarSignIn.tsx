import { UserButton, useAuth } from "@clerk/react";
import { T, useMessages } from "gt-react";
import { LogInIcon, RotateCwIcon } from "lucide-react";

import { hasCloudPublicConfig } from "../../cloud/publicConfig";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { retryClerkLoad, useClerkLoadFailed } from "./clerkLoadFailure";
import { DA_CONNECT_ACCOUNT_PAGES } from "./DacreConnectAccountPages";
import { useDacreConnectAuthPrompt } from "./useDacreConnectAuthPrompt";

export function DacreConnectSidebarSignIn() {
  if (!hasCloudPublicConfig()) return null;

  return <ConfiguredDacreConnectSidebarSignIn />;
}

export function DacreConnectSidebarAvatar() {
  if (!hasCloudPublicConfig()) return null;

  return <ConfiguredDacreConnectSidebarAvatar />;
}

function ConfiguredDacreConnectSidebarAvatar() {
  const { isLoaded, isSignedIn } = useAuth();
  const m = useMessages();

  if (!isLoaded || !isSignedIn) return null;

  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: "size-7",
          // Clerk's unlayered trigger reset (padding, radius, background) beats layered utilities.
          userButtonTrigger: "mb-1! rounded-control! p-1! hover:surface-ghost-hover!",
        },
      }}
    >
      {DA_CONNECT_ACCOUNT_PAGES.map((page) => (
        <UserButton.UserProfilePage
          key={page.url}
          label={m(page.label)}
          labelIcon={page.icon}
          url={page.url}
        >
          {page.content}
        </UserButton.UserProfilePage>
      ))}
    </UserButton>
  );
}

function ConfiguredDacreConnectSidebarSignIn() {
  const { isLoaded, isSignedIn } = useAuth();
  const loadFailed = useClerkLoadFailed();
  const { openAuthPrompt } = useDacreConnectAuthPrompt();

  if (loadFailed) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={retryClerkLoad}>
            <RotateCwIcon />
            <span>
              <T>Retry Dacre Connect</T>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }
  if (!isLoaded || isSignedIn) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={openAuthPrompt}>
          <LogInIcon />
          <span>
            <T>Sign in to Dacre Connect</T>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
