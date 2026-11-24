/**
 * Turn items that can start or end a subagent's user-only wait: its secret or link card,
 * or a user message that moves past a link card. Filters that drop subagent transcript
 * updates must keep these, or the parent's "Input needed" never appears or never clears.
 */
export const turnItemCanChangeUserWait = (item: { readonly type: string }) =>
  item.type === "secret_request" || item.type === "link_request" || item.type === "user_message";
