// Prepares photos in the browser before upload: checks the type and size, fixes phone
// photo rotation, and makes two WebP files (large 1600px and small 600px) so the store
// loads quickly on phones.
export const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
export const MAX_INPUT_BYTES = 15 * 1024 * 1024; // original photo; uploads are compressed well under the 5 MB storage limit

export function checkImageFile(f: File): string | null {
  if (!ACCEPTED.includes(f.type)) return `"${f.name}" isn't a JPG, PNG or WebP image.`;
  if (f.size > MAX_INPUT_BYTES) return `"${f.name}" is larger than 15 MB. Please choose a smaller photo.`;
  return null;
}

async function resize(bitmap: ImageBitmap, maxSide: number, quality: number, square = false): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  let sw = bitmap.width, sh = bitmap.height, sx = 0, sy = 0;
  if (square) { const side = Math.min(sw, sh); sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side; }
  const outScale = square ? Math.min(1, maxSide / sw) : scale;
  const w = Math.round(sw * outScale), h = Math.round(sh * outScale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("UPLOAD|Your browser couldn't process this image.");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); // transparent PNGs get a white background
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
  if (!blob) throw new Error("UPLOAD|Your browser couldn't process this image.");
  return blob;
}

export async function prepareImage(f: File): Promise<{ full: Blob; thumb: Blob }> {
  const problem = checkImageFile(f);
  if (problem) throw new Error(`UPLOAD|${problem}`);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(f, { imageOrientation: "from-image" }); }
  catch { throw new Error(`UPLOAD|"${f.name}" couldn't be read as an image.`); }
  try {
    return { full: await resize(bitmap, 1600, 0.85), thumb: await resize(bitmap, 600, 0.8, true) };
  } finally { bitmap.close(); }
}

export async function prepareLogo(f: File): Promise<Blob> {
  const problem = checkImageFile(f);
  if (problem) throw new Error(`UPLOAD|${problem}`);
  const bitmap = await createImageBitmap(f);
  try { return await resize(bitmap, 600, 0.9); } finally { bitmap.close(); }
}
