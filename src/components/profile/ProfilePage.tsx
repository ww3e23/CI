import { useState } from 'react'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { firebaseModeLabel, isFirebaseConfigured } from '../../lib/firebase'
import { SettingsPage } from '../settings/SettingsPage'

export function ProfilePage() {
  const projectName = useProjectStore((s) => s.projectName)
  const pushStructureToCloud = useProjectStore((s) => s.pushStructureToCloud)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const cloud = isFirebaseConfigured()
  const mode = firebaseModeLabel()

  return (
    <div className="rise">
      <header style={{ marginBottom: 14 }}>
        <div className="eyebrow">PROFILE</div>
        <h1 className="serif" style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700 }}>我的</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)', fontSize: 13 }}>
          {projectName}
        </p>
      </header>

      <section className="glass" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {cloud ? <Cloud size={20} color="var(--green-deep)" /> : <CloudOff size={20} color="var(--stone)" />}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800 }}>
              {cloud ? 'Firebase 已設定' : '示範模式（本機資料）'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600, marginTop: 2 }}>
              {cloud
                ? '缺失與結構可同步至 Firestore'
                : '複製 .env.example 為 .env.local 並填入 Firebase 設定後即可上雲'}
            </div>
          </div>
          <span className="chip" style={{ minHeight: 32 }}>{mode}</span>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 12 }}
          disabled={!cloud || busy}
          onClick={async () => {
            setBusy(true)
            const r = await pushStructureToCloud()
            setBusy(false)
            setMsg(r.ok ? '結構已同步至雲端' : '同步失敗或尚未設定 Firebase')
          }}
        >
          <RefreshCw size={16} /> 同步棟樓戶結構到雲端
        </button>
        {msg && <div className="sync-hint">{msg}</div>}
      </section>

      <SettingsPage embedded />
    </div>
  )
}
