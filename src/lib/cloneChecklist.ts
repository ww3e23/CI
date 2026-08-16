import type { ChecklistCategory, ChecklistItem } from '../types'
import { createId } from './id'

/** 從來源專案複製作用中的查驗大項／細項，並重新產生 id（避免跨專案撞 id） */
export function cloneActiveChecklist(source: {
  categories: ChecklistCategory[]
  checklistItems: ChecklistItem[]
}): { categories: ChecklistCategory[]; checklistItems: ChecklistItem[] } {
  const sourceCats = [...source.categories]
    .filter((c) => c.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const catIdMap = new Map<string, string>()
  const categories: ChecklistCategory[] = sourceCats.map((c, idx) => {
    const id = createId('cat')
    catIdMap.set(c.id, id)
    return {
      ...c,
      id,
      sortOrder: idx,
      active: true,
      itemCount: 0,
    }
  })

  const checklistItems: ChecklistItem[] = [...source.checklistItems]
    .filter((i) => i.active && catIdMap.has(i.categoryId))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, idx) => ({
      id: createId('item'),
      categoryId: catIdMap.get(item.categoryId)!,
      description: item.description,
      sortOrder: idx,
      active: true,
    }))

  const countByCat = new Map<string, number>()
  for (const item of checklistItems) {
    countByCat.set(item.categoryId, (countByCat.get(item.categoryId) ?? 0) + 1)
  }
  for (const cat of categories) {
    cat.itemCount = countByCat.get(cat.id) ?? 0
  }

  return { categories, checklistItems }
}

/**
 * 覆蓋套用時：舊的作用中大項／細項改為停用（保留 id，避免缺失關聯斷掉、也避免雲端合併又把舊項加回成重複）。
 */
export function retireActiveChecklist(
  categories: ChecklistCategory[],
  checklistItems: ChecklistItem[],
): { categories: ChecklistCategory[]; checklistItems: ChecklistItem[] } {
  return {
    categories: categories.map((c) => (c.active ? { ...c, active: false } : c)),
    checklistItems: checklistItems.map((i) => (i.active ? { ...i, active: false } : i)),
  }
}

/**
 * 同名且皆為作用中的大項只留一組（細項較多者優先），其餘停用。
 * 用來清掉「匯入後又與雲端舊範本合併」造成的重複門／窗。
 */
export function dedupeActiveCategoriesByName(
  categories: ChecklistCategory[],
  checklistItems: ChecklistItem[],
): { categories: ChecklistCategory[]; checklistItems: ChecklistItem[]; deactivated: number } {
  const activeCats = categories.filter((c) => c.active)
  const groups = new Map<string, ChecklistCategory[]>()
  for (const c of activeCats) {
    const key = c.name.trim().toLocaleLowerCase('zh-Hant')
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }

  const deactivateCatIds = new Set<string>()
  for (const list of groups.values()) {
    if (list.length <= 1) continue
    const ranked = [...list].sort((a, b) => {
      const aCount = checklistItems.filter((i) => i.categoryId === a.id && i.active).length
      const bCount = checklistItems.filter((i) => i.categoryId === b.id && i.active).length
      if (bCount !== aCount) return bCount - aCount
      return a.sortOrder - b.sortOrder
    })
    for (const c of ranked.slice(1)) deactivateCatIds.add(c.id)
  }

  if (deactivateCatIds.size === 0) {
    return { categories, checklistItems, deactivated: 0 }
  }

  const nextCats = categories.map((c) =>
    deactivateCatIds.has(c.id) ? { ...c, active: false } : c,
  )
  const nextItems = checklistItems.map((i) =>
    deactivateCatIds.has(i.categoryId) && i.active ? { ...i, active: false } : i,
  )
  for (const c of nextCats) {
    if (!c.active) continue
    c.itemCount = nextItems.filter((i) => i.categoryId === c.id && i.active).length
  }

  return {
    categories: nextCats,
    checklistItems: nextItems,
    deactivated: deactivateCatIds.size,
  }
}
