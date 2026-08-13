import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type GlassSelectOption = {
  value: string
  label: string
}

type Props = {
  label: string
  value: string
  options: GlassSelectOption[]
  onChange: (value: string) => void
  'aria-label'?: string
}

export function GlassSelect({
  label,
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`filter-select glass-select ${open ? 'open' : ''}`} ref={rootRef}>
      <span className="filter-select-label">{label}</span>
      <button
        type="button"
        className="glass-select-trigger"
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="glass-select-value">{selected?.label ?? ''}</span>
        <ChevronDown size={16} className="glass-select-chevron" aria-hidden />
      </button>

      {open && (
        <ul id={listId} className="glass-select-menu" role="listbox" aria-label={ariaLabel ?? label}>
          {options.map((opt) => {
            const active = opt.value === value
            return (
              <li key={opt.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`glass-select-option ${active ? 'on' : ''}`}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
