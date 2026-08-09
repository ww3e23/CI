import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onObjectFinalized } from 'firebase-functions/v2/storage'
import { logger } from 'firebase-functions'
import { google } from 'googleapis'
import { Readable } from 'node:stream'

initializeApp()

/**
 * Storage 上傳完成後，依專案設定的 driveFolderId 鏡像到 Google 雲端硬碟。
 * 路徑格式：projects/{projectId}/defects/{defectId}/{filename}
 *
 * 部署前請：
 * 1. Google Cloud Console 啟用 Google Drive API
 * 2. 把每個建案資料夾「共用」給 App Engine / 運算服務帳戶（可寫入）
 */
export const mirrorDefectPhotoToDrive = onObjectFinalized(
  {
    region: 'asia-east1',
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (event) => {
    const object = event.data
    const filePath = object.name
    if (!filePath) return

    const parts = filePath.split('/')
    // projects / {projectId} / defects / {defectId} / file
    if (parts.length < 5 || parts[0] !== 'projects' || parts[2] !== 'defects') {
      logger.info('skip non-defect path', filePath)
      return
    }

    const projectId = parts[1]
    const defectId = parts[3]
    const fileName = parts.slice(4).join('_')

    const projectSnap = await getFirestore().doc(`projects/${projectId}`).get()
    const driveFolderId = projectSnap.get('driveFolderId') as string | undefined
    if (!driveFolderId) {
      logger.info('project has no driveFolderId', projectId)
      return
    }

    const bucket = getStorage().bucket(object.bucket)
    const [buffer] = await bucket.file(filePath).download()

    const auth = await google.auth.getClient({
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    })
    const drive = google.drive({ version: 'v3', auth })

    const contentType = object.contentType || 'image/jpeg'
    const res = await drive.files.create({
      requestBody: {
        name: `${defectId}_${fileName}`,
        parents: [driveFolderId],
      },
      media: {
        mimeType: contentType,
        body: Readable.from(buffer),
      },
      fields: 'id,webViewLink',
      supportsAllDrives: true,
    })

    await getFirestore().doc(`projects/${projectId}/defects/${defectId}`).set(
      {
        driveLastFileId: res.data.id ?? null,
        driveLastFileUrl: res.data.webViewLink ?? null,
        driveSyncedAt: new Date().toISOString(),
      },
      { merge: true },
    )

    logger.info('mirrored to drive', {
      projectId,
      defectId,
      driveFileId: res.data.id,
    })
  },
)
