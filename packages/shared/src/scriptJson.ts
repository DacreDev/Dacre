/** JSON safe to embed in inline script source: it cannot close the tag or break the line. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>/\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
