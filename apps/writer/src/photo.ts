import { UploadFailure } from './errors';

export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const MAX_STORED_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 1600;

export interface PreparedPhoto {
  bytes: Uint8Array;
  contentType: 'image/jpeg';
  width: number;
  height: number;
  previewUrl: string;
}

/**
 * Shrinks a photo to at most 1600px on its long edge and re-encodes it as
 * JPEG. Re-drawing through a canvas also drops EXIF, including any GPS
 * position the camera embedded, so the only location stored is the one the
 * birder chose to share.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new UploadFailure('PAYLOAD_TOO_LARGE', { step: 'photo', detail: `${(file.size / 1048576).toFixed(1)} MB selected` });
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    throw new UploadFailure('PHOTO_UNREADABLE', { step: 'photo', detail: String(err) });
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UploadFailure('PHOTO_UNREADABLE', { step: 'photo', detail: 'no 2D canvas' });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new UploadFailure('PHOTO_UNREADABLE', { step: 'photo', detail: 'could not encode JPEG' });
  if (blob.size > MAX_STORED_BYTES) {
    throw new UploadFailure('PAYLOAD_TOO_LARGE', { step: 'photo', detail: `${(blob.size / 1048576).toFixed(1)} MB after shrinking` });
  }
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    contentType: 'image/jpeg',
    width,
    height,
    previewUrl: URL.createObjectURL(blob),
  };
}
