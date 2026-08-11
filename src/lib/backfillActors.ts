import type { ActivityLog, Defect, ProjectState } from '../types'
import { currentActorName } from './currentActor'

const PLACEHOLDER_ACTORS = new Set([
  '',
  '現場查驗',
  '现场查验',
  'SITE INSPECTION',
  'Site Inspection',
])

export function isPlaceholderActor(name?: string | null): boolean {
  const n = String(name || '').trim()
  if (!n) return true
  return PLACEHOLDER_ACTORS.has(n)
}

/** 回填用的真實姓名：目前登入者（已略過佔位字） */
export function resolveBackfillActorName(fallbackNames: string[] = []): string {
  const current = currentActorName().trim()
  if (!isPlaceholderActor(current)) return current
  for (const n of fallbackNames) {
    const t = String(n || '').trim()
    if (!isPlaceholderActor(t)) return t
  }
  return ''
}

function preferActorName(a?: string | null, b?: string | null): string | undefined {
  const left = (a || '').trim()
  const right = (b || '').trim()
  if (!isPlaceholderActor(left)) return left
  if (!isPlaceholderActor(right)) return right
  return left || right || undefined
}

/** 合併兩筆缺失的查驗人欄位（優先非佔位名） */
export function mergeDefectActorFields(local: Defect, remote: Defect): Pick<
  Defect,
  'createdByName' | 'updatedByName'
> {
  return {
    createdByName: preferActorName(local.createdByName, remote.createdByName),
    updatedByName: preferActorName(local.updatedByName, remote.updatedByName),
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
    })
  }
  // 遠端較長時大致維持遠端順序；否則本機順序
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
 * 把舊資料裡的「現場查驗」佔位名，改成真實查驗人姓名。
 * 回傳 changed > 0 時呼叫端應寫回並上雲。
 */
export function backfillProjectActors(
  state: ProjectState,
  preferredName: string,
): { state: ProjectState; changed: number } {
  const name = preferredName.trim()
  if (isPlaceholderActor(name)) {
    return { state, changed: 0 }
  }

  let changed = 0

  const activities = state.activities.map((a) => {
    if (!isPlaceholderActor(a.actorName)) return a
    changed += 1
    return { ...a, actorName: name }
  })

  const defects = state.defects.map((d) => {
    let next = d
    let touched = false
    if (isPlaceholderActor(d.createdByName)) {
      next = { ...next, createdByName: name }
      touched = true
    }
    if (isPlaceholderActor(d.updatedByName)) {
      next = {
        ...next,
        updatedByName: isPlaceholderActor(next.createdByName)
          ? name
          : (next.createdByName as string),
      }
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

/** 從現有資料推一個可用的回填名（當前使用者無效時） */
export function inferActorNameFromState(state: ProjectState): string {
  const counts = new Map<string, number>()
  const bump = (raw?: string) => {
    const n = (raw || '').trim()
    if (isPlaceholderActor(n)) return
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
