// Shrinks a work photo on the phone before upload (PRD F7: about 150 KB), so 10 photos a shift
// fit the free storage tier and upload quickly on mobile data. Pure browser code, no data access.

/** Aim for about this size. A photo that can't get there keeps its smallest attempt rather than failing. */
const TARGET_BYTES = 150_000
/** Longest edge to start from: sharp enough to check a clean floor or a mirror. */
const START_EDGE = 1600
const MIN_EDGE = 800
const QUALITIES = [0.82, 0.72, 0.62, 0.52]

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // Respects the camera's rotation (EXIF), so portrait photos stay upright.
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the photo'))), 'image/jpeg', quality))
}

/** Returns a JPEG of about 150 KB. Throws when the file isn't an image the browser can read. */
export async function compressPhoto(file: Blob): Promise<Blob> {
  const source = await decode(file)
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height
  if (!width || !height) throw new Error('Could not read the photo')

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read the photo')

  let edge = Math.min(START_EDGE, Math.max(width, height))
  let smallest: Blob | null = null
  for (;;) {
    const scale = edge / Math.max(width, height)
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    for (const q of QUALITIES) {
      const blob = await toJpeg(canvas, q)
      if (!smallest || blob.size < smallest.size) smallest = blob
      if (blob.size <= TARGET_BYTES) return finish(source, blob)
    }
    if (edge <= MIN_EDGE && smallest) return finish(source, smallest)
    edge = Math.max(MIN_EDGE, Math.round(edge * 0.8))
  }
}

function finish(source: ImageBitmap | HTMLImageElement, blob: Blob): Blob {
  if ('close' in source) source.close()
  return blob
}
