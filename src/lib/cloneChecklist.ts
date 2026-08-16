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
