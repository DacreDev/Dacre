import { createClerkClient } from "@clerk/backend";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Base64Url from "effect/encoding/Base64Url";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { RelayDacreChatLink } from "@dacre/contracts/relay";

import * as RelayConfiguration from "../Config.ts";

const LINK_TOKEN_TTL_SECONDS = 10 * 60;
const DacreCHAT_REQUEST_TIMEOUT = "5 seconds";

const decodeLinkResponse = Schema.decodeUnknownEffect(
  Schema.Struct({ link: Schema.NullOr(RelayDacreChatLink) }),
);

export class DacreChatNotConfigured extends Schema.TaggedError<DacreChatNotConfigured>()(
  "DacreChatNotConfigured",
  {},
) {
  override get message(): string {
    return "Dacre Chat linking is not configured on this relay";
  }
}

export class ClerkUserLookupFailed extends Schema.TaggedError<ClerkUserLookupFailed>()(
  "ClerkUserLookupFailed",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not read the Clerk user's primary email";
  }
}

export class DacreChatRequestFailed extends Schema.TaggedError<DacreChatRequestFailed>()(
  "DacreChatRequestFailed",
  {
    operation: Schema.Literals(["get-link", "unlink"]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Dacre Chat '${this.operation}' request failed`;
  }
}

/**
 * Bridge to Dacre Chat. Dacre Chat owns the account link; the relay
 * signs link requests and asks Dacre Chat for the linked account's plan.
 */
export class DacreChatAccounts extends Context.Service<
  DacreChatAccounts,
  {
    readonly available: boolean;
    readonly createLinkUrl: (input: {
      readonly userId: string;
    }) => Effect.Effect<string, DacreChatNotConfigured | ClerkUserLookupFailed>;
    readonly getLink: (input: {
      readonly userId: string;
    }) => Effect.Effect<RelayDacreChatLink | null, DacreChatNotConfigured | DacreChatRequestFailed>;
    readonly unlink: (input: {
      readonly userId: string;
    }) => Effect.Effect<void, DacreChatNotConfigured | DacreChatRequestFailed>;
  }
>()("dacre-relay/dacrechat/DacreChatAccounts") {}

/** Token format shared with Dacre Chat: `<base64url JSON payload>.<base64url HMAC-SHA256>`. */
export const signLinkToken = (
  secret: string,
  payload: { readonly sub: string; readonly email: string; readonly exp: number },
) => {
  const encoded = Base64Url.encode(JSON.stringify({ v: 1, ...payload }));
  const signature = hmac(
    sha256,
    new TextEncoder().encode(secret),
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${Base64Url.encode(signature)}`;
};

export const make = Effect.gen(function* () {
  const config = yield* RelayConfiguration.RelayConfiguration;
  const client = yield* HttpClient.HttpClient;
  const settings = config.dacreChat;

  const requireSettings = settings
    ? Effect.succeed(settings)
    : Effect.fail(new DacreChatNotConfigured());

  // The timeout covers the body read so a stalled response still fails fast.
  const post = Effect.fn("relay.dacrechat.post")(function* (
    operation: DacreChatRequestFailed["operation"],
    path: string,
    userId: string,
  ) {
    const { baseUrl, linkSecret } = yield* requireSettings;
    return yield* HttpClientRequest.post(new URL(path, baseUrl).toString()).pipe(
      HttpClientRequest.bearerToken(Redacted.value(linkSecret)),
      HttpClientRequest.bodyJsonUnsafe({ clerkUserId: userId }),
      client.execute,
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((response) => response.json),
      Effect.timeout(DacreCHAT_REQUEST_TIMEOUT),
      Effect.mapError((cause) => new DacreChatRequestFailed({ operation, cause })),
    );
  });

  const lookupClerkPrimaryEmail = Effect.fn("relay.dacrechat.lookup_clerk_primary_email")(
    function* (userId: string) {
      return yield* Effect.tryPromise({
        try: async () => {
          const user = await createClerkClient({
            secretKey: Redacted.value(config.clerkSecretKey),
            publishableKey: config.clerkPublishableKey,
          }).users.getUser(userId);
          const email = user.primaryEmailAddress?.emailAddress;
          if (!email) throw new Error("Clerk user has no primary email address.");
          return email;
        },
        catch: (cause) => new ClerkUserLookupFailed({ cause }),
      }).pipe(
        Effect.timeoutOrElse({
          duration: DacreCHAT_REQUEST_TIMEOUT,
          orElse: () => Effect.fail(new ClerkUserLookupFailed({ cause: "timed out" })),
        }),
      );
    },
  );

  return DacreChatAccounts.of({
    available: settings !== undefined,
    createLinkUrl: Effect.fn("relay.dacrechat.create_link_url")(function* (input) {
      const { baseUrl, linkSecret } = yield* requireSettings;
      const email = yield* lookupClerkPrimaryEmail(input.userId);
      const now = yield* DateTime.now;
      const token = signLinkToken(Redacted.value(linkSecret), {
        sub: input.userId,
        email,
        exp: Math.floor(now.epochMilliseconds / 1_000) + LINK_TOKEN_TTL_SECONDS,
      });
      const url = new URL("/link/dacre", baseUrl);
      url.searchParams.set("token", token);
      return url.toString();
    }),
    getLink: Effect.fn("relay.dacrechat.get_link")(function* (input) {
      const body = yield* post("get-link", "/api/dacre/link", input.userId);
      const decoded = yield* decodeLinkResponse(body).pipe(
        Effect.mapError((cause) => new DacreChatRequestFailed({ operation: "get-link", cause })),
      );
      return decoded.link;
    }),
    unlink: Effect.fn("relay.dacrechat.unlink")(function* (input) {
      yield* post("unlink", "/api/dacre/unlink", input.userId);
    }),
  });
});

export const layer = Layer.effect(DacreChatAccounts, make);
