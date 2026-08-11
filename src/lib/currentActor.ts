/**
 * 目前操作者資訊（供專案 store 寫活動／缺失，避免與 auth store 循環依賴）。
 */
export type ActorInfo = {
  /** 顯示名 */
  name: string
  /** 帳號提示（email 或 login id，例如 a11897） */
  accountHint: string
  /** 是否為系統超級管理者（不應用來當現場查驗人回填） */
  isSystemAdmin: boolean
}

type ActorGetter = () => ActorInfo

const FALLBACK: ActorInfo = {
  name: '現場查驗',
  accountHint: '',
  isSystemAdmin: false,
}

let getActor: ActorGetter = () => FALLBACK

export function bindCurrentActorGetter(fn: ActorGetter) {
  getActor = fn
}

export function currentActorInfo(): ActorInfo {
  try {
    const info = getActor()
    const name = String(info?.name || '').trim() || '現場查驗'
    return {
      name,
      accountHint: String(info?.accountHint || '').trim(),
      isSystemAdmin: Boolean(info?.isSystemAdmin),
    }
  } catch {
    return FALLBACK
  }
}

/** 回傳目前登入者姓名；未登入時回退「現場查驗」 */
export function currentActorName(): string {
  return currentActorInfo().name
}
