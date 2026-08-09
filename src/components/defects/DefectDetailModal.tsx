import { useState } from 'react'
import { Download, ImageDown, Pencil, Trash2 } from 'lucide-react'
import type { Defect, DefectStatus } from '../../types'
import { statusLabel } from '../../lib/progress'
import { downloadImage, downloadImages } from '../../lib/download'
import { Modal } from '../ui/Modal'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'
import { useProjectStore } from '../../store/useProjectStore'
import { EditDefectSheet } from './EditDefectSheet'

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
  const live = useProjectStore((s) => s.defects.find((d) => d.id === defect.id) ?? defect)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const canManage =
    role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

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

  const pendingUpload =
    live.syncState === 'pending' ||
    live.syncState === 'syncing' ||
    live.syncState === 'failed' ||
    Boolean(live.planPhotoDataUrl?.startsWith('data:')) ||
    (live.photoDataUrls ?? []).some((p) => p.startsWith('data:'))

  const improved = live.status === 'completed'

  async function handleDelete() {
    if (
      !confirm(
        `確定刪除缺失 #${live.defectNumber}「${live.area}｜${live.description}」？\n刪除後將從列表移除，且無法復原。`,
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
    if (result.error) console.warn(result.error)
    onClose()
  }

  async function handleDownloadOne(src: string, filename: string) {
    setDownloading(true)
    setError(null)
    setInfo(null)
    try {
      await downloadImage(src, filename)
      setInfo('已觸發下載／分享，若未出現請改用「下載照片」或長按圖片儲存')
    } catch (err) {
      console.warn(err)
      setError(err instanceof Error ? err.message : '下載失敗')
    } finally {
      setDownloading(false)
    }
  }

  async function handleDownloadAll() {
    setDownloading(true)
    setError(null)
    setInfo(null)
    try {
      const result = await downloadImages(photos)
      if (result.failed > 0) {
        setInfo(`已處理 ${result.ok} 張，${result.failed} 張失敗`)
      } else {
        setInfo(
          /iPad|iPhone|iPod/.test(navigator.userAgent)
            ? '已開啟分享／預覽，請選「儲存影像」'
            : `已下載 ${result.ok} 張照片`,
        )
      }
    } catch (err) {
      console.warn(err)
      setError(err instanceof Error ? err.message : '下載失敗')
    } finally {
      setDownloading(false)
    }
  }

  if (editing) {
    return (
      <EditDefectSheet
        defect={live}
        onClose={() => setEditing(false)}
      />
    )
  }

  return (
    <Modal onClose={onClose} aria-label="缺失詳情">
      <div
        className={improved ? 'defect-detail-improved' : undefined}
        style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}
      >
        <div>
          <div className="eyebrow">DEFECT #{live.defectNumber}</div>
          <h2 className="serif" style={{ margin: '4px 0 0', fontSize: 22 }}>
            {live.area}｜{live.description}
          </h2>
          <p style={{ margin: '8px 0 0', color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.5 }}>
            {live.categoryName} · {live.buildingName} {live.floor} {live.unitCode}戶
            <br />
            狀態：{statusLabel(live.status)}
            {pendingUpload && (
              <>
                <br />
                <span style={{ color: 'var(--terracotta)', fontWeight: 700 }}>
                  {live.syncState === 'failed'
                    ? '照片上傳失敗，將於連線後自動重試'
                    : '照片上傳中／待補傳（請保持連線片刻）'}
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
      {info && !error && (
        <p style={{ margin: '10px 0 0', color: 'var(--green-deep)', fontWeight: 700, fontSize: 13 }}>
          {info}
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
          disabled={photos.length === 0 || downloading}
          onClick={() => void handleDownloadAll()}
        >
          <ImageDown size={16} /> {downloading ? '處理中…' : '下載照片'}
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
            此筆缺失沒有附圖
            {pendingUpload ? '（若剛上傳過，請稍候連線補傳後再開）' : ''}
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
              style={{ width: '100%', maxHeight: 280, objectFit: 'contain', display: 'block', background: '#1c211d' }}
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
                disabled={downloading}
                onClick={() => void handleDownloadOne(p.src, p.filename)}
              >
                <Download size={15} /> {downloading ? '…' : '下載'}
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </Modal>
  )
}
