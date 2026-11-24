# Dacre Connect setup

Deployment and client configuration for Dacre Connect. See [Dacre Connect](../internals/06_dacre-connect.md) for trust boundaries and [infra/relay/README.md](../../infra/relay/README.md#deployment) for relay provisioning.

## Public application configuration

Dacre Connect is disabled in a fresh clone. Copy `.env.example` to `.env` for production, or set these public identifiers in `.env` / `.env.local` (process env > `.env.local` > `.env`):

```dotenv
DACRE_CLERK_PUBLISHABLE_KEY=<publishable key>
DACRE_CLERK_JWT_TEMPLATE=<JWT template name>
DACRE_CLERK_CLI_OAUTH_CLIENT_ID=<public OAuth application client ID>
DACRE_RELAY_URL=https://relay.example.com
```

`CLERK_SECRET_KEY` belongs only in relay secrets, never in client config. Client and bundled-server builds embed these values at build time.

## Clerk setup

### CLI OAuth application

Create a public OAuth application in Clerk (authorization code + PKCE):

1. Redirect URI: `http://127.0.0.1:34338/callback`
2. Scopes: `openid`, `profile`, `email`, `offline_access`
3. Enable **Device authorization grant** (required for headless/SSH login; Clerk enables it per account on request).
4. Set `DACRE_CLERK_CLI_OAUTH_CLIENT_ID` to its public client ID.

### JWT template

Create a Clerk JWT template named `dacre-relay` with `{ "aud": "dacre-relay" }`. Set `DACRE_CLERK_JWT_TEMPLATE=dacre-relay` on clients and `CLERK_JWT_AUDIENCE=dacre-relay` on the relay.

### Desktop OAuth redirects

Enable Clerk's Native API, add `dacre-dev://app/` and `dacre://app/` to the SSO redirect allowlist, and add `dacre-dev://app` and `dacre://app` to `allowed_origins` via `PATCH https://api.clerk.com/v1/instance` (preserving existing entries).

### Restricting sign-ups

Use Clerk's allowlist or Restricted mode for new sign-ups (an enabled empty allowlist blocks all sign-ups). Ban the account in Clerk to revoke existing sessions.

## Desktop passkeys

For a signed macOS build (`dev.dacre.app`):

1. Create an explicit macOS App ID with **Associated Domains** and a matching distribution provisioning profile.
2. In Clerk Native API settings, add an iOS app with the same Apple Team ID and bundle ID, and verify `https://<frontend-api>/.well-known/apple-app-site-association` includes `<TEAM_ID>.dev.dacre.app`.
3. Configure Apple signing and notarization. Local signed builds use `DACRE_APPLE_TEAM_ID`, `DACRE_MACOS_PROVISIONING_PROFILE`, and optionally `DACRE_CLERK_PASSKEY_RP_DOMAINS`. Bump the build version after changing Associated Domains so macOS refreshes cached Shared Web Credentials.

Unsigned `dev:desktop` cannot exercise passkeys. For renderer HMR with passkeys, launch an installed signed build against `vp run dev:web`:

```sh
VITE_DEV_SERVER_URL=http://127.0.0.1:5733 DACRE_PORT=13773 \
  "/Applications/Dacre (Alpha).app/Contents/MacOS/Dacre (Alpha)"
```
