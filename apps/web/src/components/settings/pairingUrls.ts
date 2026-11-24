import { isHostedAppConfigured } from "@dacre/shared/connectAuth";
import { buildHostedPairingUrl, configuredHostedAppUrl } from "../../hostedPairing";
import { setPairingTokenOnUrl } from "@dacre/shared/remote";

export function resolveDesktopPairingUrl(endpointUrl: string, credential: string): string {
  const url = new URL(endpointUrl);
  url.pathname = "/pair";
  return setPairingTokenOnUrl(url, credential).toString();
}

export function resolveHostedPairingUrl(endpointUrl: string, credential: string): string | null {
  const url = new URL(endpointUrl);
  if (url.protocol !== "https:" || !isHostedAppConfigured(configuredHostedAppUrl())) {
    return null;
  }

  return buildHostedPairingUrl({
    host: endpointUrl,
    token: credential,
  });
}
