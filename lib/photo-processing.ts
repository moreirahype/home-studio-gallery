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
  label = "HOME STUDIO",
) {
  const image = sharp(original).rotate();
  const metadata = await image.metadata();
  const width = Math.min(metadata.width ?? 1024, 1200);
  const height = Math.round(
    width * ((metadata.height ?? 1280) / (metadata.width ?? 1024)),
  );
  const escapedLabel = escapeXml(label);
  const columns = 3;
  const rows = 7;
  const marks = Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = ((column + 0.5) * width) / columns;
    const y = ((row + 0.5) * height) / rows + (column % 2 ? 28 : 0);

    return `<text x="${x}" y="${y}" text-anchor="middle"
      fill="rgba(255,255,255,0.42)" font-family="Arial, sans-serif"
      font-size="${Math.max(18, Math.round(width / 38))}" font-weight="700"
      letter-spacing="3" transform="rotate(-28 ${x} ${y})">${escapedLabel}</text>`;
  }).join("");
  const overlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${marks}</svg>`,
  );

  return image
    .resize({ width, withoutEnlargement: true })
    .composite([{ input: overlay, gravity: "center" }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
