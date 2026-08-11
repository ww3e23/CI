/**
 * 目前操作者顯示名（供專案 store 寫活動／缺失，避免與 auth store 循環依賴）。
 */
type ActorGetter = () => string

let getActor: ActorGetter = () => '現場查驗'

export function bindCurrentActorGetter(fn: ActorGetter) {
  getActor = fn
}

/** 回傳目前登入者姓名；未登入時回退「現場查驗」 */
export function currentActorName(): string {
  try {
    const name = String(getActor() || '').trim()
    return name || '現場查驗'
  } catch {
    return '現場查驗'
  }
}
