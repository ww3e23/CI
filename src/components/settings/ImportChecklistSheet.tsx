import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useAuthStore, useCurrentProject, userCanAccessProject } from '../../store/useAuthStore'
import { useProjectStore } from '../../store/useProjectStore'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

/** 從其他專案載入查驗大項／細項套用到目前專案 */
export function ImportChecklistSheet({ onClose }: { onClose: () => void }) {
  const current = useCurrentProject()
  const projects = useAuthStore((s) => s.projects)
  const members = useAuthStore((s) => s.members)
  const users = useAuthStore((s) => s.users)
  const userId = useAuthStore((s) => s.currentUserId)
  const me = users.find((u) => u.id === userId)
  const importChecklistFromProject = useProjectStore((s) => s.importChecklistFromProject)
  const hasActive = useProjectStore((s) => s.categories.some((c) => c.active))
  const bundles = useProjectStore((s) => s.bundles)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const options = useMemo(
    () =>
      projects
        .filter((p) => {
          if (p.id === current?.id) return false
          if (p.status !== 'active' && !me?.systemAdmin) return false
          return userCanAccessProject(me, p.id, members, users)
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')),
    [projects, current?.id, me, members, users],
  )

  async function runImport() {
    if (!selectedId || busy) return
    const source = options.find((p) => p.id === selectedId)
    if (!source) return

    if (hasActive) {
      const ok = confirm(
        `要以「${source.name}」的查驗大項／細項覆蓋目前專案嗎？\n\n` +
          `會複製一份到本專案（之後可自行修改）。\n` +
          `已寫過的缺失不會自動改掛新細項。`,
      )
      if (!ok) return
    }

    setBusy(true)
    try {
      const mode = hasActive ? 'replace' : 'fill-if-empty'
      const res = await importChecklistFromProject(selectedId, mode)
      if (!res.ok) {
        window.alert(res.reason || '載入失敗')
        return
      }
      window.alert(
        `已套用「${source.name}」：${res.importedCategories ?? 0} 個大項、${res.importedItems ?? 0} 個細項`,
      )
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={busy ? () => undefined : onClose} aria-label="從其他專案載入查驗範本" variant="bottom">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
        <TitleHint
          as="h3"
          className="serif"
          style={{ margin: 0, fontSize: 20 }}
          hint="選擇一個已寫好查驗細項的專案，複製其大項／細項到目前專案。複製後可再自行修改。"
        >
          從其他專案載入
        </TitleHint>
        {!busy && (
          <button type="button" className="icon-btn" aria-label="關閉" onClick={onClose}>
            <X size={18} />
          </button>
        )}
      </div>

      {options.length === 0 ? (
        <p style={{ margin: '14px 0 0', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 14 }}>
          目前沒有其他可選專案。請先在後台建立／開啟另一個專案並設定好查驗範本。
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 14, maxHeight: '50vh', overflow: 'auto' }}>
          {options.map((p) => {
            const cached = Boolean(bundles[p.id])
            const on = selectedId === p.id
            return (
              <button
                key={p.id}
                type="button"
                className={on ? 'glass-green' : 'glass'}
                style={{
                  padding: 12,
                  textAlign: 'left',
                  borderRadius: 16,
                  display: 'grid',
                  gap: 2,
                }}
                disabled={busy}
                onClick={() => setSelectedId(p.id)}
              >
                <span style={{ fontWeight: 800, fontSize: 15 }}>{p.name}</span>
                <span style={{ color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
                  {p.code ? `${p.code} · ` : ''}
                  {cached ? '本機有快取' : '將從雲端讀取'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', marginTop: 14 }}
        disabled={busy || !selectedId}
        onClick={() => void runImport()}
      >
        {busy ? '載入中…' : hasActive ? '覆蓋套用到本專案' : '載入到本專案'}
      </button>
    </Modal>
  )
}
