import ExcelJS from 'exceljs'
import type { ChecklistItem, Defect, ProjectState, Unit } from '../types'
import { getUnitAreas } from './areas'
import { triggerAnchorDownload } from './download'
import { floorRank } from './floors'
import { openDefectCount, unitProgress } from './progress'

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FF222222' },
  size: 10,
}

const CAT_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE7EEF5' },
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
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

/** 表頭：只加粗＋框線，不加底色 */
function styleHeaderCell(cell: ExcelJS.Cell) {
  cell.font = HEADER_FONT
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.border = THIN_BORDER
}

function buildingLabel(name: string): string {
  const n = name.trim()
  if (!n) return '—'
  return /棟$/.test(n) ? n : `${n}棟`
}

function compareUnits(a: Unit, b: Unit, buildingOrder: Map<string, number>): number {
  const bo =
    (buildingOrder.get(a.buildingId) ?? 999) - (buildingOrder.get(b.buildingId) ?? 999)
  if (bo !== 0) return bo
  const fo = floorRank(b.floor) - floorRank(a.floor)
  if (fo !== 0) return fo
  return a.code.localeCompare(b.code, 'zh-Hant', { numeric: true })
}

function unitDefects(defects: Defect[], unitId: string): Defect[] {
  return defects.filter((d) => d.unitId === unitId && d.status !== 'voided')
}

/** 該戶是否已開始查驗（有進度或有缺失） */
export function unitHasBeenInspected(project: ProjectState, unit: Unit): boolean {
  if (!unit.active) return false
  const prog = unitProgress(unit, project)
  return prog.status !== 'not_started' && prog.status !== 'na'
}

/** 將缺失對到細項：優先 checklistItemId，否則同大項名稱模糊比對 */
function resolveItemId(
  defect: Defect,
  items: ChecklistItem[],
): string | undefined {
  if (defect.checklistItemId) {
    const hit = items.find((i) => i.id === defect.checklistItemId)
    if (hit) return hit.id
  }
  const sameCat = items.filter((i) => i.categoryId === defect.categoryId && i.active)
  const desc = (defect.description || '').trim()
  if (!desc) return sameCat[0]?.id
  const exact = sameCat.find((i) => i.description.trim() === desc)
  if (exact) return exact.id
  const soft = sameCat.find(
    (i) => desc.includes(i.description.trim()) || i.description.trim().includes(desc),
  )
  return soft?.id
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

function addSummaryMatrixSheet(
  workbook: ExcelJS.Workbook,
  project: ProjectState,
  projectLabel: string,
  units: Unit[],
  usedNames: Set<string>,
) {
  const buildingIds = new Set(units.map((u) => u.buildingId))
  const buildings = [...project.buildings]
    .filter((b) => b.active && buildingIds.has(b.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const floors = [...new Set(units.map((u) => u.floor))].sort(
    (a, b) => floorRank(b) - floorRank(a),
  )

  const sheet = workbook.addWorksheet(sanitizeSheetName('總表', usedNames))
  const colCount = 1 + Math.max(1, units.length)

  sheet.getCell(1, 1).value = projectLabel
    ? `${projectLabel}｜甲山林總表（樓層 × 棟戶缺失數）`
    : '甲山林總表（樓層 × 棟戶缺失數）'
  sheet.getCell(1, 1).font = { bold: true, size: 13 }
  sheet.mergeCells(1, 1, 1, Math.max(2, colCount))

  sheet.getCell(2, 1).value = '數字＝未改善缺失數（不含已改善、已作廢）；僅含本次匯出戶別'
  sheet.getCell(2, 1).font = { color: { argb: 'FF666666' }, size: 10 }
  sheet.mergeCells(2, 1, 2, Math.max(2, colCount))

  // 列 4：棟別；列 5：戶別（依實際匯出戶展開）
  const rowB = sheet.getRow(4)
  const rowU = sheet.getRow(5)
  rowB.getCell(1).value = '棟別'
  rowU.getCell(1).value = '樓層＼戶別'
  styleHeaderCell(rowB.getCell(1))
  styleHeaderCell(rowU.getCell(1))

  let col = 2
  for (const b of buildings) {
    const codes = [
      ...new Set(
        units
          .filter((u) => u.buildingId === b.id)
          .map((u) => u.code)
          .sort((a, c) => a.localeCompare(c, 'zh-Hant', { numeric: true })),
      ),
    ]
    if (codes.length === 0) continue
    const start = col
    const end = col + codes.length - 1
    rowB.getCell(start).value = buildingLabel(b.name)
    if (end > start) sheet.mergeCells(4, start, 4, end)
    for (let c = start; c <= end; c += 1) styleHeaderCell(rowB.getCell(c))
    codes.forEach((code, idx) => {
      rowU.getCell(start + idx).value = code
      styleHeaderCell(rowU.getCell(start + idx))
      sheet.getColumn(start + idx).width = 8
    })
    col = end + 1
  }
  sheet.getColumn(1).width = 12
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 5 }]

  floors.forEach((floor, floorIdx) => {
    const row = sheet.getRow(6 + floorIdx)
    row.getCell(1).value = floor
    row.getCell(1).font = { bold: true }
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell(1).border = THIN_BORDER

    let c = 2
    for (const b of buildings) {
      const codes = [
        ...new Set(
          units
            .filter((u) => u.buildingId === b.id)
            .map((u) => u.code)
            .sort((a, x) => a.localeCompare(x, 'zh-Hant', { numeric: true })),
        ),
      ]
      for (const code of codes) {
        const cell = row.getCell(c)
        cell.border = THIN_BORDER
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        const unit = units.find(
          (u) => u.buildingId === b.id && u.floor === floor && u.code === code,
        )
        if (!unit) {
          cell.value = '—'
          cell.font = { color: { argb: 'FFAAAAAA' } }
        } else {
          cell.value = openDefectCount(project.defects, unit.id)
        }
        c += 1
      }
    }
  })
}

function addUnitSheet(
  workbook: ExcelJS.Workbook,
  project: ProjectState,
  unit: Unit,
  projectLabel: string,
  usedNames: Set<string>,
) {
  const areas = getUnitAreas(unit, project.areas, project.areaTemplates ?? [])
  const cats = project.categories
    .filter((c) => c.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const items = project.checklistItems
    .filter((i) => i.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const buildingName =
    project.buildings.find((b) => b.id === unit.buildingId)?.name ?? unit.buildingName
  const sheetName = sanitizeSheetName(
    `${buildingName}${unit.floor}${unit.code}`,
    usedNames,
  )
  const sheet = workbook.addWorksheet(sheetName)

  // 標題列：自主驗屋｜專案名稱｜棟｜戶｜樓（不再顯示專案代碼／區）
  const title = [
    '自主驗屋',
    projectLabel || '專案',
    buildingLabel(buildingName),
    `${unit.code}戶`,
    unit.floor.includes('樓') || /F$/i.test(unit.floor) ? unit.floor : `${unit.floor}樓`,
  ]
  title.forEach((text, idx) => {
    const cell = sheet.getCell(1, idx + 1)
    cell.value = text
    cell.font = { bold: true, size: 12 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = THIN_BORDER
  })
  sheet.getRow(1).height = 22

  // 表頭兩列：區域名 + 編號／數量（無底色）
  const head1 = sheet.getRow(3)
  const head2 = sheet.getRow(4)
  head1.getCell(1).value = '大項'
  head1.getCell(2).value = '查驗項目'
  sheet.mergeCells(3, 1, 4, 1)
  sheet.mergeCells(3, 2, 4, 2)
  styleHeaderCell(head1.getCell(1))
  styleHeaderCell(head1.getCell(2))
  styleHeaderCell(head2.getCell(1))
  styleHeaderCell(head2.getCell(2))

  areas.forEach((area, idx) => {
    const c1 = 3 + idx * 2
    const c2 = c1 + 1
    head1.getCell(c1).value = area
    sheet.mergeCells(3, c1, 3, c2)
    styleHeaderCell(head1.getCell(c1))
    styleHeaderCell(head1.getCell(c2))
    head2.getCell(c1).value = '編號'
    head2.getCell(c2).value = '數量'
    styleHeaderCell(head2.getCell(c1))
    styleHeaderCell(head2.getCell(c2))
  })

  const totalCol = 3 + areas.length * 2
  head1.getCell(totalCol).value = '總數數量'
  sheet.mergeCells(3, totalCol, 4, totalCol)
  styleHeaderCell(head1.getCell(totalCol))
  styleHeaderCell(head2.getCell(totalCol))

  sheet.getColumn(1).width = 10
  sheet.getColumn(2).width = 36
  for (let i = 0; i < areas.length * 2; i += 1) {
    sheet.getColumn(3 + i).width = i % 2 === 0 ? 8 : 6
  }
  sheet.getColumn(totalCol).width = 10

  const defects = unitDefects(project.defects, unit.id)
  const cellMap = new Map<string, { numbers: number[]; count: number }>()
  for (const d of defects) {
    const itemId = resolveItemId(d, items)
    if (!itemId) continue
    const area = (d.area || '').trim()
    if (!area) continue
    const key = `${itemId}|${area}`
    const prev = cellMap.get(key) ?? { numbers: [], count: 0 }
    prev.numbers.push(d.defectNumber)
    prev.count += 1
    cellMap.set(key, prev)
  }

  let rowIdx = 5
  let grandTotal = 0

  for (const cat of cats) {
    const catItems = items.filter((i) => i.categoryId === cat.id)
    if (catItems.length === 0) continue
    const startRow = rowIdx

    for (const item of catItems) {
      const row = sheet.getRow(rowIdx)
      row.getCell(1).value = cat.name
      row.getCell(2).value = item.description
      row.getCell(1).fill = CAT_FILL
      row.getCell(1).font = { bold: true }
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      row.getCell(1).border = THIN_BORDER
      row.getCell(2).border = THIN_BORDER

      let rowSum = 0
      areas.forEach((area, idx) => {
        const c1 = 3 + idx * 2
        const c2 = c1 + 1
        const hit = cellMap.get(`${item.id}|${area}`)
        const numCell = row.getCell(c1)
        const qtyCell = row.getCell(c2)
        numCell.border = THIN_BORDER
        qtyCell.border = THIN_BORDER
        numCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        qtyCell.alignment = { horizontal: 'center', vertical: 'middle' }
        if (hit && hit.count > 0) {
          numCell.value = hit.numbers.sort((a, b) => a - b).join(',')
          qtyCell.value = hit.count
          rowSum += hit.count
        }
      })

      const totalCell = row.getCell(totalCol)
      totalCell.value = rowSum || ''
      totalCell.border = THIN_BORDER
      totalCell.alignment = { horizontal: 'center', vertical: 'middle' }
      totalCell.font = { bold: true }
      grandTotal += rowSum
      rowIdx += 1
    }

    if (catItems.length > 1) {
      sheet.mergeCells(startRow, 1, rowIdx - 1, 1)
    }
  }

  const sumRow = sheet.getRow(rowIdx + 1)
  sumRow.getCell(1).value = '共計'
  sumRow.getCell(1).font = { bold: true }
  sumRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.mergeCells(rowIdx + 1, 1, rowIdx + 1, 2)
  for (let c = 1; c <= totalCol; c += 1) {
    sumRow.getCell(c).border = THIN_BORDER
  }
  sumRow.getCell(totalCol).value = grandTotal
  sumRow.getCell(totalCol).font = { bold: true, size: 12 }
  sumRow.getCell(totalCol).alignment = { horizontal: 'center', vertical: 'middle' }

  sheet.getCell(rowIdx + 3, 1).value = projectLabel ? `專案：${projectLabel}` : ''
  sheet.getCell(rowIdx + 3, 1).font = { color: { argb: 'FF666666' }, size: 9 }

  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }]
}

/** 甲山林格式：總表矩陣 + 每戶一張分頁 */
export async function exportJiaShanLinExcel(
  project: ProjectState,
  options?: {
    displayName?: string
    /** 指定要匯出的戶別；空／未傳則預設「已查驗過」的戶 */
    unitIds?: string[]
  },
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CI 現場查驗'
  workbook.created = new Date()

  const projectLabel = resolveExportProjectLabel(project, options?.displayName)
  const usedNames = new Set<string>()

  const buildings = [...project.buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const buildingOrder = new Map(buildings.map((b, i) => [b.id, i]))

  const activeUnits = [...project.units]
    .filter((u) => u.active)
    .sort((a, b) => compareUnits(a, b, buildingOrder))

  const selectedIds = options?.unitIds
  let units: Unit[]
  if (selectedIds && selectedIds.length > 0) {
    const idSet = new Set(selectedIds)
    units = activeUnits.filter((u) => idSet.has(u.id))
  } else {
    units = activeUnits.filter((u) => unitHasBeenInspected(project, u))
  }

  if (units.length === 0) {
    throw new Error('沒有可匯出的戶別（請勾選戶別，或先完成至少一戶查驗）')
  }

  addSummaryMatrixSheet(workbook, project, projectLabel, units, usedNames)

  for (const unit of units) {
    addUnitSheet(workbook, project, unit, projectLabel, usedNames)
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `${projectLabel || '查驗專案'}_甲山林報表_${stamp}.xlsx`
  await downloadWorkbook(workbook, filename)
}
