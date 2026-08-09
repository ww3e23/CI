# Firebase 專案設定指引（現場查驗）

照下列步驟做完後，把網頁 SDK 設定填進本機 `.env.local`（以及 GitHub Secrets），重新部署即可上雲。

## 1. 建立專案

1. 開啟 [Firebase Console](https://console.firebase.google.com/)
2. 「新增專案」→ 名稱可填 `site-inspection` 或你的建案名稱
3. Google Analytics 可先略過

## 2. 註冊網頁應用程式

1. 專案總覽 →「</> 網頁」
2. App 暱稱：`現場查驗 PWA`
3. 可勾選 Firebase Hosting（可選；目前已用 GitHub Pages）
4. 複製 `firebaseConfig` 六個欄位：
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

## 3. 啟用服務

### Authentication
1. 建置 → Authentication → 開始使用
2. 登入方式 → **電子郵件/密碼** → 啟用
3. （建議）先由後台建立帳號，不要開「電子郵件連結」自行註冊

### Firestore
1. 建置 → Firestore Database → 建立資料庫
2. 先選「測試模式」方便開發（正式上線前改為本 repo 的 `firestore.rules`）
3. 位置選離台灣近的區域（如 `asia-east1`）

### Storage
1. 建置 → Storage → 開始使用
2. 規則可先用測試模式，之後換成 repo 內 `storage.rules`

## 4. 本機接上

在專案根目錄建立 `.env.local`：

```bash
cp .env.example .env.local
```

填入：

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=你的專案.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=你的專案.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

然後：

```bash
npm install
npm run dev
```

「我的」頁應顯示 **Firebase 已設定**；儲存缺失會嘗試同步到 Firestore。

## 5. 線上站（GitHub Pages）接上

到 repo → Settings → Secrets and variables → Actions，新增與上面相同的六個：

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

推送到 `main` 後，Deploy GitHub Pages workflow 會帶入這些值重新建置。

## 6. 正式規則（建議）

```bash
# 需安裝 firebase-tools 並登入
npx firebase-tools login
npx firebase-tools use 你的-project-id
npx firebase-tools deploy --only firestore:rules,storage
```

權限判斷要以 `projectMembers`（userId + projectId + role）為準，不是全域單一 role。

## 7. 驗證清單

- [ ] 登入後「我的」顯示 Firebase 已設定
- [ ] 新增缺失後 Firestore 出現 `projects/.../defects/...`
- [ ] 圖面／現況照片可上傳（Storage）
- [ ] 不同專案切換後資料互不混用
- [ ] Viewer 無法新增缺失；Inspector／Admin 可以
