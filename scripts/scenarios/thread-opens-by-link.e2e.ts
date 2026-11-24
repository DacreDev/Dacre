import { expect } from "e2e";

import { test, WEB } from "./dacre.ts";

test(
  "A seeded thread opens by its link and shows its history",
  WEB,
  async ({ dacre, app, screen }) => {
    const project = await dacre.project("demo");
    const thread = await dacre.thread({
      project,
      title: "Earlier work",
      messages: ["first", "second"],
    });
    await dacre.open(thread);

    await expect(screen.getByText("second fixture turn complete", { exact: false })).toBeVisible();
    await app.screenshot("thread");
  },
);
