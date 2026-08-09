import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'

export function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  return (
    <div className="app-shell login-shell" style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'var(--green-deep)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 12px',
            }}
          >
            <Building2 size={28} />
          </div>
          <div className="eyebrow">SITE INSPECTION</div>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700 }}>
            現場驗屋查驗
          </h1>
        </div>

        <form
          className="glass"
          style={{ padding: 20 }}
          onSubmit={(e) => {
            e.preventDefault()
            void (async () => {
              const r = await login(email, password)
              if (!r.ok) setError(r.error ?? '登入失敗')
              else setError('')
            })()
          }}
        >
          <h2 className="serif" style={{ margin: '0 0 4px', fontSize: 20 }}>帳號登入</h2>
          <p style={{ margin: '0 0 16px', color: 'var(--ink-soft)', fontSize: 13 }}>
            請使用管理者提供的帳號密碼登入
          </p>

          <div className="field">
            <label>帳號</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label>密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {error && (
              <div style={{ color: 'var(--terracotta)', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                {error}
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            登入
          </button>
        </form>

        <p style={{ marginTop: 14, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12, lineHeight: 1.5 }}>
          尚未開放自行註冊，若忘記密碼請聯繫專案管理者重設。
        </p>
      </div>
    </div>
  )
}
