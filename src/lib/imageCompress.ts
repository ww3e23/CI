/** 將圖片壓縮為 JPEG data URL，避免本機／上傳過大、標註畫布過糊 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('無法讀取圖片'))
    img.src = src
  })
}

function canvasToJpegDataUrl(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // toBlob 比同步 toDataURL 較不卡主執行緒（連拍體感差很多）
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            try {
              resolve(canvas.toDataURL('image/jpeg', quality))
            } catch (err) {
              reject(err instanceof Error ? err : new Error('壓縮失敗'))
            }
            return
          }
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(new Error('讀取壓縮結果失敗'))
          reader.readAsDataURL(blob)
        },
        'image/jpeg',
        quality,
      )
      return
    }
    try {
      resolve(canvas.toDataURL('image/jpeg', quality))
    } catch (err) {
      reject(err instanceof Error ? err : new Error('壓縮失敗'))
    }
  })
}

export async function compressImageDataUrl(
  dataUrl: string,
  options?: { maxEdge?: number; quality?: number },
): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl
  const maxEdge = options?.maxEdge ?? 1920
  const quality = options?.quality ?? 0.85

  const img = await loadImage(dataUrl)
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, w, h)
  return canvasToJpegDataUrl(canvas, quality)
}

/**
 * 檔案 → 壓縮 JPEG data URL。
 * 優先 createImageBitmap，避免先把原圖整份轉成巨大 base64（連拍會慢／易過熱）。
 */
export async function fileToCompressedDataUrl(
  file: File,
  options?: { maxEdge?: number; quality?: number },
): Promise<string> {
  const maxEdge = options?.maxEdge ?? 1920
  const quality = options?.quality ?? 0.85

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      try {
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
        const w = Math.max(1, Math.round(bitmap.width * scale))
        const h = Math.max(1, Math.round(bitmap.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no canvas')
        ctx.drawImage(bitmap, 0, 0, w, h)
        return await canvasToJpegDataUrl(canvas, quality)
      } finally {
        bitmap.close()
      }
    } catch (err) {
      console.warn('[imageCompress] createImageBitmap path failed, fallback', err)
    }
  }

  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('讀取檔案失敗'))
    reader.readAsDataURL(file)
  })
  if (!raw) throw new Error('讀取檔案失敗')
  return compressImageDataUrl(raw, { maxEdge, quality })
}
