# 現場查驗｜SITE INSPECTION

手機優先驗屋查驗系統（React + TypeScript + Vite + Firebase）。

## 本機啟動

```bash
npm install
npm run dev
```

瀏覽器開啟提示的位址（預設 `http://localhost:5173`）。

## Firebase（正式雲端）

1. 到 [Firebase Console](https://console.firebase.google.com/) 建立專案，啟用 Authentication、Firestore、Storage。
2. 複製 `.env.example` 為 `.env.local`，填入網頁 SDK 設定。
3. 重新 `npm run dev`；「我的」頁會顯示 Firebase 已設定，可同步棟樓戶與缺失。

未設定時會以**示範模式**運作（本機 localStorage），介面可完整操作。

## 部署

### GitHub Pages（已設定 Actions）

推送到分支後自動建置。請到 repo Settings → Pages → Source 選 **GitHub Actions**。

公開網址：`https://ww3e23.github.io/CI/`

也可手動：

```bash
npm run deploy:pages
```

### Firebase Hosting（可選）

```bash
npm run build
npx firebase-tools deploy --only hosting
```

## 功能重點

- **克勞德 UI**：暖灰米背景、玻璃卡、疊層 Hero、漂浮底部導覽
- **棟→樓→戶批次設定**：不必一戶一戶新增
- **進度色塊矩陣**：報表頁全案進度總覽
- **新增缺失**：圖面位置／現況照片分區、系統配號、同步狀態提示
