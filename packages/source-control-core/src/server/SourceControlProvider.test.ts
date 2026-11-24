import { assert, it } from "@effect/vitest";

import {
  repositoryPathFromRemoteUrl,
  transportSafeSourceControlErrorValue,
} from "./SourceControlProvider.ts";

it("removes URL credentials, query parameters, and fragments from error transport values", () => {
  assert.strictEqual(
    transportSafeSourceControlErrorValue(
      "https://user:secret@example.test/org/repo/pull/42?token=secret#discussion",
    ),
    "https://example.test/org/repo/pull/42",
  );
});

it.each([
  ["git@github.com:Dacre/dacre.git", "Dacre/dacre"],
  ["github.com:Dacre/dacre.git", "Dacre/dacre"],
  ["gitlab.com:Dacre/platform/dacre", "Dacre/platform/dacre"],
  ["https://github.com/Dacre/dacre.git", "Dacre/dacre"],
  ["https://github.com/Dacre/dacre.git?view=compact", "Dacre/dacre"],
  ["https://github.com/Dacre/dacre.git#section", "Dacre/dacre"],
  ["C:/repos/dacre", null],
])("reads the repository path of %s", (remoteUrl, expected) => {
  assert.strictEqual(repositoryPathFromRemoteUrl(remoteUrl), expected);
});
