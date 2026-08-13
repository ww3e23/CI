/** 從 Google 雲端硬碟資料夾網址解析 folderId */
export function parseDriveFolderId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw) && !raw.includes('/') && !raw.includes('http')) {
    return raw
  }
  try {
    const url = new URL(raw)
    const fromPath = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    if (fromPath?.[1]) return fromPath[1]
    const id = url.searchParams.get('id')
    if (id) return id
  } catch {
    /* ignore */
  }
  return null
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`
}
