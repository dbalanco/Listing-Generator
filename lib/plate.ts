/**
 * Turn an uploaded listing photo into an Omni plate.
 *
 * Port of probe/plate.py. This step is not cosmetic and must not be skipped:
 * Omni renders 1280x720 hard. Hand it a 3:2 or 4:3 photo and it has to decide
 * how to fit the frame, and whatever it decides is invisible to us -- which
 * makes the frame-0 pin unmeasurable. Crop to exactly 1280x720 first and a
 * correct pin is pixel-identical, so any drift afterwards is real drift rather
 * than reframing.
 */

export const PLATE_W = 1280;
export const PLATE_H = 720;

export interface Plate {
  /** JPEG data URL at exactly 1280x720. */
  dataUrl: string;
  /** Source dimensions, for the UI to explain what it cropped. */
  sourceW: number;
  sourceH: number;
  /** True when the source was not already 16:9 and pixels were discarded. */
  cropped: boolean;
}

/**
 * Center-crop to 16:9 then scale to 1280x720.
 *
 * `anchor` shifts the crop window: 0 = top/left, 0.5 = centre, 1 = bottom/right.
 * Interiors are usually best centred, but a room shot with a lot of floor
 * benefits from anchoring high.
 */
export async function makePlate(file: File | Blob, anchor = 0.5): Promise<Plate> {
  const bitmap = await loadBitmap(file);
  const sw = bitmap.width;
  const sh = bitmap.height;
  const target = PLATE_W / PLATE_H;

  let sx = 0;
  let sy = 0;
  let cw = sw;
  let ch = sh;

  if (sw / sh > target) {
    // too wide -- crop the sides
    cw = Math.round(sh * target);
    sx = Math.round((sw - cw) * anchor);
  } else if (sw / sh < target) {
    // too tall -- crop top/bottom
    ch = Math.round(sw / target);
    sy = Math.round((sh - ch) * anchor);
  }

  const canvas = document.createElement("canvas");
  canvas.width = PLATE_W;
  canvas.height = PLATE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context to build the plate.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, cw, ch, 0, 0, PLATE_W, PLATE_H);
  bitmap.close?.();

  return {
    // 0.95 matches the Python (quality=95). Lower starts to show on flat walls,
    // which is exactly where a listing photo lives.
    dataUrl: canvas.toDataURL("image/jpeg", 0.95),
    sourceW: sw,
    sourceH: sh,
    cropped: cw !== sw || ch !== sh,
  };
}

async function loadBitmap(file: File | Blob): Promise<ImageBitmap> {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }
  // Safari fallback
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not decode that image."));
      img.src = url;
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    return (await createImageBitmap(c)) as ImageBitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Fetch a bundled demo plate and present it in the same shape as an upload. */
export async function loadDemoPlate(url: string): Promise<Plate> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load demo plate ${url} (${res.status}).`);
  return makePlate(await res.blob());
}

/** Small JPEG for the room rail. Keeps the DOM light with 5 rooms loaded. */
export async function makeThumb(plate: Plate, width = 320): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not read the plate back."));
    img.src = plate.dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((width * PLATE_H) / PLATE_W);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}
