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

## 管理者帳號

| 帳號 | 密碼 | 說明 |
|---|---|---|
| `admin@site.tw` | `admin1234` | 系統管理者；登入後到 `#/admin` 自行新增專案與人員 |

首次使用請先清瀏覽器／PWA 站台資料（舊示範資料存在 localStorage），再以管理者登入。

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

未設定 Firebase 時資料存在本機 localStorage，介面仍可操作。

## 功能重點

- 後台：帳號、專案、成員指派、操作歷程（依專案）
- 棟→樓→戶批次設定；報表進度色塊矩陣
- 新增缺失：圖面／現況分開、全螢幕標註、儲存本機／雲端
- 缺失篩選：狀態 + 大項快捷，進階篩選 Bottom Sheet
- 同一帳號在不同專案可有不同角色
- 後台：帳號管理、專案管理、操作歷程
