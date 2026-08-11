import type { ChecklistItem, Defect } from '../types'

/** 取得缺失對應的查驗細項名稱 */
export function resolveDefectItemLabel(
  defect: Defect,
  items: ChecklistItem[],
): string {
  if (defect.checklistItemId) {
    const item = items.find((i) => i.id === defect.checklistItemId)
    if (item?.description?.trim()) return item.description.trim()
  }
  // 舊資料：說明曾自動帶成「大項｜區域｜細項」
  const parts = defect.description.split('｜').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 3) return parts[parts.length - 1]!
  return ''
}

/**
 * 使用者備註說明（不含自動帶入的大項／區域／細項字串）
 * 若儲存時未填補充說明，回傳空字串。
 */
export function resolveDefectRemark(
  defect: Defect,
  items: ChecklistItem[],
): string {
  const desc = defect.description.trim()
  if (!desc) return ''

  const itemLabel = resolveDefectItemLabel(defect, items)
  const autos = [
    itemLabel ? `${defect.categoryName}｜${defect.area}｜${itemLabel}` : '',
    `${defect.categoryName}｜${defect.area}`,
    itemLabel,
  ].filter(Boolean)

  if (autos.some((a) => a === desc)) return ''

  // 若誤把細項貼在說明前，去掉重複前綴
  if (itemLabel && desc.startsWith(`${itemLabel}｜`)) {
    return desc.slice(itemLabel.length + 1).trim()
  }
  if (itemLabel && desc.startsWith(`${itemLabel} `)) {
    return desc.slice(itemLabel.length).trim()
  }

  return desc
}

export function defectListTitle(defect: Defect, items: ChecklistItem[]): string {
  const item = resolveDefectItemLabel(defect, items)
  if (item) return `#${defect.defectNumber} ${item}`
  // 無細項時至少顯示區域，避免只剩編號
  if (defect.area) return `#${defect.defectNumber} ${defect.area}`
  return `#${defect.defectNumber}`
}

/** 列表／詳情顯示的查驗人員（優先新增者，其次最近修改者） */
export function defectInspectorLabel(defect: Defect): string {
  const created = (defect.createdByName || '').trim()
  const createdAcct = (defect.createdByAccount || '').trim()
  if (created || createdAcct) {
    if (createdAcct && created && created !== createdAcct) return `${created}（${createdAcct}）`
    return createdAcct || created
  }
  const updated = (defect.updatedByName || '').trim()
  const updatedAcct = (defect.updatedByAccount || '').trim()
  if (updated || updatedAcct) {
    if (updatedAcct && updated && updated !== updatedAcct) return `${updated}（${updatedAcct}）`
    return updatedAcct || updated
  }
  return ''
}
