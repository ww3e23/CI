import { openDB } from 'idb'

export type PendingDefectMedia = {
  defectId: string
  projectId: string
  planPhotoDataUrl?: string
  photoDataUrls: string[]
  updatedAt: string
}

const DB_NAME = 'ci-pending-media'
const STORE = 'defects'

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'defectId' })
      }
    },
  })
}

export async function savePendingDefectMedia(entry: PendingDefectMedia): Promise<void> {
  const database = await db()
  await database.put(STORE, entry)
}

export async function getPendingDefectMedia(
  defectId: string,
): Promise<PendingDefectMedia | undefined> {
  const database = await db()
  return database.get(STORE, defectId)
}

export async function listPendingDefectMedia(): Promise<PendingDefectMedia[]> {
  const database = await db()
  return database.getAll(STORE)
}

export async function clearPendingDefectMedia(defectId: string): Promise<void> {
  const database = await db()
  await database.delete(STORE, defectId)
}
