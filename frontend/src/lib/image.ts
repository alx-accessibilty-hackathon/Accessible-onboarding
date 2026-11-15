const MAX_SIDE = 1600;
const MAX_BYTES = 1_500_000; // the same limit as the server (backend/Usecase/validate.go)

export interface FileValue {
  name: string;
  data: string; // data URL
}

/** Shrinks a photo to a JPEG small enough to send. Throws 'file_invalid' or 'file_too_large'. */
export async function shrinkImage(file: File): Promise<FileValue> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('file_invalid');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('file_invalid');
  ctx.fillStyle = '#fff'; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const data = canvas.toDataURL('image/jpeg', 0.8);
  if (data.length * 0.75 > MAX_BYTES) throw new Error('file_too_large');
  return { name: file.name, data };
}
