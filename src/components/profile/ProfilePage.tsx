import { useState } from 'react'
import { ChevronDown, Cloud, CloudOff, CloudUpload, Pencil, RefreshCw } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import {
  useAuthStore,
  useCurrentProject,
  useCurrentRole,
  useCurrentUser,
} from '../../store/useAuthStore'
import { firebaseModeLabel, isFirebaseConfigured } from '../../lib/firebase'
import { APP_VERSION } from '../../lib/appVersion'
import { syncProjectPhotosToDrive } from '../../services/driveSync'
import { SettingsPage } from '../settings/SettingsPage'
import { ProjectSwitcher } from '../home/ProjectSwitcher'
import { forceReloadApp } from '../pwa/UpdateAppBanner'
import { ROLE_LABEL } from '../../types/auth'
import { TitleHint } from '../ui/TitleHint'

export function ProfilePage() {
  const user = useCurrentUser()
  const role = useCurrentRole()
  const project = useCurrentProject()
  const refreshDirectory = useAuthStore((s) => s.refreshDirectory)
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName)
  const logout = useAuthStore((s) => s.logout)
  const pushStructureToCloud = useProjectStore((s) => s.pushStructureToCloud)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.displayName ?? '')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [driveSyncing, setDriveSyncing] = useState(false)
  const [driveMsg, setDriveMsg] = useState('')
  const [projectOpen, setProjectOpen] = useState(false)
  const cloud = isFirebaseConfigured()
  const mode = firebaseModeLabel()

  if (!user) return null

  const initial = user.displayName.slice(0, 1)
  const canSyncDrive =
    Boolean(project) &&
    (role === 'admin' || role === 'inspector' || Boolean(user.systemAdmin))

  async function runDriveSync() {
    if (!project) return
    if (!project.driveFolderId) {
      setDriveMsg('此專案尚未綁定雲端硬碟資料夾，請請後台管理者先設定資料夾網址。')
      return
    }
    if (!project.driveOwnerConnected) {
      setDriveMsg(
        '後台尚未「綁定雲端硬碟擁有者」。請管理者到專案設定完成一次 Google 授權後，現場即可免登同步。',
      )
      return
    }
    if (driveSyncing) return
    const ok = window.confirm(
      `將立刻掃描並同步「${project.name}」照片到雲端硬碟。\n平時系統改為每天批次同步以節省費用；此按鈕適合收工後一次補齊。\n\n會檢查雲端硬碟現況並補還沒有的檔案，不會刪除既有資料。`,
    )
    if (!ok) return

    setDriveSyncing(true)
    setDriveMsg('同步中，照片多時可能需要幾分鐘，請勿關閉頁面…')
    try {
      const res = await syncProjectPhotosToDrive(project.id, { force: true })
      if (!res.ok || !res.result) {
        setDriveMsg(res.error || '同步失敗')
        return
      }
      const r = res.result
      const errHint =
        r.errors.length > 0 ? `；部分失敗 ${r.errors.length} 筆` : ''
      setDriveMsg(
        `同步完成：新增 ${r.uploaded} 張、略過已存在 ${r.skipped} 張、掃描 ${r.scanned} 張` +
          (r.cleanedVoided ? `、清除已刪除 ${r.cleanedVoided} 筆` : '') +
          (r.cleanedDupFolders ? `、清除重複資料夾 ${r.cleanedDupFolders} 個` : '') +
          errHint,
      )
    } catch (err) {
      setDriveMsg(String((err as Error)?.message ?? err))
    } finally {
      setDriveSyncing(false)
    }
  }

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
            <TitleHint
              as="div"
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}
              hint="此名稱會出現在缺失紀錄與操作歷程。"
            >
              顯示名稱
            </TitleHint>
            {!editing ? (
              <div style={{ fontWeight: 800, marginTop: 4 }}>{user.displayName}</div>
            ) : (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ marginTop: 6, minHeight: 40, borderRadius: 12, border: '1px solid rgba(34,41,31,0.12)', padding: '0 10px', width: '100%' }}
              />
            )}
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
        <TitleHint
          as="h2"
          hint={
            user.systemAdmin
              ? '系統管理者可進入任一專案。要換專案請按右側「切換專案」。'
              : '權限由後台指派。要換專案請按右側「切換專案」。'
          }
        >
          目前專案
        </TitleHint>
        <button
          type="button"
          className="chip"
          style={{ minHeight: 34 }}
          onClick={() => setProjectOpen(true)}
        >
          切換專案 <ChevronDown size={14} />
        </button>
      </div>

      {project ? (
        <section className="glass-green" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>進行中</div>
          <div className="serif" style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
            {project.name}
          </div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9, fontWeight: 600 }}>
            {project.code} · {project.location}
            {role ? ` · ${ROLE_LABEL[role]}` : ''}
          </div>
        </section>
      ) : (
        <section className="glass" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: 'var(--ink-soft)' }}>尚未選擇專案</div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => setProjectOpen(true)}
          >
            選擇專案
          </button>
        </section>
      )}
      <SettingsPage embedded />

      {cloud && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%', marginTop: 14, marginBottom: 14, minHeight: 40 }}
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

      {canSyncDrive && (
        <section className="glass" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CloudUpload size={20} color="var(--green-deep)" />
            <div style={{ flex: 1 }}>
              <TitleHint
                as="div"
                style={{ fontWeight: 800 }}
                hint="查驗時照片先存 Firebase；系統每天批次寫入雲端硬碟。若要立刻上 Drive，再按「立即同步雲端硬碟」。"
              >
                雲端硬碟每日同步
              </TitleHint>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', marginTop: 4 }}>
                {!project?.driveFolderId
                  ? '尚未綁定資料夾（請後台管理者先設定）'
                  : project.driveOwnerConnected
                    ? `已綁定擁有者${project.driveOwnerEmail ? `（${project.driveOwnerEmail}）` : ''}：每天自動批次同步（不再即時上傳，較省費用）`
                    : '資料夾已設，但後台尚未綁定擁有者（請管理者先授權一次）'}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 12 }}
            disabled={
              !project?.driveFolderId ||
              !project?.driveOwnerConnected ||
              driveSyncing ||
              !cloud
            }
            onClick={() => void runDriveSync()}
          >
            <CloudUpload size={16} />
            {driveSyncing ? '同步中…' : '立即同步雲端硬碟'}
          </button>
          {project?.driveFolderUrl && (
            <a
              className="btn btn-ghost"
              href={project.driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                width: '100%',
                marginTop: 8,
                textDecoration: 'none',
                minHeight: 40,
              }}
            >
              開啟雲端硬碟資料夾
            </a>
          )}
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: 'var(--ink-soft)',
              fontWeight: 600,
              lineHeight: 1.5,
            }}
          >
            資料夾結構：棟別 → 樓層 → 戶別 → 大項 → <code>#編號 小項名稱 備註</code>（同小項多編號會分開）
            <br />
            後台綁定擁有者後：拍照自動上傳；刪除／改備註會即時對齊資料夾（另有定時清理）。
          </div>
          {driveMsg && (
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--green-deep)',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.45,
              }}
            >
              {driveMsg}
            </div>
          )}
        </section>
      )}

      {(role === 'admin' || user.systemAdmin) && (
        <section className="glass" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {cloud ? <Cloud size={20} color="var(--green-deep)" /> : <CloudOff size={20} color="var(--stone)" />}
            <div style={{ flex: 1 }}>
              <TitleHint
                as="div"
                style={{ fontWeight: 800 }}
                hint={
                  cloud
                    ? '變更會自動同步雲端；也可手動強制推送。'
                    : '管理者可見：尚未接上 Firebase，資料僅存本機。'
                }
              >
                {cloud ? 'Firebase 已設定' : '示範模式（本機資料）'}
              </TitleHint>
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
              setMsg(r.ok ? '已強制同步至雲端' : '同步失敗或尚未設定 Firebase')
            }}
          >
            <RefreshCw size={16} /> 立即同步全部資料
          </button>
          {msg && <div className="sync-hint">{msg}</div>}
        </section>
      )}

      <section className="glass" style={{ padding: 14, marginBottom: 14 }}>
        <TitleHint
          as="div"
          style={{ fontWeight: 800 }}
          hint="若功能看起來是舊的（例如下載沒反應），請按下方按鈕清快取並重載最新版。"
        >
          App 版本 {APP_VERSION}
        </TitleHint>
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 12 }}
          onClick={() => void forceReloadApp()}
        >
          <RefreshCw size={16} /> 強制更新最新版
        </button>
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>
          會清除快取與離線服務後重載；更新後版本號應變成最新。
        </div>
      </section>

      <section className="glass" style={{ padding: 14, marginBottom: 14 }}>
        <TitleHint
          as="div"
          style={{ fontWeight: 800 }}
          hint="Android 請用 Chrome 開啟本站，點下方橫幅「安裝」，或選單 ⋮ →「安裝應用程式／加到主畫面」。"
        >
          安裝到手機
        </TitleHint>
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
