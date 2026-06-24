import sharp from "sharp";

const glyphs: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
};

function createBitmapText(
  label: string,
  x: number,
  y: number,
  scale: number,
  rotation: number,
) {
  const normalized = label.toUpperCase().replace(/[^A-Z.]/g, "");
  const characters = Array.from(normalized).filter((character) => glyphs[character]);
  const characterGap = scale * 1.7;
  const glyphHeight = 7 * scale;
  const totalWidth =
    characters.reduce(
      (sum, character) => sum + glyphs[character][0].length * scale + characterGap,
      0,
    ) - characterGap;
  let cursor = -totalWidth / 2;
  const blocks: string[] = [];

  for (const character of characters) {
    const glyph = glyphs[character];

    glyph.forEach((row, rowIndex) => {
      Array.from(row).forEach((pixel, columnIndex) => {
        if (pixel !== "1") return;
        blocks.push(
          `<rect x="${(cursor + columnIndex * scale).toFixed(2)}" y="${(
            -glyphHeight / 2 +
            rowIndex * scale
          ).toFixed(2)}" width="${(scale * 0.92).toFixed(2)}" height="${(
            scale * 0.92
          ).toFixed(2)}" rx="${(scale * 0.16).toFixed(2)}" />`,
        );
      });
    });

    cursor += glyph[0].length * scale + characterGap;
  }

  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rotation})" opacity="0.36" fill="#ffffff" stroke="#000000" stroke-opacity="0.16" stroke-width="${Math.max(
    0.45,
    scale * 0.1,
  ).toFixed(2)}">${blocks.join("")}</g>`;
}

export async function createWatermarkedPreview(
  original: Buffer,
  label = "HOMESTUDIO.IA",
) {
  const image = sharp(original).rotate();
  const metadata = await image.metadata();
  const sourceWidth = metadata.width ?? 1024;
  const sourceHeight = metadata.height ?? 1280;
  const maxSide = 720;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const columns = Math.max(3, Math.ceil(width / 230));
  const rows = Math.max(5, Math.ceil(height / 170));
  const pixelSize = Math.max(1.75, width / 260);
  const marks = Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = ((column + 0.5) * width) / columns;
    const y = ((row + 0.5) * height) / rows + (column % 2 ? 22 : -6);
    const rotation = -31;

    return createBitmapText(label, x, y, pixelSize, rotation);
  }).join("");
  const overlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#000000" fill-opacity="0.025" />
      ${marks}
    </svg>`,
  );

  return image
    .resize({ width, height, fit: "inside", withoutEnlargement: true })
    .composite([{ input: overlay, gravity: "center" }])
    .webp({ quality: 52, effort: 4 })
    .toBuffer();
}

export async function createOptimizedOriginal(original: Buffer) {
  return sharp(original)
    .rotate()
    .resize({
      width: 1200,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 84, mozjpeg: true, progressive: true })
    .toBuffer();
}
