import { useState } from 'react'
import { Download, ImageDown, Trash2 } from 'lucide-react'
import type { Defect } from '../../types'
import { statusLabel } from '../../lib/progress'
import { downloadImage, downloadImages } from '../../lib/download'
import { Modal } from '../ui/Modal'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'
import { useProjectStore } from '../../store/useProjectStore'

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
  const live = useProjectStore((s) => s.defects.find((d) => d.id === defect.id) ?? defect)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canDelete =
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
    if (result.error) {
      // 本機已刪、雲端暫失敗：仍關閉詳情
      console.warn(result.error)
    }
    onClose()
  }

  return (
    <Modal onClose={onClose} aria-label="缺失詳情">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
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

      {error && (
        <p style={{ margin: '10px 0 0', color: 'var(--terracotta)', fontWeight: 700, fontSize: 13 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={photos.length === 0}
          onClick={() => void downloadImages(photos)}
        >
          <ImageDown size={16} /> 下載全部照片
        </button>
        {canDelete && (
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

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
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
                onClick={() => void downloadImage(p.src, p.filename)}
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
