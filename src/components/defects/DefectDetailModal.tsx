import { useEffect, useState } from 'react'
import { Download, ImageDown, Pencil, Trash2 } from 'lucide-react'
import type { Defect, DefectStatus } from '../../types'
import {
  defectInspectorLabel,
  resolveDefectItemLabel,
  resolveDefectRemark,
} from '../../lib/defectDisplay'
import { hasUploadableLocalMedia } from '../../lib/defectMedia'
import { statusLabel } from '../../lib/progress'
import { Modal } from '../ui/Modal'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'
import { useProjectStore } from '../../store/useProjectStore'
import { EditDefectSheet } from './EditDefectSheet'
import { SavePhotosSheet } from './SavePhotosSheet'

const STATUS_OPTIONS: { key: DefectStatus; label: string; cls: string }[] = [
  { key: 'pending_repair', label: '待改善', cls: 'amber' },
  { key: 'pending_reinspection', label: '待複驗', cls: 'slate' },
  { key: 'returned', label: '退回', cls: 'terra' },
  { key: 'completed', label: '已改善', cls: 'muted' },
]

export function DefectDetailModal({
  defect,
  onClose,
}: {
  defect: Defect
  onClose: () => void
}) {
  const role = useCurrentRole()
  const user = useCurrentUser()
  const deleteDefect = useProjectStore((s) => s.deleteDefect)
  const updateDefectStatus = useProjectStore((s) => s.updateDefectStatus)
  const checklistItems = useProjectStore((s) => s.checklistItems)
  const live = useProjectStore((s) => s.defects.find((d) => d.id === defect.id) ?? defect)
  const itemLabel = resolveDefectItemLabel(live, checklistItems)
  const remark = resolveDefectRemark(live, checklistItems)
  const inspector = defectInspectorLabel(live)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [savePhotos, setSavePhotos] = useState<
    { src: string; filename: string; kind: string }[]
  >([])
  const [error, setError] = useState<string | null>(null)

  const canManage =
    role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

  // 開啟詳情時清掉「沒東西可傳卻一直顯示失敗自動重試」的假狀態
  useEffect(() => {
    void useProjectStore.getState().healStuckMediaSyncStates()
  }, [defect.id])

  const photos = [
    live.planPhotoDataUrl
      ? {
          src: live.planPhotoDataUrl,
          kind: '圖面位置',
          filename: `${live.buildingName}-${live.floor}-${live.unitCode}-D${live.defectNumber}-plan`,
        }
      : null,
    ...(live.photoDataUrls ?? []).map((src, i) => ({
      src,
      kind: `現況 ${i + 1}`,
      filename: `${live.buildingName}-${live.floor}-${live.unitCode}-D${live.defectNumber}-photo-${i + 1}`,
    })),
  ].filter(Boolean) as { src: string; kind: string; filename: string }[]

  const hasLocalPending = hasUploadableLocalMedia(live)
  const pendingUpload =
    hasLocalPending || live.syncState === 'pending' || live.syncState === 'syncing'
  const showFailedRetry = live.syncState === 'failed' && hasLocalPending
  const emptyShell = photos.length === 0 && !hasLocalPending

  const improved = live.status === 'completed'

  async function handleDelete() {
    if (
      !confirm(
        `確定刪除缺失 #${live.defectNumber}「${itemLabel || live.area}${remark ? `｜${remark}` : ''}」？\n刪除後將從列表移除，並把雲端硬碟對應資料夾移到垃圾桶。`,
      )
    ) {
      return
    }
    setDeleting(true)
    setError(null)
    const result = await deleteDefect(live.id)
    setDeleting(false)
    if (!result.ok) {
      setError(result.error || '刪除失敗')
      return
    }
    if (result.error) {
      // 本機已刪，但 Drive 同步刪除失敗：先關閉並提示
      window.alert(result.error)
    }
    onClose()
  }

  function openSave(list: { src: string; filename: string; kind: string }[]) {
    setSavePhotos(list)
    setSaveOpen(true)
  }

  if (editing) {
    return (
      <EditDefectSheet
        defect={live}
        onClose={() => setEditing(false)}
      />
    )
  }

  if (saveOpen) {
    return (
      <SavePhotosSheet
        photos={savePhotos}
        onClose={() => {
          setSaveOpen(false)
          setSavePhotos([])
        }}
      />
    )
  }

  return (
    <Modal onClose={onClose} aria-label="缺失詳情">
      <div
        className={improved ? 'defect-detail-improved' : undefined}
        style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">DEFECT #{live.defectNumber}</div>
          <h2 className="serif" style={{ margin: '4px 0 0', fontSize: 22, lineHeight: 1.3 }}>
            {itemLabel || live.area || '未指定細項'}
          </h2>
          {remark ? (
            <p
              style={{
                margin: '10px 0 0',
                color: 'var(--ink)',
                fontSize: 13,
                fontWeight: 500,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              <span style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--ink-soft)', marginBottom: 4 }}>
                備註說明
              </span>
              {remark}
            </p>
          ) : (
            <p style={{ margin: '8px 0 0', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
              無備註說明
            </p>
          )}
          <p style={{ margin: '10px 0 0', color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.5 }}>
            {live.categoryName} · 區域 {live.area}
            <br />
            {live.buildingName} {live.floor} {live.unitCode}戶
            <br />
            狀態：{statusLabel(live.status)}
            {inspector ? (
              <>
                <br />
                查驗人員：{inspector}
                {live.updatedByName &&
                live.updatedByName !== inspector ? (
                  <>（最近修改：{live.updatedByName}）</>
                ) : null}
              </>
            ) : live.updatedByName ? (
              <>
                <br />
                最近修改：{live.updatedByName}
              </>
            ) : null}
            {showFailedRetry && (
              <>
                <br />
                <span style={{ color: 'var(--terracotta)', fontWeight: 700 }}>
                  照片上傳失敗，將於連線後自動重試
                </span>
              </>
            )}
            {pendingUpload && !showFailedRetry && (
              <>
                <br />
                <span style={{ color: 'var(--terracotta)', fontWeight: 700 }}>
                  照片上傳中／待補傳（請保持連線片刻）
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {canManage && (
        <div className="field" style={{ marginTop: 14 }}>
          <label>變更狀態</label>
          <div className="chip-row" role="group" aria-label="變更缺失狀態">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`chip ${opt.cls} ${live.status === opt.key ? 'on' : ''}`}
                onClick={() => updateDefectStatus(live.id, opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p style={{ margin: '10px 0 0', color: 'var(--terracotta)', fontWeight: 700, fontSize: 13 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {canManage && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} /> 修改
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          disabled={photos.length === 0}
          onClick={() => openSave(photos)}
        >
          <ImageDown size={16} /> 儲存照片
        </button>
        {canManage && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--terracotta)', fontWeight: 800 }}
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            <Trash2 size={16} /> {deleting ? '刪除中…' : '刪除'}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          關閉
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }} className={improved ? 'defect-detail-improved' : undefined}>
        {photos.length === 0 && (
          <div className="glass" style={{ padding: 16, color: 'var(--ink-soft)', textAlign: 'center' }}>
            {emptyShell
              ? '此筆缺失沒有附圖。若不需要可直接刪除。'
              : pendingUpload
                ? '此筆缺失沒有附圖（若剛上傳過，請稍候連線補傳後再開）'
                : '此筆缺失沒有附圖'}
          </div>
        )}
        {photos.map((p) => (
          <figure
            key={p.filename}
            style={{
              margin: 0,
              borderRadius: 18,
              overflow: 'hidden',
              background: 'rgba(255,252,246,0.9)',
              border: '1px solid rgba(34,41,31,0.08)',
            }}
          >
            <img
              src={p.src}
              alt={p.kind}
              style={{
                width: '100%',
                maxHeight: 280,
                objectFit: 'contain',
                display: 'block',
                background: '#1c211d',
                WebkitTouchCallout: 'default',
              }}
            />
            <figcaption
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 13 }}>{p.kind}</span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 36, padding: '0 12px' }}
                onClick={() => openSave([p])}
              >
                <Download size={15} /> 下載
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </Modal>
  )
}
