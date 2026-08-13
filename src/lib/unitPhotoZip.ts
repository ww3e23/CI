import JSZip from 'jszip'
import type { Defect, ProjectState, Unit } from '../types'
import { resolveDefectItemLabel } from './defectDisplay'
import { fetchImageBlobForZip, safeFilename, triggerAnchorDownload } from './download'

export type UnitPhotoZipProgress = {
  done: number
  total: number
  current?: string
}

function sanitizePart(value: string, fallback = '未命名'): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
  return cleaned || fallback
}

/** 收集該戶所有可下載圖片（圖面位置＋現況） */
export function collectUnitPhotoEntries(
  state: ProjectState,
  unitId: string,
): Array<{ src: string; filename: string; label: string; defectNumber: number }> {
  const unit = state.units.find((u) => u.id === unitId)
  if (!unit) return []

  const defects = state.defects
    .filter((d) => d.unitId === unitId && d.status !== 'voided')
    .sort((a, b) => a.defectNumber - b.defectNumber)

  const out: Array<{ src: string; filename: string; label: string; defectNumber: number }> = []
  const usedNames = new Set<string>()

  const uniqueName = (raw: string, src: string) => {
    let name = safeFilename(raw, src)
    if (!usedNames.has(name)) {
      usedNames.add(name)
      return name
    }
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
    const base = ext ? name.slice(0, -ext.length) : name
    let i = 2
    while (usedNames.has(`${base}_${i}${ext}`)) i += 1
    name = `${base}_${i}${ext}`
    usedNames.add(name)
    return name
  }

  for (const d of defects) {
    const itemLabel = sanitizePart(
      resolveDefectItemLabel(d, state.checklistItems) || d.description || '未命名缺失',
    )
    const area = sanitizePart(d.area || '未指定區域')
    const cat = sanitizePart(d.categoryName || '未指定大項')
    const prefix = `#${d.defectNumber}_${cat}_${area}_${itemLabel}`

    if (d.planPhotoDataUrl) {
      out.push({
        src: d.planPhotoDataUrl,
        filename: uniqueName(`${prefix}_plan`, d.planPhotoDataUrl),
        label: `#${d.defectNumber} 圖面位置`,
        defectNumber: d.defectNumber,
      })
    }
    ;(d.photoDataUrls ?? []).forEach((src, i) => {
      if (!src) return
      out.push({
        src,
        filename: uniqueName(`${prefix}_photo-${String(i + 1).padStart(2, '0')}`, src),
        label: `#${d.defectNumber} 現況 ${i + 1}`,
        defectNumber: d.defectNumber,
      })
    })
  }

  return out
}

export function unitPhotoZipFilename(unit: Unit, projectName?: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const project = sanitizePart(projectName || '查驗專案', '查驗專案')
  const building = sanitizePart(unit.buildingName || '棟')
  const floor = sanitizePart(unit.floor || '樓')
  const code = sanitizePart(unit.code || '戶')
  return `${project}_${building}_${floor}_${code}戶_照片_${stamp}.zip`
}

/** 限制並行數的簡易工作池 */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onStep?: (done: number, index: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let finished = 0

  async function runOne(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index]!, index)
      finished += 1
      onStep?.(finished, index)
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length || 1))
  await Promise.all(Array.from({ length: n }, () => runOne()))
  return results
}

/**
 * 打包該戶全部圖片成 ZIP 並觸發下載。
 * 無法取得 blob 的遠端圖會略過並計入 failed。
 */
export async function downloadUnitPhotosZip(params: {
  state: ProjectState
  unitId: string
  projectName?: string
  onProgress?: (p: UnitPhotoZipProgress) => void
}): Promise<{ ok: number; failed: number; total: number; filename: string }> {
  const unit = params.state.units.find((u) => u.id === params.unitId)
  if (!unit) throw new Error('找不到此戶別')

  const entries = collectUnitPhotoEntries(params.state, params.unitId)
  if (entries.length === 0) throw new Error('此戶目前沒有可打包的圖片')

  const zip = new JSZip()
  const folderName = sanitizePart(
    `${unit.buildingName}_${unit.floor}_${unit.code}戶`,
    '本戶照片',
  )
  const folder = zip.folder(folderName) ?? zip

  // 手機／現場網路：並行下載；JPEG 已壓縮，ZIP 用 STORE 避免重壓拖慢
  const concurrency = entries.length > 80 ? 8 : 6
  let ok = 0
  let failed = 0
  let lastLabel = '準備中…'

  params.onProgress?.({
    done: 0,
    total: entries.length,
    current: `並行讀取中（${concurrency} 路）…`,
  })

  await mapPool(
    entries,
    concurrency,
    async (entry) => {
      try {
        const blob = await fetchImageBlobForZip(entry.src)
        if (!blob || blob.size === 0) {
          failed += 1
          return
        }
        // JPEG／PNG／WebP 幾乎壓不動，STORE 可大幅縮短 generate 時間
        folder.file(entry.filename, blob, { compression: 'STORE' })
        ok += 1
        lastLabel = entry.label
      } catch (err) {
        failed += 1
        console.warn('[unitPhotoZip] skip', entry.filename, err)
      }
    },
    (done) => {
      params.onProgress?.({
        done,
        total: entries.length,
        current: lastLabel,
      })
    },
  )

  if (ok === 0) {
    throw new Error(
      failed > 0
        ? '無法讀取圖片（可能是網路或雲端權限問題），請稍後再試'
        : '沒有可打包的圖片',
    )
  }

  params.onProgress?.({
    done: entries.length,
    total: entries.length,
    current: '產生 ZIP…',
  })

  // 全檔 STORE：圖片已壓縮，再 DEFLATE 幾乎無益且極慢（兩百多張時差很多）
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
    streamFiles: true,
  })
  const filename = unitPhotoZipFilename(unit, params.projectName)
  const url = URL.createObjectURL(blob)
  try {
    triggerAnchorDownload(url, filename)
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return { ok, failed, total: entries.length, filename }
}

/** 統計該戶圖片張數（不含作廢） */
export function countUnitPhotos(state: ProjectState, unitId: string): number {
  return collectUnitPhotoEntries(state, unitId).length
}

export function unitHasPhotos(defects: Defect[], unitId: string): boolean {
  return defects.some((d) => {
    if (d.unitId !== unitId || d.status === 'voided') return false
    if (d.planPhotoDataUrl) return true
    return (d.photoDataUrls ?? []).some(Boolean)
  })
}
