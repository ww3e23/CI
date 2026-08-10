const GIS_SRC = 'https://accounts.google.com/gsi/client'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

type TokenClient = {
  requestAccessToken: (override?: { prompt?: string }) => void
}

type GoogleAccounts = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (resp: { access_token?: string; error?: string; error_description?: string }) => void
      }) => TokenClient
    }
  }
}

declare global {
  interface Window {
    google?: GoogleAccounts
  }
}

let gisLoading: Promise<void> | null = null

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisLoading) return gisLoading
  gisLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('載入 Google 授權元件失敗')))
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('載入 Google 授權元件失敗'))
    document.head.appendChild(script)
  })
  return gisLoading
}

/** 網頁 OAuth 用戶端 ID（會公開嵌在前端；靠 JS origin 限制）。CI 未設 env 時用此預設。 */
const DEFAULT_WEB_CLIENT_ID =
  '829326871761-ah214ejvo8383ve0bq7d7nfsfrl1b9nb.apps.googleusercontent.com'

export function getGoogleOAuthClientId(): string {
  return String(import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || DEFAULT_WEB_CLIENT_ID).trim()
}

/** 跳出 Google 授權視窗，取得可寫入雲端硬碟的 access token */
export async function requestGoogleDriveAccessToken(): Promise<string> {
  const clientId = getGoogleOAuthClientId()
  if (!clientId) {
    throw new Error(
      '尚未設定 Google OAuth 用戶端 ID（VITE_GOOGLE_OAUTH_CLIENT_ID）。請先在 GCP 建立網頁應用程式用戶端。',
    )
  }
  await loadGis()
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google 授權元件未就緒')
  }

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'Google 授權失敗或已取消'))
          return
        }
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken({ prompt: 'consent' })
  })
}
