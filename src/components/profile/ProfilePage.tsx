import { useState } from 'react'
import { ChevronDown, Cloud, CloudOff, Pencil, RefreshCw } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import {
  useAuthStore,
  useCurrentProject,
  useCurrentRole,
  useCurrentUser,
  userCanAccessProject,
} from '../../store/useAuthStore'
import { firebaseModeLabel, isFirebaseConfigured } from '../../lib/firebase'
import { SettingsPage } from '../settings/SettingsPage'
import { ProjectSwitcher } from '../home/ProjectSwitcher'
import { ROLE_LABEL, ROLE_TONE } from '../../types/auth'

export function ProfilePage() {
  const user = useCurrentUser()
  const role = useCurrentRole()
  const project = useCurrentProject()
  const members = useAuthStore((s) => s.members)
  const projects = useAuthStore((s) => s.projects)
  const users = useAuthStore((s) => s.users)
  const switchProject = useAuthStore((s) => s.switchProject)
  const refreshDirectory = useAuthStore((s) => s.refreshDirectory)
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName)
  const logout = useAuthStore((s) => s.logout)
  const pushStructureToCloud = useProjectStore((s) => s.pushStructureToCloud)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.displayName ?? '')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const cloud = isFirebaseConfigured()
  const mode = firebaseModeLabel()

  const myProjects = projects.filter((p) => userCanAccessProject(user, p.id, members, users))

  if (!user) return null

  const initial = user.displayName.slice(0, 1)

  return (
    <div className="rise">
      <header style={{ marginBottom: 14 }}>
        <div className="eyebrow">MY ACCOUNT</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              background: 'var(--green-deep)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              fontSize: 22,
            }}
          >
            {initial}
          </div>
          <div>
            <div className="serif" style={{ fontSize: 22, fontWeight: 700 }}>{user.displayName}</div>
            <div style={{ color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>{user.email}</div>
          </div>
        </div>
      </header>

      <section className="glass" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>顯示名稱</div>
            {!editing ? (
              <div style={{ fontWeight: 800, marginTop: 4 }}>{user.displayName}</div>
            ) : (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ marginTop: 6, minHeight: 40, borderRadius: 12, border: '1px solid rgba(34,41,31,0.12)', padding: '0 10px', width: '100%' }}
              />
            )}
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
              此名稱會出現在缺失紀錄與操作歷程
            </div>
          </div>
          {!editing ? (
            <button type="button" className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => { setName(user.displayName); setEditing(true) }}>
              <Pencil size={14} /> 編輯
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: 40 }}
              onClick={() => {
                updateDisplayName(name)
                setEditing(false)
              }}
            >
              儲存
            </button>
          )}
        </div>
      </section>

      <div className="section-row">
        <h2>{user.systemAdmin ? '全部專案' : '所屬專案與權限'}</h2>
        <button
          type="button"
          className="chip"
          style={{ minHeight: 34 }}
          onClick={() => setProjectOpen(true)}
        >
          切換專案 <ChevronDown size={14} />
        </button>
      </div>

      {project && (
        <section className="glass-green" style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>目前專案</div>
          <div className="serif" style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
            {project.name}
          </div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9, fontWeight: 600 }}>
            {project.code} · {project.location}
            {role ? ` · ${ROLE_LABEL[role]}` : ''}
          </div>
          <div style={{ fontSize: 11, marginTop: 10, opacity: 0.88 }}>
            調整棟別／樓層／戶別結構前，請先確認已切到正確專案。點下方卡片即可切換。
          </div>
        </section>
      )}

      <p style={{ margin: '0 0 10px', color: 'var(--ink-soft)', fontSize: 12 }}>
        {user.systemAdmin
          ? '系統管理者可進入任一專案查看與設定。點專案卡片即可切換。'
          : '權限由各專案管理者於後台指派，無法自行變更。點專案卡片可直接切換。'}
      </p>
      {cloud && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%', marginBottom: 10, minHeight: 40 }}
          onClick={() => {
            void (async () => {
              setBusy(true)
              const r = await refreshDirectory()
              setBusy(false)
              setMsg(r.ok ? '已同步雲端專案與指派' : r.error || '同步失敗')
            })()
          }}
          disabled={busy}
        >
          <RefreshCw size={14} /> {busy ? '同步中…' : '重新同步專案（手機／電腦共用）'}
        </button>
      )}
      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {myProjects.map((p) => {
          const r =
            user.systemAdmin
              ? 'admin'
              : members.find((m) => m.userId === user.id && m.projectId === p.id)?.role
          if (!r) return null
          const isCurrent = project?.id === p.id
          return (
            <button
              key={p.id}
              type="button"
              className={isCurrent ? 'glass-green' : 'glass'}
              style={{
                padding: 12,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                alignItems: 'center',
                textAlign: 'left',
                borderRadius: 20,
              }}
              onClick={() => switchProject(p.id)}
            >
              <div>
                <div style={{ fontWeight: 800 }}>
                  {p.name}
                  {isCurrent ? ' · 目前' : ''}
                </div>
                <div style={{ fontSize: 12, opacity: isCurrent ? 0.9 : 1, color: isCurrent ? undefined : 'var(--ink-soft)', fontWeight: 600 }}>
                  {p.code}
                </div>
              </div>
              <span className={`role-tag ${ROLE_TONE[r]}`}>{ROLE_LABEL[r]}</span>
            </button>
          )
        })}
      </div>

      {(role === 'admin' || user.systemAdmin) && (
        <section className="glass" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {cloud ? <Cloud size={20} color="var(--green-deep)" /> : <CloudOff size={20} color="var(--stone)" />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800 }}>
                {cloud ? 'Firebase 已設定' : '示範模式（本機資料）'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600, marginTop: 2 }}>
                {cloud
                  ? '管理者可見：缺失與照片同步狀態'
                  : '管理者可見：尚未接上 Firebase'}
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
      )}

      <section className="glass" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>安裝到手機</div>
        <p style={{ margin: '0 0 10px', color: 'var(--ink-soft)', fontSize: 12, lineHeight: 1.45 }}>
          Android 請用 Chrome 開啟本站，點下方橫幅「安裝」，或選單 ⋮ →「安裝應用程式／加到主畫面」。
        </p>
      </section>

      {(role === 'admin' || user.systemAdmin) && (
        <a
          href="#/admin"
          className="btn btn-ghost"
          style={{ width: '100%', marginBottom: 10, textDecoration: 'none' }}
        >
          開啟驗屋後台（桌面版）
        </a>
      )}

      <SettingsPage embedded />

      <button
        type="button"
        className="btn"
        style={{
          width: '100%',
          marginTop: 16,
          background: 'rgba(174,76,59,0.12)',
          color: 'var(--terracotta)',
          fontWeight: 800,
        }}
        onClick={() => void logout()}
      >
        登出
      </button>

      {projectOpen && <ProjectSwitcher onClose={() => setProjectOpen(false)} />}
    </div>
  )
}
