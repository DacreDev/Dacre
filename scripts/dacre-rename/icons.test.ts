import { describe, expect, it } from "vite-plus/test";

import { icoFromPngs } from "./icons.ts";

describe("icoFromPngs", () => {
  it("writes a directory whose entries point at each embedded PNG", () => {
    const small = Buffer.from([1, 2, 3]);
    const large = Buffer.from([4, 5, 6, 7]);
    const ico = icoFromPngs([
      { size: 16, data: small },
      { size: 32, data: large },
    ]);

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    for (const [index, size, data] of [
      [0, 16, small],
      [1, 32, large],
    ] as const) {
      const entry = 6 + index * 16;
      expect(ico[entry]).toBe(size);
      expect(ico[entry + 1]).toBe(size);
      expect(ico.readUInt32LE(entry + 8)).toBe(data.length);
      const offset = ico.readUInt32LE(entry + 12);
      expect(ico.subarray(offset, offset + data.length)).toEqual(data);
    }
  });

  it("stores a 256px image with the format's zero size", () => {
    const ico = icoFromPngs([{ size: 256, data: Buffer.from([9]) }]);
    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(0);
  });
});
