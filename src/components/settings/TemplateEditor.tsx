import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ChecklistCategory, ChecklistItem } from '../../types'
import { createId } from '../../lib/id'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

const PRESET_COLORS = ['#2F5D4C', '#3C6E8F', '#A67C52', '#AE4C3B', '#6B7C8A', '#8B6B4A', '#C97B2E']

export function TemplateEditor({
  initial,
  initialItems,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: ChecklistCategory
  initialItems: ChecklistItem[]
  onSave: (category: ChecklistCategory, items: ChecklistItem[]) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [iconChar, setIconChar] = useState(initial.iconChar || name.slice(0, 1) || '項')
  const [color, setColor] = useState(initial.color)
  const [items, setItems] = useState<ChecklistItem[]>(
    initialItems.length
      ? initialItems
      : [
          {
            id: createId('item'),
            categoryId: initial.id,
            description: '',
            sortOrder: 0,
            active: true,
          },
        ],
  )

  return (
    <Modal onClose={onCancel} aria-label="編輯查驗範本">
        <TitleHint
          as="h3"
          className="serif"
          style={{ margin: '0 0 14px', fontSize: 20 }}
          hint="修改後會同步到各戶查驗清單；已有缺失的細項只能停用、不會刪除歷史。"
        >
          {initial.name ? `編輯「${initial.name}」` : '新增大項'}
        </TitleHint>

        <div className="field">
          <label>大項名稱</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!iconChar || iconChar === initial.iconChar) {
                setIconChar(e.target.value.slice(0, 1) || '項')
              }
            }}
            placeholder="例如：門"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10 }}>
          <div className="field">
            <label>圖示字</label>
            <input
              value={iconChar}
              maxLength={1}
              onChange={(e) => setIconChar(e.target.value.slice(0, 1))}
            />
          </div>
          <div className="field">
            <label>顏色</label>
            <div className="chip-row">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="color-dot"
                  style={{
                    background: c,
                    outline: color === c ? '2px solid #22291F' : 'none',
                    outlineOffset: 2,
                    width: 28,
                    height: 28,
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 800 }}>細項清單</div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 36 }}
            onClick={() =>
              setItems((list) => [
                ...list,
                {
                  id: createId('item'),
                  categoryId: initial.id,
                  description: '',
                  sortOrder: list.length,
                  active: true,
                },
              ])
            }
          >
            <Plus size={16} /> 新增細項
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {items.map((item, idx) => (
            <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--ink-soft)', fontWeight: 700, width: 20 }}>{idx + 1}</span>
              <input
                value={item.description}
                placeholder="細項檢查說明"
                onChange={(e) =>
                  setItems((list) =>
                    list.map((it) =>
                      it.id === item.id ? { ...it, description: e.target.value } : it,
                    ),
                  )
                }
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 12,
                  border: '1px solid rgba(34,41,31,0.1)',
                  padding: '0 12px',
                  background: 'rgba(255,255,255,0.65)',
                }}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label="刪除細項"
                onClick={() => setItems((list) => list.filter((it) => it.id !== item.id))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={!name.trim() || items.every((i) => !i.description.trim())}
          onClick={() => {
            const cleaned = items
              .filter((i) => i.description.trim())
              .map((i, sortOrder) => ({
                ...i,
                description: i.description.trim(),
                categoryId: initial.id,
                sortOrder,
                active: true,
              }))
            onSave(
              {
                ...initial,
                name: name.trim(),
                iconChar: iconChar.trim() || name.trim().slice(0, 1),
                color,
                itemCount: cleaned.length,
                active: true,
              },
              cleaned,
            )
          }}
        >
          儲存範本
        </button>
        <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={onCancel}>
          取消
        </button>
        {onDelete && (
          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginTop: 8, color: 'var(--terracotta)', fontWeight: 800 }}
            onClick={onDelete}
          >
            刪除／停用此大項
          </button>
        )}
    </Modal>
  )
}
