function guessExt(src: string): string {
  if (src.startsWith('data:image/png')) return 'png'
  if (src.startsWith('data:image/webp')) return 'webp'
  if (src.includes('.png')) return 'png'
  if (src.includes('.webp')) return 'webp'
  return 'jpg'
}

/** 下載圖片（支援 data URL 與 http(s)） */
export async function downloadImage(src: string, filename: string): Promise<void> {
  const ext = guessExt(src)
  const safeName = filename.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '-')
  const full = safeName.includes('.') ? safeName : `${safeName}.${ext}`

  if (src.startsWith('data:')) {
    const a = document.createElement('a')
    a.href = src
    a.download = full
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return
  }

  const res = await fetch(src)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = full
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function downloadImages(
  items: { src: string; filename: string }[],
): Promise<void> {
  for (const item of items) {
    if (!item.src) continue
    await downloadImage(item.src, item.filename)
    await new Promise((r) => setTimeout(r, 180))
  }
}
