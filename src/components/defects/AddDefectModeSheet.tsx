import { Camera, ClipboardList } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

/** 細項新增方式：連拍（快）／詳細（完整表單） */
export function AddDefectModeSheet({
  itemLabel,
  onBurst,
  onDetail,
  onClose,
}: {
  itemLabel?: string
  onBurst: () => void
  onDetail: () => void
  onClose: () => void
}) {
  return (
    <Modal onClose={onClose} aria-label="選擇新增方式" variant="center">
      <TitleHint
        as="h3"
        className="serif"
        style={{ margin: '0 0 6px', fontSize: 20 }}
        hint="連拍主打先拍照記錄：選區域後連續拍，每張照片＝一筆缺失。詳細則可填備註、位置圖等。"
      >
        新增缺失
      </TitleHint>
      {itemLabel ? (
        <p
          style={{
            margin: '0 0 14px',
            color: 'var(--ink-soft)',
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.45,
          }}
        >
          {itemLabel}
        </p>
      ) : (
        <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
          請選擇記錄方式
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', marginBottom: 10, minHeight: 48, justifyContent: 'flex-start', gap: 10 }}
        onClick={onBurst}
      >
        <Camera size={18} />
        <span style={{ textAlign: 'left' }}>
          <strong style={{ display: 'block' }}>連拍</strong>
          <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.92 }}>
            選區域 → 連續拍照，每張＝一筆缺失
          </span>
        </span>
      </button>

      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: '100%', marginBottom: 8, minHeight: 48, justifyContent: 'flex-start', gap: 10 }}
        onClick={onDetail}
      >
        <ClipboardList size={18} />
        <span style={{ textAlign: 'left' }}>
          <strong style={{ display: 'block' }}>詳細</strong>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>
            完整表單（備註、位置圖標註等）
          </span>
        </span>
      </button>

      <button type="button" className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>
        取消
      </button>
    </Modal>
  )
}
