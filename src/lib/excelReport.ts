import ExcelJS from 'exceljs'
import type { ProjectState } from '../types'
import { triggerAnchorDownload } from './download'
import {
  openDefectCount,
  statusLabel,
  unitCategoryProgress,
  unitIsInspectionComplete,
} from './progress'

const DONE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFC6EFCE' },
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F4E79' },
}

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
}

function compareFloor(a: string, b: string): number {
  const na = Number.parseInt(a, 10)
  const nb = Number.parseInt(b, 10)
  if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) {
    return na - nb
  }
  return a.localeCompare(b, 'zh-Hant')
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet'
  let candidate = cleaned
  let i = 2
  while (used.has(candidate)) {
    const suffix = `_${i}`
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`
    i += 1
  }
  used.add(candidate)
  return candidate
}

function applyHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = THIN_BORDER
  })
  row.height = 22
}

function enableSheetFilter(sheet: ExcelJS.Worksheet, headerRow: number, colCount: number, lastRow: number) {
  if (lastRow < headerRow) return
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: lastRow, column: colCount },
  }
  sheet.views = [{ state: 'frozen', ySplit: headerRow }]
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  try {
    triggerAnchorDownload(url, filename)
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

/** 避免把 proj_xxxx 這類內部 ID 顯示在報表標題 */
function resolveExportProjectLabel(
  project: ProjectState,
  displayName?: string,
): string {
  const isInternalId = (v: string) =>
    /^proj[_-]/i.test(v.trim()) || /^[a-z0-9]{16,}$/i.test(v.trim())
  for (const candidate of [displayName, project.projectName]) {
    const name = candidate?.trim()
    if (!name) continue
    if (isInternalId(name)) continue
    if (name === '未選擇專案' || name === '未命名專案') continue
    return name
  }
  return ''
}

/** 分棟／分層／分戶缺失數量矩陣 + 查驗完成綠底 + 缺失明細 */
export async function exportInspectionExcel(
  project: ProjectState,
  options?: { displayName?: string; unitIds?: string[] },
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CI 現場查驗'
  workbook.created = new Date()

  const projectLabel = resolveExportProjectLabel(project, options?.displayName)
  const usedNames = new Set<string>()
  const activeCats = project.categories.filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const buildings = [...project.buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const unitIdFilter =
    options?.unitIds && options.unitIds.length > 0 ? new Set(options.unitIds) : null

  const includeUnit = (unitId: string) => !unitIdFilter || unitIdFilter.has(unitId)

  const hasAnyUnit = project.units.some((u) => u.active && includeUnit(u.id))
  if (!hasAnyUnit) {
    throw new Error('沒有可匯出的戶別（請勾選戶別，或先完成至少一戶查驗）')
  }

  // 1) 說明
  {
    const sheet = workbook.addWorksheet(sanitizeSheetName('說明', usedNames))
    sheet.getColumn(1).width = 22
    sheet.getColumn(2).width = 64
    const rows: Array<[string, string]> = [
      ['專案', projectLabel || '（未命名專案）'],
      ['匯出時間', new Date().toLocaleString('zh-TW')],
      ['分頁順序', '說明 → 全案彙總 → 缺失明細 → 各棟矩陣'],
      ['全案彙總／缺失明細', '表頭已開篩選器，可依棟別、樓層、戶別、大項等快速篩選。'],
      ['已查大項', '該戶已標記查畢，或該大項已有缺失紀錄（細項不必全勾才算查過）。'],
      ['已查畢大項', '僅計算有按「此大項已查畢／本戶查驗完成」的大項。'],
      ['綠底', '該戶所有大項皆已標記查畢（查驗完成），可避免重複查驗。'],
      ['數字（各棟表）', '該戶目前「待改善／待複驗／退回」的缺失筆數（不含已改善、已作廢）。'],
    ]
    rows.forEach(([k, v], idx) => {
      const row = sheet.getRow(idx + 1)
      row.getCell(1).value = k
      row.getCell(1).font = { bold: true }
      row.getCell(2).value = v
    })
    const legend = sheet.getRow(rows.length + 2)
    legend.getCell(1).value = '範例綠底'
    legend.getCell(2).value = '查驗完成'
    legend.getCell(2).fill = DONE_FILL
  }

  // 2) 全案彙總（第二分頁）
  {
    const sheet = workbook.addWorksheet(sanitizeSheetName('全案彙總', usedNames))
    const header = [
      '棟別',
      '樓層',
      '戶別',
      '未改善缺失',
      '查驗狀態',
      '已查大項',
      '已查畢大項',
      '大項總數',
    ]
    const head = sheet.addRow(header)
    applyHeaderRow(head)
    header.forEach((_, idx) => {
      sheet.getColumn(idx + 1).width = [14, 10, 10, 12, 12, 10, 12, 10][idx]
    })

    const sortedUnits = [...project.units]
      .filter((u) => u.active && includeUnit(u.id))
      .sort((a, b) => {
        const ba = project.buildings.find((x) => x.id === a.buildingId)?.name ?? ''
        const bb = project.buildings.find((x) => x.id === b.buildingId)?.name ?? ''
        if (ba !== bb) return ba.localeCompare(bb, 'zh-Hant')
        const floorCmp = compareFloor(a.floor, b.floor)
        if (floorCmp !== 0) return floorCmp
        return a.code.localeCompare(b.code, 'zh-Hant', { numeric: true })
      })

    for (const unit of sortedUnits) {
      const buildingName =
        project.buildings.find((b) => b.id === unit.buildingId)?.name ?? unit.buildingName
      const prog = unitCategoryProgress(unit.id, project)
      const done = unitIsInspectionComplete(project, unit.id)
      const statusText = done ? '查驗完成' : prog.started > 0 ? '進行中' : '未開始'
      const row = sheet.addRow([
        buildingName,
        unit.floor,
        unit.code,
        openDefectCount(project.defects, unit.id),
        statusText,
        prog.started,
        prog.done,
        prog.total,
      ])
      row.eachCell((cell) => {
        cell.border = THIN_BORDER
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })
      if (done) {
        row.eachCell((cell) => {
          cell.fill = DONE_FILL
        })
      }
    }

    enableSheetFilter(sheet, 1, header.length, Math.max(1, sheet.rowCount))
  }

  // 3) 缺失明細（第三分頁，含篩選）
  {
    const sheet = workbook.addWorksheet(sanitizeSheetName('缺失明細', usedNames))
    const header = [
      '棟別',
      '樓層',
      '戶別',
      '編號',
      '大項',
      '區域',
      '缺失說明',
      '狀態',
      '照片數',
      '建立時間',
    ]
    const head = sheet.addRow(header)
    applyHeaderRow(head)
    const widths = [12, 8, 8, 8, 14, 12, 36, 10, 8, 20]
    widths.forEach((w, idx) => {
      sheet.getColumn(idx + 1).width = w
    })

    const defects = [...project.defects]
      .filter((d) => d.status !== 'voided' && includeUnit(d.unitId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    for (const defect of defects) {
      const row = sheet.addRow([
        defect.buildingName,
        defect.floor,
        defect.unitCode,
        defect.defectNumber,
        defect.categoryName,
        defect.area,
        defect.description,
        statusLabel(defect.status),
        defect.photoDataUrls?.length ?? 0,
        new Date(defect.createdAt).toLocaleString('zh-TW'),
      ])
      row.eachCell((cell, col) => {
        cell.border = THIN_BORDER
        cell.alignment = {
          vertical: 'middle',
          horizontal: col === 7 ? 'left' : 'center',
          wrapText: col === 7,
        }
      })
      if (defect.status === 'completed') {
        row.getCell(8).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9D9D9' },
        }
      }
    }

    enableSheetFilter(sheet, 1, header.length, Math.max(1, sheet.rowCount))
  }

  // 4+) 各棟矩陣
  for (const building of buildings) {
    const units = project.units
      .filter((u) => u.buildingId === building.id && u.active && includeUnit(u.id))
      .sort((a, b) => {
        const floorCmp = compareFloor(a.floor, b.floor)
        if (floorCmp !== 0) return floorCmp
        return a.code.localeCompare(b.code, 'zh-Hant', { numeric: true })
      })
    if (units.length === 0) continue

    const floors = Array.from(new Set(units.map((u) => u.floor))).sort(compareFloor)
    const codes = Array.from(new Set(units.map((u) => u.code))).sort((a, b) =>
      a.localeCompare(b, 'zh-Hant', { numeric: true }),
    )

    const sheet = workbook.addWorksheet(sanitizeSheetName(building.name, usedNames))
    sheet.getCell(1, 1).value = projectLabel
      ? `${projectLabel}｜${building.name}｜分層分戶缺失數量`
      : `${building.name}｜分層分戶缺失數量`
    sheet.getCell(1, 1).font = { bold: true, size: 13 }
    sheet.mergeCells(1, 1, 1, Math.max(2, codes.length + 1))

    sheet.getCell(2, 1).value =
      `綠底＝該戶全部大項查驗完成（共 ${activeCats.length} 項）｜數字＝未改善缺失數`
    sheet.getCell(2, 1).font = { color: { argb: 'FF666666' }, size: 10 }
    sheet.mergeCells(2, 1, 2, Math.max(2, codes.length + 1))

    const header = sheet.getRow(4)
    header.getCell(1).value = '樓層＼戶別'
    codes.forEach((code, idx) => {
      header.getCell(idx + 2).value = code
    })
    applyHeaderRow(header)
    sheet.getColumn(1).width = 12
    codes.forEach((_, idx) => {
      sheet.getColumn(idx + 2).width = 8
    })

    floors.forEach((floor, floorIdx) => {
      const row = sheet.getRow(5 + floorIdx)
      row.getCell(1).value = floor
      row.getCell(1).font = { bold: true }
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      row.getCell(1).border = THIN_BORDER

      codes.forEach((code, codeIdx) => {
        const unit = units.find((u) => u.floor === floor && u.code === code)
        const cell = row.getCell(codeIdx + 2)
        cell.border = THIN_BORDER
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        if (!unit) {
          cell.value = '—'
          cell.font = { color: { argb: 'FFAAAAAA' } }
          return
        }
        const count = openDefectCount(project.defects, unit.id)
        cell.value = count
        if (unitIsInspectionComplete(project, unit.id)) {
          cell.fill = DONE_FILL
          cell.font = { bold: true, color: { argb: 'FF006100' } }
        }
      })
    })

    const summaryRow = 5 + floors.length + 1
    sheet.getCell(summaryRow, 1).value = '本棟戶數'
    sheet.getCell(summaryRow, 2).value = units.length
    sheet.getCell(summaryRow + 1, 1).value = '查驗完成戶數'
    sheet.getCell(summaryRow + 1, 2).value = units.filter((u) =>
      unitIsInspectionComplete(project, u.id),
    ).length
    sheet.getCell(summaryRow + 2, 1).value = '未改善缺失合計'
    sheet.getCell(summaryRow + 2, 2).value = units.reduce(
      (sum, u) => sum + openDefectCount(project.defects, u.id),
      0,
    )
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `${projectLabel || '查驗專案'}_分層分戶缺失_${stamp}.xlsx`
  await downloadWorkbook(workbook, filename)
}
