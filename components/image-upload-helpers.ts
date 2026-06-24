export async function readDroppedImageFiles(
  dataTransfer: DataTransfer,
  limit: number,
) {
  const imageFiles = Array.from(dataTransfer.files).filter((file) =>
    file.type.startsWith("image/"),
  );

  if (imageFiles.length) return imageFiles.slice(0, limit);

  const url =
    dataTransfer.getData("text/uri-list") ||
    dataTransfer.getData("text/plain") ||
    extractImageUrl(dataTransfer.getData("text/html"));

  if (!url || !/^https?:\/\//i.test(url)) return [];

  try {
    const response = await fetch(url, { mode: "cors" });
    const blob = await response.blob();
    if (!response.ok || !blob.type.startsWith("image/")) return [];

    const extension = blob.type.split("/")[1]?.split("+")[0] || "jpg";
    return [new File([blob], `imagem-colada.${extension}`, { type: blob.type })];
  } catch {
    return [];
  }
}

export function readClipboardImageFiles(
  clipboardData: DataTransfer,
  limit: number,
) {
  return Array.from(clipboardData.files)
    .filter((file) => file.type.startsWith("image/"))
    .slice(0, limit);
}

export function setInputFiles(input: HTMLInputElement | null, files: File[]) {
  if (!input) return;

  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  input.files = transfer.files;
}

function extractImageUrl(html: string) {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? "";
}
