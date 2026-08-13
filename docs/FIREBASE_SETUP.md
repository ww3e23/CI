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

### 5-3 建議：用「我的雲端硬碟」＋本人 Google 授權（不需公司共用碟）
服務帳戶**沒有**「我的雲端硬碟」配額，個人資料夾請走 OAuth：

1. GCP → **Google Auth Platform** 完成品牌／目標對象（外部）／聯絡信箱  
2. **資料存取權** 加入 `.../auth/drive`（完整雲端硬碟；`drive.file` 看不到你手動建的資料夾）  
3. **用戶端** 建立 **網頁應用程式**；JavaScript 來源：
   - `https://ww3e23.github.io`
   - `http://localhost:5173`
4. 把用戶端 ID 設成 `VITE_GOOGLE_OAUTH_CLIENT_ID`（正式站亦可寫在 `.env.production`）  
5. **目標對象 → 測試使用者** 加入你要授權的 Gmail（測試模式必填）  
6. 在「我的雲端硬碟」建資料夾，複製網址（含 `/folders/xxxxxx`）  
7. 後台綁定後，按綠色 **「用我的 Google 帳號同步」**（不要用服務帳戶按鈕）  
   同一瀏覽器授權成功後，之後拍照上傳會**自動**補傳到該資料夾（換裝置／清快取需再授權一次）  
   刪除缺失時也會把對應的 `#編號 小項名稱` 資料夾移到雲端硬碟垃圾桶  
   現場 App「我的」頁也有 **「用我的 Google 帳號同步照片」**，查驗人員可自行補傳

### 5-4 可選：共用雲端硬碟＋服務帳戶
僅在你有權把服務帳戶加進**共用雲端硬碟**成員時使用：

1. 建立／選用 Shared Drive 資料夾  
2. 把 §5-2 的服務帳戶加為**內容管理員／編輯者**  
3. 後台綁定網址後，用 **「服務帳戶同步（共用雲端硬碟）」**

### 5-5 在驗屋後台綁定
1. 用 `admin@site.tw` 登入 → 開 `#/admin` → **專案管理**
2. 點選建案 → 貼上 Google 雲端硬碟資料夾網址 → **儲存**
3. 每個建案可貼不同資料夾
4. 若先前已拍過照片：按同步按鈕  
   只會補硬碟裡還沒有的檔案；資料夾結構為：

   `棟別 / 樓層 / 戶別 / 大項 / #編號 小項名稱`（與缺失列表相同，例如 `#5 玄關門開啟及關閉是否有雜音？`）

### 5-6 部署鏡像 Function
本機：

```bash
npm install -g firebase-tools   # 若尚未安裝
firebase login
firebase use ci-inspection
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules,storage
```

或在 GitHub Secrets 設定 `FIREBASE_TOKEN`（`firebase login:ci`），推送 `functions/**` 到 `main` 會自動部署。

部署成功後流程：

**拍照／上傳 → Firebase Storage →（自動）依棟樓戶大項小項複製到 Google 雲端硬碟**  
**手動按鈕 → 掃描既有 Storage 照片 → 只補硬碟缺少的檔案**

---

## 6. 正式規則部署指令（同步失敗必做）

若後台出現「無法從雲端同步」或 Console 顯示  
`FirebaseError: Missing or insufficient permissions`，代表**雲端規則尚未發布**（repo 裡的 `firestore.rules` 不會自動生效）。

### 最快：Console 手動發布
1. 開啟 [Firestore 規則](https://console.firebase.google.com/project/ci-inspection/firestore/rules)
2. 貼上本 repo 的 `firestore.rules` 全文
3. 按 **發布**
4. 網站重新登入後再按「同步到雲端」

### 本機 CLI
```bash
firebase login
firebase use ci-inspection
firebase deploy --only firestore:rules,storage
```

### GitHub Actions（可選）
在 repo Secrets 新增 `FIREBASE_TOKEN`（本機執行 `firebase login:ci` 取得），  
之後推送 `firestore.rules` / `storage.rules` 到 `main` 會自動部署。

---

## 7. 驗證清單

- [ ] GitHub Secrets 六個都已填，Pages 重新部署成功
- [ ] 「我的」顯示 Firebase 已設定
- [ ] 登入後 Authentication 出現使用者
- [ ] 已發布 `firestore.rules`（後台「同步到雲端」成功、無 permission 錯誤）
- [ ] 新增缺失後：Firestore 有 `projects/.../defects/...`，Storage 有照片
- [ ] 後台建案已綁 Drive 資料夾；個人碟用「用我的 Google 帳號同步」，共用碟才用服務帳戶
- [ ] OAuth 測試使用者已加入；`VITE_GOOGLE_OAUTH_CLIENT_ID` / `.env.production` 已設定
- [ ] Cloud Function `mirrorDefectPhotoToDrive` / `syncProjectPhotosToDriveAsUser` 已部署
- [ ] 新上傳或手動同步後，照片出現在對應 Google 雲端硬碟資料夾

---

## 8. 安全提醒

- 網頁 `apiKey` 本來就會出現在前端，但請在 Firebase Console 設定 **授權網域**（加入 `ww3e23.github.io`、`localhost`）
- **不要**把 `.env.local` 或服務帳戶 JSON 提交進 git
- 正式規則下未登入無法寫入；請用 App 登入後再測上傳
