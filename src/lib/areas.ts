import type { ProjectState, Unit } from '../types'

export const DEFAULT_AREAS = [
  '玄關',
  '客廳',
  '餐廳',
  '廚房',
  '主臥',
  '臥室1',
  '主浴',
  '客浴',
  '前陽台',
]

/** 取得某戶可用的查驗區域；未自訂時回傳專案預設 */
export function getUnitAreas(
  unit: Unit | undefined | null,
  projectAreas: string[] = [],
): string[] {
  if (unit?.areas && unit.areas.length > 0) return [...unit.areas]
  if (projectAreas.length > 0) return [...projectAreas]
  return [...DEFAULT_AREAS]
}

/** 篩選器用：彙整專案預設、各戶自訂與已登錄缺失中的區域名稱 */
export function collectAllAreas(state: Pick<ProjectState, 'areas' | 'units' | 'defects'>): string[] {
  const set = new Set<string>()
  for (const a of state.areas.length ? state.areas : DEFAULT_AREAS) set.add(a)
  for (const u of state.units) {
    for (const a of u.areas ?? []) if (a.trim()) set.add(a.trim())
  }
  for (const d of state.defects) {
    if (d.area?.trim()) set.add(d.area.trim())
  }
  return [...set]
}

export function normalizeAreaName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}
