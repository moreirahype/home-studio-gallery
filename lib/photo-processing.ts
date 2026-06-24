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
  const strokeWidth = Math.max(0.8, fontSize * 0.045);

  return `<g transform="rotate(${rotation} ${x.toFixed(2)} ${y.toFixed(2)})">
    <text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle"
      fill="#ffffff" fill-opacity="0.43"
      stroke="#2b211c" stroke-opacity="0.2" stroke-width="${strokeWidth.toFixed(2)}"
      paint-order="stroke fill"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${fontSize.toFixed(2)}" font-weight="800"
      letter-spacing="1.35">${escapeXml(label)}</text>
  </g>`;
}

export async function createWatermarkedPreview(
  original: Buffer,
  label = "HOMESTUDIO.IA",
) {
  const base = await sharp(original)
    .rotate()
    .resize({
      width: 720,
      height: 720,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(base).metadata();
  const width = metadata.width ?? 720;
  const height = metadata.height ?? 720;
  const fontSize = Math.max(17, Math.min(28, width / 30));
  const spacingX = Math.max(175, fontSize * 8.8);
  const spacingY = Math.max(120, fontSize * 5.8);
  const marks: string[] = [];

  for (let y = -spacingY; y < height + spacingY; y += spacingY) {
    const rowIndex = Math.round(y / spacingY);
    for (let x = -spacingX; x < width + spacingX; x += spacingX) {
      const offsetX = rowIndex % 2 === 0 ? 0 : spacingX / 2;
      marks.push(
        createWatermarkText(
          label,
          x + offsetX,
          y,
          fontSize,
          -29,
        ),
      );
    }
  }

  const overlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#000000" fill-opacity="0.018" />
      ${marks.join("")}
    </svg>`,
  );

  return sharp(base)
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
