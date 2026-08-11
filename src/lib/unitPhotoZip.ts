import JSZip from 'jszip'
import type { Defect, ProjectState, Unit } from '../types'
import { resolveDefectItemLabel } from './defectDisplay'
import { prepareImageDownload, revokePrepared, safeFilename, triggerAnchorDownload } from './download'

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

  let ok = 0
  let failed = 0

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    params.onProgress?.({
      done: i,
      total: entries.length,
      current: entry.label,
    })
    try {
      const prepared = await prepareImageDownload(entry.src, entry.filename, entry.label)
      try {
        if (!prepared.blob || prepared.remoteOnly) {
          failed += 1
          continue
        }
        folder.file(prepared.filename, prepared.blob)
        ok += 1
      } finally {
        revokePrepared(prepared)
      }
    } catch (err) {
      failed += 1
      console.warn('[unitPhotoZip] skip', entry.filename, err)
    }
  }

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
    current: '壓縮中…',
  })

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
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
