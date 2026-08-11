import type { ActivityLog, Defect, ProjectState } from '../types'
import { currentActorInfo, currentActorName } from './currentActor'

/** 佔位／誤回填名：應被真實現場帳號覆寫 */
const INVALID_ACTOR_NAMES = new Set([
  '',
  '現場查驗',
  '现场查验',
  'SITE INSPECTION',
  'Site Inspection',
  '系統管理者',
  '系统管理者',
  'System Admin',
  'admin',
])

export function isPlaceholderActor(name?: string | null): boolean {
  const n = String(name || '').trim()
  if (!n) return true
  return INVALID_ACTOR_NAMES.has(n)
}

/** 是否為「誤用系統管理者」之類、不該出現在現場查驗紀錄的名字 */
export function isInvalidInspectorName(name?: string | null): boolean {
  return isPlaceholderActor(name)
}

/** 回填用的真實姓名：必須是非系統管理者的現場帳號 */
export function resolveBackfillActorName(fallbackNames: string[] = []): string {
  const info = currentActorInfo()
  // 系統管理者帳號登入時，禁止拿「系統管理者」去蓋現場紀錄
  if (!info.isSystemAdmin && !isInvalidInspectorName(info.name)) {
    return info.name
  }
  // 若顯示名無效，但帳號提示可用（例如 a11897）
  if (!info.isSystemAdmin && info.accountHint && !isInvalidInspectorName(info.accountHint)) {
    return info.accountHint
  }
  for (const n of fallbackNames) {
    const t = String(n || '').trim()
    if (!isInvalidInspectorName(t)) return t
  }
  return ''
}

function preferActorName(a?: string | null, b?: string | null): string | undefined {
  const left = (a || '').trim()
  const right = (b || '').trim()
  if (!isInvalidInspectorName(left)) return left
  if (!isInvalidInspectorName(right)) return right
  return undefined
}

/** 合併兩筆缺失的查驗人欄位（優先真實現場人名） */
export function mergeDefectActorFields(local: Defect, remote: Defect): Pick<
  Defect,
  'createdByName' | 'updatedByName' | 'createdByAccount' | 'updatedByAccount'
> {
  return {
    createdByName: preferActorName(local.createdByName, remote.createdByName),
    updatedByName: preferActorName(local.updatedByName, remote.updatedByName),
    createdByAccount:
      (local.createdByAccount || '').trim() ||
      (remote.createdByAccount || '').trim() ||
      undefined,
    updatedByAccount:
      (local.updatedByAccount || '').trim() ||
      (remote.updatedByAccount || '').trim() ||
      undefined,
  }
}

/** 合併活動：同 id 時保留真實查驗人名 */
export function mergeActivityLists(
  local: ActivityLog[],
  remote: ActivityLog[],
): ActivityLog[] {
  const map = new Map<string, ActivityLog>()
  for (const a of local) map.set(a.id, a)
  for (const a of remote) {
    const prev = map.get(a.id)
    if (!prev) {
      map.set(a.id, a)
      continue
    }
    map.set(a.id, {
      ...prev,
      ...a,
      actorName:
        preferActorName(prev.actorName, a.actorName) ||
        a.actorName ||
        prev.actorName,
      actorAccount:
        (prev.actorAccount || '').trim() ||
        (a.actorAccount || '').trim() ||
        undefined,
    })
  }
  const preferRemote = remote.length >= local.length
  const order = preferRemote ? remote.map((a) => a.id) : local.map((a) => a.id)
  const seen = new Set<string>()
  const out: ActivityLog[] = []
  for (const id of order) {
    const hit = map.get(id)
    if (!hit || seen.has(id)) continue
    seen.add(id)
    out.push(hit)
  }
  for (const [id, a] of map) {
    if (seen.has(id)) continue
    out.push(a)
  }
  return out.slice(0, 40)
}

/**
 * 把舊資料裡的佔位名／誤標「系統管理者」，改成真實現場查驗人。
 */
export function backfillProjectActors(
  state: ProjectState,
  preferredName: string,
  preferredAccount = '',
): { state: ProjectState; changed: number } {
  const name = preferredName.trim()
  const account = preferredAccount.trim()
  if (isInvalidInspectorName(name) && isInvalidInspectorName(account)) {
    return { state, changed: 0 }
  }
  const labelName = !isInvalidInspectorName(name) ? name : account
  if (!labelName) return { state, changed: 0 }

  let changed = 0

  const activities = state.activities.map((a) => {
    const nameBad = isInvalidInspectorName(a.actorName)
    const accountMissing = !String(a.actorAccount || '').trim() && Boolean(account)
    if (!nameBad && !accountMissing) return a
    changed += 1
    return {
      ...a,
      actorName: nameBad ? labelName : a.actorName,
      actorAccount: a.actorAccount || account || undefined,
    }
  })

  const defects = state.defects.map((d) => {
    let next = d
    let touched = false
    if (isInvalidInspectorName(d.createdByName)) {
      next = {
        ...next,
        createdByName: labelName,
        createdByAccount: account || next.createdByAccount,
      }
      touched = true
    } else if (!d.createdByAccount && account) {
      next = { ...next, createdByAccount: account }
      touched = true
    }
    if (isInvalidInspectorName(d.updatedByName)) {
      next = {
        ...next,
        updatedByName: isInvalidInspectorName(next.createdByName)
          ? labelName
          : (next.createdByName as string),
        updatedByAccount: account || next.updatedByAccount || next.createdByAccount,
      }
      touched = true
    } else if (!d.updatedByAccount && account) {
      next = { ...next, updatedByAccount: account }
      touched = true
    }
    if (touched) changed += 1
    return next
  })

  if (changed === 0) return { state, changed: 0 }
  return {
    state: {
      ...state,
      activities,
      defects,
    },
    changed,
  }
}

/** 從現有資料推一個可用的回填名（排除系統管理者／佔位） */
export function inferActorNameFromState(state: ProjectState): string {
  const counts = new Map<string, number>()
  const bump = (raw?: string) => {
    const n = (raw || '').trim()
    if (isInvalidInspectorName(n)) return
    counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  for (const a of state.activities) bump(a.actorName)
  for (const d of state.defects) {
    bump(d.createdByName)
    bump(d.updatedByName)
  }
  let best = ''
  let bestN = 0
  for (const [n, c] of counts) {
    if (c > bestN) {
      best = n
      bestN = c
    }
  }
  return best
}

/** @deprecated 用 currentActorInfo；保留相容 */
export { currentActorName }
