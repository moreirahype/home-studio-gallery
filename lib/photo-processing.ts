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
  const escapedLabel = escapeXml(label);
  const columns = Math.max(4, Math.ceil(width / 150));
  const rows = Math.max(8, Math.ceil(height / 100));
  const fontSize = Math.max(15, Math.round(width / 22));
  const marks = Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = ((column + 0.5) * width) / columns;
    const y = ((row + 0.5) * height) / rows + (column % 2 ? 34 : -8);
    const rotation = -31;

    return `<g transform="rotate(${rotation} ${x} ${y})">
      <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle"
        fill="#ffffff" fill-opacity="0.62" stroke="#000000" stroke-opacity="0.26" stroke-width="1.2"
        font-family="Arial, Helvetica, Liberation Sans, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="800"
        letter-spacing="1">${escapedLabel}</text>
    </g>`;
  }).join("");
  const overlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#000000" fill-opacity="0.06" />
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
