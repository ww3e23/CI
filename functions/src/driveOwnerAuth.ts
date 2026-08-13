import { google } from 'googleapis'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import type { DriveClient } from './driveFolders'

/** 與前端 VITE_GOOGLE_OAUTH_CLIENT_ID 同一網頁用戶端 */
export const GOOGLE_OAUTH_CLIENT_ID =
  '829326871761-5ls56g2qktrk242v43551ladikvs2uhv.apps.googleusercontent.com'

/** GIS popup code flow 的 redirect_uri */
export const OAUTH_REDIRECT_URI = 'postmessage'

export const googleOAuthClientSecret = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET')

export type DriveOwnerRecord = {
  refreshToken: string
  email: string | null
  connectedAt: string
  connectedByUid: string
  connectedByEmail: string | null
}

function privateOwnerRef(projectId: string) {
  return getFirestore().doc(`projects/${projectId}/private/driveOwner`)
}

export function createOAuth2Client(clientSecret: string) {
  return new google.auth.OAuth2(GOOGLE_OAUTH_CLIENT_ID, clientSecret, OAUTH_REDIRECT_URI)
}

export async function exchangeAuthCode(params: {
  code: string
  clientSecret: string
}): Promise<{ refreshToken: string | null; accessToken: string | null; email: string | null }> {
  const oauth2 = createOAuth2Client(params.clientSecret)
  const { tokens } = await oauth2.getToken(params.code)
  oauth2.setCredentials(tokens)

  let email: string | null = null
  try {
    const oauth2api = google.oauth2({ version: 'v2', auth: oauth2 })
    const me = await oauth2api.userinfo.get()
    email = me.data.email ?? null
  } catch {
    email = null
  }

  return {
    refreshToken: tokens.refresh_token ?? null,
    accessToken: tokens.access_token ?? null,
    email,
  }
}

export async function loadDriveOwner(projectId: string): Promise<DriveOwnerRecord | null> {
  const snap = await privateOwnerRef(projectId).get()
  if (!snap.exists) return null
  const data = snap.data() || {}
  const refreshToken = String(data.refreshToken || '').trim()
  if (!refreshToken) return null
  return {
    refreshToken,
    email: data.email ? String(data.email) : null,
    connectedAt: String(data.connectedAt || ''),
    connectedByUid: String(data.connectedByUid || ''),
    connectedByEmail: data.connectedByEmail ? String(data.connectedByEmail) : null,
  }
}

export async function saveDriveOwner(
  projectId: string,
  record: DriveOwnerRecord,
): Promise<void> {
  await privateOwnerRef(projectId).set(
    {
      refreshToken: record.refreshToken,
      email: record.email,
      connectedAt: record.connectedAt,
      connectedByUid: record.connectedByUid,
      connectedByEmail: record.connectedByEmail,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  )
  await getFirestore().doc(`projects/${projectId}`).set(
    {
      driveOwnerConnected: true,
      driveOwnerEmail: record.email,
      driveOwnerConnectedAt: record.connectedAt,
    },
    { merge: true },
  )
}

export async function clearDriveOwner(projectId: string): Promise<void> {
  await privateOwnerRef(projectId).delete().catch(() => undefined)
  await getFirestore().doc(`projects/${projectId}`).set(
    {
      driveOwnerConnected: false,
      driveOwnerEmail: null,
      driveOwnerConnectedAt: null,
    },
    { merge: true },
  )
}

export async function getDriveClientFromOwner(params: {
  projectId: string
  clientSecret: string
}): Promise<{ drive: DriveClient; email: string | null }> {
  const owner = await loadDriveOwner(params.projectId)
  if (!owner) {
    throw new HttpsError(
      'failed-precondition',
      '此專案尚未綁定雲端硬碟擁有者。請請後台管理者先按「綁定雲端硬碟擁有者」（只需授權一次）。',
    )
  }

  const oauth2 = createOAuth2Client(params.clientSecret)
  oauth2.setCredentials({ refresh_token: owner.refreshToken })
  // 強制刷新一次，失敗時給明確錯誤
  try {
    await oauth2.getAccessToken()
  } catch (err) {
    throw new HttpsError(
      'failed-precondition',
      `雲端硬碟擁有者授權已失效，請後台管理者重新綁定。（${String((err as Error)?.message ?? err)}）`,
    )
  }

  const drive = google.drive({ version: 'v3', auth: oauth2 })
  return { drive, email: owner.email }
}

export async function tryGetDriveClientFromOwner(params: {
  projectId: string
  clientSecret: string
}): Promise<{ drive: DriveClient; email: string | null } | null> {
  const owner = await loadDriveOwner(params.projectId)
  if (!owner) return null
  try {
    return await getDriveClientFromOwner(params)
  } catch {
    return null
  }
}
