import type { AreaTemplate, ProjectState, Unit } from '../types'

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

/** 此戶是否已手動自訂查驗區域（優先於範本／專案預設） */
export function isUnitAreasCustomized(unit: Unit | undefined | null): boolean {
  return Boolean(unit?.areas && unit.areas.length > 0)
}

/** 此戶是否綁定格局範本（且尚未手動自訂） */
export function isUnitFollowingTemplate(unit: Unit | undefined | null): boolean {
  return Boolean(unit?.areaTemplateId) && !isUnitAreasCustomized(unit)
}

/** 取得某戶可用的查驗區域：手動自訂 ＞ 格局範本 ＞ 專案預設 */
export function getUnitAreas(
  unit: Unit | undefined | null,
  projectAreas: string[] = [],
  templates: AreaTemplate[] = [],
): string[] {
  if (isUnitAreasCustomized(unit)) return [...unit!.areas!]
  if (unit?.areaTemplateId) {
    const tpl = templates.find((t) => t.id === unit.areaTemplateId)
    if (tpl?.areas?.length) return [...tpl.areas]
  }
  if (projectAreas.length > 0) return [...projectAreas]
  return [...DEFAULT_AREAS]
}

/** 清洗區域名稱清單（去空白、去重、保序） */
export function sanitizeAreaList(areas: string[]): string[] {
  const cleaned: string[] = []
  const seen = new Set<string>()
  for (const raw of areas) {
    const name = normalizeAreaName(raw)
    if (!name || seen.has(name)) continue
    seen.add(name)
    cleaned.push(name)
  }
  return cleaned
}

/** 篩選器用：彙整專案預設、範本、各戶自訂與已登錄缺失中的區域名稱 */
export function collectAllAreas(
  state: Pick<ProjectState, 'areas' | 'units' | 'defects'> & {
    areaTemplates?: AreaTemplate[]
  },
): string[] {
  const set = new Set<string>()
  for (const a of state.areas.length ? state.areas : DEFAULT_AREAS) set.add(a)
  for (const t of state.areaTemplates ?? []) {
    for (const a of t.areas) if (a.trim()) set.add(a.trim())
  }
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

/** 下一組格局範本編碼：G01、G02… */
export function nextAreaTemplateCode(templates: AreaTemplate[]): string {
  let max = 0
  for (const t of templates) {
    const m = /^G(\d+)$/i.exec(String(t.code ?? '').trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `G${String(max + 1).padStart(2, '0')}`
}
