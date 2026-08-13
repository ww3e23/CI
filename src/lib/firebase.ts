import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export function getFirebaseWebConfig() {
  return config
}

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId)
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let storage: FirebaseStorage | null = null

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null
  if (!app) app = initializeApp(config)
  return app
}

export function getFirebaseAuth(): Auth | null {
  const a = getFirebaseApp()
  if (!a) return null
  if (!auth) auth = getAuth(a)
  return auth
}

export function getDb(): Firestore | null {
  const a = getFirebaseApp()
  if (!a) return null
  if (!db) db = getFirestore(a)
  return db
}

export function getFirebaseStorage(): FirebaseStorage | null {
  const a = getFirebaseApp()
  if (!a) return null
  if (!storage) storage = getStorage(a)
  return storage
}

export function firebaseModeLabel(): 'cloud' | 'demo' {
  return isFirebaseConfigured() ? 'cloud' : 'demo'
}
