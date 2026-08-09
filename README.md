# 現場查驗｜SITE INSPECTION

手機優先驗屋查驗系統（React + TypeScript + Vite + Firebase）。

## 網址整理

| 用途 | 網址 |
|---|---|
| 現場 App（公開站） | https://ww3e23.github.io/CI/ |
| 驗屋後台（桌面） | https://ww3e23.github.io/CI/#/admin |
| 本機現場 | http://localhost:5173/ |
| 本機後台 | http://localhost:5173/#/admin |

> 後台需先用管理者帳號登入現場 App，再開啟 `#/admin`。

## 示範帳號

| 帳號 | 密碼 | 說明 |
|---|---|---|
| `inspector01@site.tw` | `demo1234` | 陳工地；晴川院子=查驗、松濤匯=僅查看、河岸敘=管理者 |
| `viewer01@site.tw` | `demo1234` | 林查看；晴川院子=僅查看（不能新增缺失） |
| `admin@site.tw` | `admin1234` | 系統管理者；可進後台、三專案皆為管理者 |
| `old@site.tw` | `demo1234` | 已停用（無法登入） |

## 本機啟動

```bash
npm install
npm run dev
```

## Firebase / Google 雲端硬碟

詳見 **[docs/FIREBASE_SETUP.md](./docs/FIREBASE_SETUP.md)**。

摘要：
1. Firebase 專案建議 ID：`ci-inspection`；啟用 Auth、Firestore、Storage（正式規則）  
2. 填 GitHub Secrets 六個 `VITE_FIREBASE_*`，推 `main` 後線上站才會上雲  
3. 照片先上 Firebase Storage；Cloud Function 再鏡像到各建案綁定的 Google 雲端硬碟資料夾  
4. 後台「專案管理」可為每個建案貼不同 Drive 資料夾網址  

未設定時為示範模式（本機 localStorage），介面可完整操作。

## 功能重點

- 克勞德 UI：暖灰米、玻璃卡、疊層 Hero、漂浮底導覽
- 棟→樓→戶批次設定；報表進度色塊矩陣
- 新增缺失：圖面／現況分開、全螢幕標註、儲存本機／雲端
- 缺失篩選：狀態 + 大項快捷，進階篩選 Bottom Sheet
- `projectMembers`：同一帳號在不同專案可有不同角色
- 後台：帳號管理、專案管理、操作歷程
