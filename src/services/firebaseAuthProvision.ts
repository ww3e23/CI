import { deleteApp, getApp, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { getFirebaseWebConfig, isFirebaseConfigured } from '../lib/firebase'
import { toFirebasePassword } from '../lib/password'

const SECONDARY_APP = 'ci-auth-provision'

function getSecondaryApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null
  const cfg = getFirebaseWebConfig()
  try {
    return getApp(SECONDARY_APP)
  } catch {
    return initializeApp(
      {
        apiKey: cfg.apiKey!,
        authDomain: cfg.authDomain,
        projectId: cfg.projectId!,
        storageBucket: cfg.storageBucket,
        messagingSenderId: cfg.messagingSenderId,
        appId: cfg.appId!,
      },
      SECONDARY_APP,
    )
  }
}

export type ProvisionResult = {
  ok: boolean
  /** true = 剛建立；false = 已存在或未設定 Firebase */
  created: boolean
  alreadyExists?: boolean
  error?: string
}

/**
 * 用次要 Firebase App 建立 Auth 帳號，避免把目前管理者登出。
 * 若 email 已存在則視為成功（alreadyExists）。
 */
export async function provisionFirebaseAuthUser(input: {
  email: string
  password: string
  displayName: string
}): Promise<ProvisionResult> {
  if (!isFirebaseConfigured()) {
    return { ok: true, created: false, error: '尚未設定 Firebase，僅存本機帳號' }
  }

  const email = input.email.trim().toLowerCase()
  const password = toFirebasePassword(input.password)
  const displayName = input.displayName.trim()

  if (!email || !input.password.trim()) {
    return { ok: false, created: false, error: '帳號與密碼不可空白' }
  }

  const app = getSecondaryApp()
  if (!app) {
    return { ok: false, created: false, error: '無法初始化 Firebase' }
  }

  const auth = getAuth(app)
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName) {
      await updateProfile(cred.user, { displayName })
    }
    await signOut(auth)
    return { ok: true, created: true }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    try {
      await signOut(auth)
    } catch {
      /* ignore */
    }

    if (code === 'auth/email-already-in-use') {
      return { ok: true, created: false, alreadyExists: true }
    }
    if (code === 'auth/weak-password') {
      return { ok: false, created: false, error: '密碼強度不足，請換一組密碼' }
    }
    if (code === 'auth/invalid-email') {
      return { ok: false, created: false, error: 'Email 格式不正確' }
    }
    if (code === 'auth/operation-not-allowed') {
      return { ok: false, created: false, error: '請先在 Firebase 啟用 Email/密碼登入' }
    }
    return {
      ok: false,
      created: false,
      error: '無法寫入 Firebase Authentication，請稍後再試',
    }
  } finally {
    try {
      await deleteApp(app)
    } catch {
      /* ignore */
    }
  }
}
