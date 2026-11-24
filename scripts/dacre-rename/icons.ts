// @effect-diagnostics nodeBuiltinImport:off - A one-shot asset generator with no Effect runtime.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";

type Variant = "prod" | "dev" | "nightly";

interface Mark {
  readonly variant: Variant;
  readonly shape: "tile" | "mac";
}

const TILE_COLORS: Readonly<Record<Variant, readonly [string, string]>> = {
  prod: ["#ffffff", "#e9ebf0"],
  dev: ["#3b9bff", "#0a5fd6"],
  nightly: ["#6f6bff", "#3a2bb8"],
};
/** The mark's own color, kept on the light production tile; colored tiles use white. */
const MARK_COLOR = "#110f17";
const markFill = (variant: Variant) => (variant === "prod" ? MARK_COLOR : "#fff");
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
// Traced from the Dacre mark artwork, in its own MARK_WIDTH x MARK_HEIGHT box.
const MARK_PATH =
  "M469.7 0L486.8 0.3L502.8 2.7L521.8 8.7L540.8 18.8L553.8 27.8L568.9 43L582.1 63L589 78L594.2 96L596.3 110L596.1 203L595.1 213L593 225L588.2 241L582.1 255L572.1 272L564.1 282L554.8 291.4L537.8 304.4L338.8 418.3L327.8 424.4L314.8 430.3L299.8 435.5L287.8 438.1L272.8 440.2L256.8 440.2L242.8 438.3L228.8 434.4L213.8 428.4L200.8 421.3L184.8 410.2L172.8 400.3L159.6 388L142.6 370L128.5 353L124.5 347L116.6 333L111.6 321L107.7 306L105.6 288L105.7 274L107.7 258L110.6 245L116.8 228L120.4 220L128.7 205L143.6 185L151.8 176.6L160.8 168.8L181.8 154.8L260.8 106.9L416.8 14.8L432.8 7.6L444.8 3.9L454.8 1.7ZM717.5 272L728.8 271.8L747.8 274.9L756.8 277.8L765.8 281.7L777.8 288.7L792.1 301L799 310L804.1 318L807.1 324L810.1 332L812.2 340L814 351L814.3 357L814.2 602L813 614L811.1 625L808.3 635L802 651L793 667L783.5 679L777.8 685.3L758.8 700.4L698.8 736.2L570.8 807.5L555.8 814.2L546.8 817.1L533.8 820.2L516.8 821.8L494.9 820L480.8 816.1L466.8 810.3L446.8 797.5L436.8 787.7L428.8 778L421.6 767L414.6 752L411.7 743L408.6 728L407.8 714L408.3 504L411.5 484L413.7 476L418.7 463L427.7 447L435.7 436L448.8 422.5L463.8 411.7L632.8 310L677.8 283.6L696.8 275.8L704.8 273.8ZM187.1 472L199.8 472.4L211.8 473.8L226.8 476.6L242.8 480.9L266.8 489.7L277.8 494.7L294.8 503.8L307.8 512.7L316.8 519.9L330.2 533L339.1 544L347.3 556L357.2 575L360.9 584L365 597L368.3 612L370.1 629L370.5 640L369.7 755L368 771L365.1 784L361.2 796L357 805L348 820L339.8 830L328.8 840.2L314.8 850L298.8 858.4L284.8 864.2L264.8 870.2L244.8 874.3L218.8 876.7L200.8 876.6L176.8 874.3L160.8 871.3L139.8 865.2L126.8 860.3L98.8 846.3L86 838L69.3 825L57.6 814L43.4 798L31.4 781L21.6 763L13.5 745L5.6 719L1.6 698L0 678L0.5 652L4.6 626L8.6 610L14.6 593L21.7 578L30.6 562L45.8 541L60.8 524.6L76.8 510.8L95.8 497.9L110.8 489.8L132.8 480.8L146.8 476.7L168.8 473Z";
const MARK_WIDTH = 814.3;
const MARK_HEIGHT = 876.7;
/** The mark's height on a 1024 tile at scale 1. */
const MARK_BOX = 600;

// Apple's continuous corner, drawn as a superellipse.
const SQUIRCLE = (() => {
  const points: string[] = [];
  for (let degree = 0; degree < 360; degree += 1) {
    const angle = (degree * Math.PI) / 180;
    const axis = (value: number) =>
      (512 + 512 * Math.sign(value) * Math.abs(value) ** (2 / 5)).toFixed(1);
    points.push(`${axis(Math.cos(angle))} ${axis(Math.sin(angle))}`);
  }
  return `M${points.join("L")}Z`;
})();

export function icoFromPngs(pngs: ReadonlyArray<{ size: number; data: Buffer }>): Buffer {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size >= 256 ? 0 : size;
    header[entry + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map(({ data }) => data)]);
}

/** The mark centered on a 1024 canvas. */
const glyph = (scale: number, fill: string) => {
  const factor = (MARK_BOX * scale) / MARK_HEIGHT;
  const x = (512 - (MARK_WIDTH * factor) / 2).toFixed(1);
  const y = (512 - (MARK_HEIGHT * factor) / 2).toFixed(1);
  return `<path d="${MARK_PATH}" fill="${fill}" transform="translate(${x} ${y}) scale(${factor.toFixed(4)})"/>`;
};

function markSvg({ variant, shape }: Mark, size: number): string {
  const [top, bottom] = TILE_COLORS[variant];
  const fill = `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>`;
  // Small icons need a larger mark to stay readable.
  const scale = size <= 32 ? 1.24 : 1;
  // A faint edge keeps the light tile apart from a light taskbar or page.
  const edge =
    variant === "prod" ? ` stroke="${MARK_COLOR}" stroke-opacity="0.12" stroke-width="10"` : "";
  const tile = `<path d="${SQUIRCLE}" fill="url(#t)"${edge}/>`;
  const mark = markFill(variant);
  const body =
    shape === "mac"
      ? `${fill}<g transform="translate(100 100) scale(${824 / 1024})">${tile}${glyph(scale, mark)}</g>`
      : `${fill}${tile}${glyph(scale, mark)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;
}

const VARIANT_BY_NAME: ReadonlyArray<readonly [RegExp, Variant]> = [
  [/(^|[/-])(blueprint|classic-blueprint|classic-dev)/, "dev"],
  [/(^|[/-])(sunrise|orbital-sunrise|nightly)/, "nightly"],
  [/(^|[/-])black/, "prod"],
];

function markFor(path: string): Mark | undefined {
  const name = NodePath.basename(path);
  if (path.startsWith("apps/web/public/") && !path.includes("/app-icons/")) {
    return { variant: "dev", shape: "tile" };
  }
  if (path.startsWith("assets/") || path.startsWith("apps/web/public/app-icons/")) {
    const channel = path.split("/")[1] as Variant;
    const variant =
      VARIANT_BY_NAME.find(([pattern]) => pattern.test(name))?.[1] ??
      (["prod", "dev", "nightly"].includes(channel) ? channel : "prod");
    return { variant, shape: name.includes("macos") ? "mac" : "tile" };
  }
  return undefined;
}

const layerGlyph = (variant: Variant) =>
  `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg"><g transform="scale(0.125)">${glyph(1, markFill(variant))}</g></svg>\n`;
const layerBackground = (variant: Variant) => {
  const [top, bottom] = TILE_COLORS[variant];
  return `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="128" gradientUnits="userSpaceOnUse"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="128" height="128" fill="url(#t)"/></svg>\n`;
};
const dmgBackground = (variant: Variant) => {
  const [top, bottom] = variant === "nightly" ? ["#1d1a3f", "#0c0b1c"] : ["#15161c", "#08090e"];
  return `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="864" viewBox="0 0 660 432"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="660" height="432" fill="url(#b)"/><path d="M322 170l14 12-14 12" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;
};

async function generate(root: string) {
  // shortcut: sharp is a transitive dependency, reached through pnpm's hoist; add it directly if this tool outlives the placeholder mark.
  const sharp = NodeModule.createRequire(import.meta.url)(
    NodePath.join(root, "node_modules/.pnpm/node_modules/sharp"),
  ) as (input: Buffer | string) => {
    png(): { toBuffer(): Promise<Buffer> };
    metadata(): Promise<{ width: number }>;
  };
  const png = (mark: Mark, size: number) =>
    sharp(Buffer.from(markSvg(mark, size)))
      .png()
      .toBuffer();
  const write = (path: string, data: string | Buffer) =>
    NodeFS.writeFileSync(NodePath.join(root, path), data);

  const tracked = NodeChildProcess.execFileSync("git", ["ls-files", "assets", "apps/web/public"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((path) => /\.(png|ico)$/.test(path));

  let written = 0;
  for (const path of tracked) {
    const mark = markFor(path);
    if (mark === undefined) continue;
    if (path.endsWith(".ico")) {
      const images = await Promise.all(
        ICO_SIZES.map(async (size) => ({ size, data: await png(mark, size) })),
      );
      write(path, icoFromPngs(images));
    } else {
      const { width } = await sharp(NodePath.join(root, path)).metadata();
      write(path, await png(mark, width));
    }
    written += 1;
  }

  for (const variant of ["prod", "dev", "nightly"] as const) {
    const assets = `assets/${variant}/app-icon.icon`;
    write(`${assets}/Assets/text.svg`, layerGlyph(variant));
    if (variant !== "prod") write(`${assets}/Assets/background.svg`, layerBackground(variant));
  }

  write(
    "assets/prod/logo.svg",
    `<svg width="128" height="128" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${SQUIRCLE}" fill="#ffffff" stroke="${MARK_COLOR}" stroke-opacity="0.12" stroke-width="10"/>${glyph(1, MARK_COLOR)}</svg>\n`,
  );
  write("apps/desktop/resources/dmg/dmg-background-latest.svg", dmgBackground("prod"));
  write("apps/desktop/resources/dmg/dmg-background-nightly.svg", dmgBackground("nightly"));
  process.stdout.write(`generated ${written} images\n`);
}

if (import.meta.main) await generate(process.cwd());
