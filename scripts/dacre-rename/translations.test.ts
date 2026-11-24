import { describe, expect, it } from "vite-plus/test";

import { restoreTranslations } from "./translations.ts";

describe("restoreTranslations", () => {
  it("carries translations across a brand rename", () => {
    expect(
      restoreTranslations({
        oldEnglish: { a1: "Open T3 Code", b2: "Save" },
        oldLocale: { a1: "T3 Code öffnen", b2: "Speichern" },
        newEnglish: { z9: "Open Dacre", b2: "Save", n3: "Brand new" },
      }),
    ).toEqual({ z9: "Dacre öffnen", b2: "Speichern", n3: "Brand new" });
  });

  it("carries structured JSX translations", () => {
    expect(
      restoreTranslations({
        oldEnglish: { a1: ["Open ", { c: "T3 Code", i: 1 }] },
        oldLocale: { a1: [{ c: "T3 Code", i: 1 }, " öffnen"] },
        newEnglish: { z9: ["Open ", { c: "Dacre", i: 1 }] },
      }),
    ).toEqual({ z9: [{ c: "Dacre", i: 1 }, " öffnen"] });
  });
});
