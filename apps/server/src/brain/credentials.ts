import { JWT, TOKEN_PREFIX } from "../feedback/scrubFeedback.ts";

const PRIVATE_KEY = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/u;
const AWS_KEY_ID = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/u;
// `user:password@` only: `ssh://git@host` names a user and holds no secret.
const URL_PASSWORD = /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s/:@]+:(?![$<{*])[^\s/@]+@/iu;

const ASSIGNED = String.raw`["']?\s*(?:=(?!=)|:\s*(?=["']))\s*["']?`;
// A value that points elsewhere holds no secret: `$VAR`, `<placeholder>`, `settings.key`, `read()`.
const NOT_A_REFERENCE = String.raw`(?![$<{*]|\.{3}|x{3}|\w+[.(\[])`;
const PASSWORD_VALUE = new RegExp(
  String.raw`(?<![A-Za-z0-9])(?:password|passwd|passphrase)${ASSIGNED}${NOT_A_REFERENCE}[^\s"',;&)]`,
  "iu",
);
const NAMED_SECRET = new RegExp(
  String.raw`(?<![A-Za-z0-9])(?:secret|token|api[_-]?key|access[_-]?key)${ASSIGNED}${NOT_A_REFERENCE}([A-Za-z0-9/+=_-]{16,})`,
  "giu",
);

// TOKEN_PREFIX redacts generously. Refusing a save must not catch `npm_config_registry`.
const isLiveToken = (token: string) =>
  Math.max(...token.split(/[_-]/u).map((part) => part.length)) >= 20 &&
  (/\d/u.test(token) || (/[a-z]/u.test(token) && /[A-Z]/u.test(token)));

const looksRandom = (value: string) => /\d/u.test(value) && /[A-Za-z]/u.test(value);

export const looksLikeCredential = (text: string): boolean =>
  PRIVATE_KEY.test(text) ||
  AWS_KEY_ID.test(text) ||
  BEARER_TOKEN.test(text) ||
  URL_PASSWORD.test(text) ||
  PASSWORD_VALUE.test(text) ||
  text.search(JWT) !== -1 ||
  Array.from(text.matchAll(NAMED_SECRET), (match) => match[1] ?? "").some(looksRandom) ||
  Array.from(text.matchAll(TOKEN_PREFIX), ([token]) => token).some(isLiveToken);
