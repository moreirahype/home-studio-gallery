import sharp from "sharp";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function createWatermarkText(
  label: string,
  x: number,
  y: number,
  fontSize: number,
  rotation: number,
) {
  return `<g transform="rotate(${rotation} ${x.toFixed(2)} ${y.toFixed(2)})">
    <text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle"
      fill="#ffffff" fill-opacity="0.34" stroke="#000000" stroke-opacity="0.14" stroke-width="${Math.max(
        0.55,
        fontSize * 0.035,
      ).toFixed(2)}"
      font-family="Arial, Helvetica, sans-serif" font-size="${fontSize.toFixed(2)}" font-weight="800"
      letter-spacing="1.2">${escapeXml(label)}</text>
  </g>`;
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
  const fontSize = Math.max(15, width / 34);
  const marks = Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = ((column + 0.5) * width) / columns;
    const y = ((row + 0.5) * height) / rows + (column % 2 ? 22 : -6);
    const rotation = -31;

    return createWatermarkText(label, x, y, fontSize, rotation);
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
