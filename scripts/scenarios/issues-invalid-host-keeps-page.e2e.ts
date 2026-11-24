import { expect } from "e2e";

import { test, WEB } from "./dacre.ts";

test("An invalid host filter keeps the Issues page open", WEB, async ({ dacre, app, browser }) => {
  await dacre.project("demo");
  await dacre.open("/issues?host=true");

  await app.screenshot("issues-invalid-host");
  await expect(browser.locator("h1")).toHaveText("Issues");
});
