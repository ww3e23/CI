/** 將圖片壓縮為 JPEG data URL，避免本機／上傳過大、標註畫布過糊 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('無法讀取圖片'))
    img.src = src
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
  return canvas.toDataURL('image/jpeg', quality)
}

export async function fileToCompressedDataUrl(
  file: File,
  options?: { maxEdge?: number; quality?: number },
): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('讀取檔案失敗'))
    reader.readAsDataURL(file)
  })
  if (!raw) throw new Error('讀取檔案失敗')
  return compressImageDataUrl(raw, options)
}
