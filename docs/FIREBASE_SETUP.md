# Firebase 專案設定指引（現場查驗）

目前建議 Firebase 專案 ID：`ci-inspection`（你已建立即可沿用）。

照下列步驟做完後：
1. 把網頁 SDK 六個值填進 GitHub Secrets（線上站）與本機 `.env.local`
2. 部署 Firestore／Storage 規則與 Cloud Functions
3. 在後台為每個建案綁定 Google 雲端硬碟資料夾

## 架構說明

| 層級 | 用途 |
|---|---|
| **Firebase Authentication** | 正式規則需要登入；App 登入時會建立／使用 Email 工作階段 |
| **Firestore** | 專案、棟別、缺失文件、Drive 資料夾 ID |
| **Storage** | 圖面／現況照片本體（路徑：`projects/{建案ID}/defects/{缺失ID}/...`） |
| **Cloud Function** | Storage 上傳後，鏡像複製到該建案綁定的 Google 雲端硬碟資料夾 |

> Firebase 專案 ID（`ci-inspection`）≠ App 內建案 ID（如 `proj_qingchuan`）。  
> 一個 Firebase 專案可服務多個建案；**每個建案各自綁一個 Drive 資料夾**。

---

## 1. 建立／確認 Firebase 專案

1. 開啟 [Firebase Console](https://console.firebase.google.com/)
2. 專案：`ci-inspection`（Blaze 方案可用 Cloud Functions＋Drive API）
3. 已有網頁 App 即可；到「專案設定 → 一般 → 您的應用程式」複製 `firebaseConfig`

你目前的設定應對應：

| 欄位 | 值（範例） |
|---|---|
| projectId | `ci-inspection` |
| authDomain | `ci-inspection.firebaseapp.com` |
| storageBucket | `ci-inspection.firebasestorage.app` |

---

## 2. 啟用服務（正式規則）

你已啟用正式規則即可。請確認：

### Authentication
- 登入方式：**電子郵件/密碼** 已啟用
- 建議預先建立 `admin@site.tw`（密碼 `admin1234`）；App 登入時也會嘗試自動建立／使用 Email 工作階段

### Firestore
- 資料庫已建立（建議區域 `asia-east1`）
- 建議部署本 repo 的 `firestore.rules`（見第 6 節）

### Storage
- 已開始使用
- 建議部署本 repo 的 `storage.rules`（路徑允許 `projects/{projectId}/**`）

---

## 3. 本機接上

```bash
cp .env.example .env.local
```

填入（值從 Firebase Console 複製，**不要提交到 git**）：

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=ci-inspection.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ci-inspection
VITE_FIREBASE_STORAGE_BUCKET=ci-inspection.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

```bash
npm install
npm run dev
```

「我的」頁應顯示 **Firebase 已設定**。

---

## 4. 線上站（GitHub Pages）接上

到 https://github.com/ww3e23/CI → **Settings → Secrets and variables → Actions**  
新增這 6 個 Secret（名稱必須完全一致）：

1. `VITE_FIREBASE_API_KEY`
2. `VITE_FIREBASE_AUTH_DOMAIN` = `ci-inspection.firebaseapp.com`
3. `VITE_FIREBASE_PROJECT_ID` = `ci-inspection`
4. `VITE_FIREBASE_STORAGE_BUCKET` = `ci-inspection.firebasestorage.app`
5. `VITE_FIREBASE_MESSAGING_SENDER_ID`
6. `VITE_FIREBASE_APP_ID`

存檔後推送 `main`（或手動跑 **Deploy GitHub Pages**）。  
強制重新整理 https://ww3e23.github.io/CI/ ，「我的」應顯示已設定。

---

## 5. Google 雲端硬碟（每個建案不同資料夾）

### 5-1 在 Google Cloud 啟用 Drive API
1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)（同一個 `ci-inspection` 專案）
2. **API 和服務 → 資料庫** → 搜尋 **Google Drive API** → 啟用

### 5-2 找出服務帳戶信箱
Firebase／GCP 預設運算服務帳戶通常類似：

`{專案編號}-compute@developer.gserviceaccount.com`

或 Firebase Admin SDK 服務帳戶：

`firebase-adminsdk-xxxxx@ci-inspection.iam.gserviceaccount.com`

可在 **Google Cloud → IAM 與管理 → 服務帳戶** 查看。

### 5-3 為每個建案準備 Drive 資料夾
1. 在 Google 雲端硬碟建立資料夾，例如「晴川院子-查驗照片」
2. 右鍵資料夾 → **共用** → 貼上上面的服務帳戶 Email
3. 權限選 **編輯者**
4. 複製資料夾網址（含 `/folders/xxxxxx`）

### 5-4 在驗屋後台綁定
1. 用 `admin@site.tw` 登入 → 開 `#/admin` → **專案管理**
2. 點選建案 → 貼上 Google 雲端硬碟資料夾網址 → **儲存雲端硬碟設定**
3. 每個建案可貼不同資料夾

### 5-5 部署鏡像 Function
本機：

```bash
npm install -g firebase-tools   # 若尚未安裝
firebase login
firebase use ci-inspection
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules,storage
```

部署成功後流程：

**拍照／上傳 → Firebase Storage →（自動）複製到該建案的 Google 雲端硬碟資料夾**

---

## 6. 正式規則部署指令

```bash
firebase use ci-inspection
firebase deploy --only firestore:rules,storage
```

---

## 7. 驗證清單

- [ ] GitHub Secrets 六個都已填，Pages 重新部署成功
- [ ] 「我的」顯示 Firebase 已設定
- [ ] 登入後 Authentication 出現使用者
- [ ] 新增缺失後：Firestore 有 `projects/.../defects/...`，Storage 有照片
- [ ] 後台建案已綁 Drive 資料夾，且資料夾已共用給服務帳戶
- [ ] Cloud Function `mirrorDefectPhotoToDrive` 已部署
- [ ] 新上傳照片出現在對應 Google 雲端硬碟資料夾

---

## 8. 安全提醒

- 網頁 `apiKey` 本來就會出現在前端，但請在 Firebase Console 設定 **授權網域**（加入 `ww3e23.github.io`、`localhost`）
- **不要**把 `.env.local` 或服務帳戶 JSON 提交進 git
- 正式規則下未登入無法寫入；請用 App 登入後再測上傳
