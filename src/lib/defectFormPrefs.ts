import { CI_PROJECT_STORAGE_KEY } from './storageKeys'

const LAST_AREA_KEY = `${CI_PROJECT_STORAGE_KEY}:last-defect-area`

/** 讀取上次新增缺失時選的區域（本機） */
export function readLastDefectArea(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const v = localStorage.getItem(LAST_AREA_KEY)?.trim()
    return v || null
  } catch {
    return null
  }
}

/** 記住新增缺失時選的區域，供下次預設 */
export function rememberLastDefectArea(area: string): void {
  const v = area.trim()
  if (!v || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LAST_AREA_KEY, v)
  } catch {
    /* ignore quota */
  }
}

/** 在可用區域中挑預設：優先上次選的，否則第二項／第一項 */
export function pickDefaultDefectArea(areas: string[]): string {
  if (!areas.length) return '客廳'
  const last = readLastDefectArea()
  if (last && areas.includes(last)) return last
  return areas[1] ?? areas[0] ?? '客廳'
}
