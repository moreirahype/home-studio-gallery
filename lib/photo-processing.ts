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
  const width = Math.min(metadata.width ?? 1024, 1200);
  const height = Math.round(
    width * ((metadata.height ?? 1280) / (metadata.width ?? 1024)),
  );
  const escapedLabel = escapeXml(label);
  const columns = Math.max(4, Math.ceil(width / 230));
  const rows = Math.max(8, Math.ceil(height / 145));
  const fontSize = Math.max(22, Math.round(width / 30));
  const marks = Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = ((column + 0.5) * width) / columns;
    const y = ((row + 0.5) * height) / rows + (column % 2 ? 34 : -8);
    const rotation = -31;

    return `<g transform="rotate(${rotation} ${x} ${y})">
      <text x="${x}" y="${y}" text-anchor="middle"
        fill="rgba(255,255,255,0.58)" stroke="rgba(0,0,0,0.24)" stroke-width="1.2"
        font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800"
        letter-spacing="4">${escapedLabel}</text>
    </g>`;
  }).join("");
  const overlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.05)" />
      ${marks}
    </svg>`,
  );

  return image
    .resize({ width, withoutEnlargement: true })
    .composite([{ input: overlay, gravity: "center" }])
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}
