const GIS_SRC = 'https://accounts.google.com/gsi/client'
/** 需可讀寫使用者既有資料夾；drive.file 看不到手動建立的資料夾（會 File not found） */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

const TOKEN_KEY = 'ci_drive_oauth_token'
const TOKEN_EXP_KEY = 'ci_drive_oauth_token_exp'

type TokenClient = {
  requestAccessToken: (override?: { prompt?: string }) => void
}

type CodeClient = {
  requestCode: () => void
}

type GoogleAccounts = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (resp: {
          access_token?: string
          expires_in?: number
          error?: string
          error_description?: string
        }) => void
      }) => TokenClient
      initCodeClient: (config: {
        client_id: string
        scope: string
        ux_mode?: 'popup' | 'redirect'
        callback: (resp: {
          code?: string
          error?: string
          error_description?: string
        }) => void
        error_callback?: (err: { type?: string; message?: string }) => void
      }) => CodeClient
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
  '829326871761-5ls56g2qktrk242v43551ladikvs2uhv.apps.googleusercontent.com'

export function getGoogleOAuthClientId(): string {
  return String(import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || DEFAULT_WEB_CLIENT_ID).trim()
}

export function cacheDriveAccessToken(token: string, expiresInSec = 3200) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
    sessionStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + Math.max(60, expiresInSec) * 1000))
  } catch {
    /* ignore quota / private mode */
  }
}

export function getCachedDriveAccessToken(): string | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY)
    const exp = Number(sessionStorage.getItem(TOKEN_EXP_KEY) || 0)
    if (!token || !exp || Date.now() > exp - 60_000) return null
    return token
  } catch {
    return null
  }
}

function requestTokenWithPrompt(prompt: '' | 'consent'): Promise<{
  accessToken: string
  expiresIn: number
}> {
  return new Promise((resolve, reject) => {
    const clientId = getGoogleOAuthClientId()
    if (!clientId) {
      reject(
        new Error(
          '尚未設定 Google OAuth 用戶端 ID（VITE_GOOGLE_OAUTH_CLIENT_ID）。請先在 GCP 建立網頁應用程式用戶端。',
        ),
      )
      return
    }
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google 授權元件未就緒'))
      return
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'Google 授權失敗或已取消'))
          return
        }
        resolve({
          accessToken: resp.access_token,
          expiresIn: Number(resp.expires_in) || 3200,
        })
      },
    })
    client.requestAccessToken({ prompt })
  })
}

/** 跳出 Google 授權視窗，取得可寫入雲端硬碟的 access token */
export async function requestGoogleDriveAccessToken(): Promise<string> {
  const cached = getCachedDriveAccessToken()
  if (cached) return cached
  await loadGis()
  const { accessToken, expiresIn } = await requestTokenWithPrompt('consent')
  cacheDriveAccessToken(accessToken, expiresIn)
  return accessToken
}

/**
 * 靜默取得 token（不彈窗）：快取 → Google 靜默授權。
 * 使用者需曾在此瀏覽器按過「用我的 Google 帳號同步」並同意。
 */
export async function requestGoogleDriveAccessTokenSilent(): Promise<string | null> {
  const cached = getCachedDriveAccessToken()
  if (cached) return cached
  if (!getGoogleOAuthClientId()) return null
  try {
    await loadGis()
    const { accessToken, expiresIn } = await requestTokenWithPrompt('')
    cacheDriveAccessToken(accessToken, expiresIn)
    return accessToken
  } catch {
    return null
  }
}

/**
 * 取得授權碼（給後端換 refresh token）。
 * 僅後台「綁定雲端硬碟擁有者」使用；現場人員不必呼叫。
 */
export async function requestGoogleDriveAuthCode(): Promise<string> {
  const clientId = getGoogleOAuthClientId()
  if (!clientId) {
    throw new Error(
      '尚未設定 Google OAuth 用戶端 ID（VITE_GOOGLE_OAUTH_CLIENT_ID）。請先在 GCP 建立網頁應用程式用戶端。',
    )
  }
  await loadGis()
  if (!window.google?.accounts?.oauth2?.initCodeClient) {
    throw new Error('Google 授權元件未就緒')
  }

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      ux_mode: 'popup',
      callback: (resp) => {
        if (resp.error || !resp.code) {
          reject(new Error(resp.error_description || resp.error || 'Google 授權失敗或已取消'))
          return
        }
        resolve(resp.code)
      },
      error_callback: (err) => {
        reject(new Error(err.message || err.type || 'Google 授權視窗關閉或失敗'))
      },
    })
    client.requestCode()
  })
}
