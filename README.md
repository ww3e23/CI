# Progress · 工程進度排程

此專案由 [CI 查驗 App](https://github.com/ww3e23/CI) **完整複製**而來，作為「非查驗、專門排進度」的新產品基底。

## 現況

- 程式碼起點：與 CI 查驗版相同（含棟別／戶別、進度矩陣、Firebase、雲端硬碟等）
- 用途目標：改造成**進度排程**工具（之後再逐步拿掉查驗／缺失流程）
- 建議：使用**另一個 Firebase 專案**，避免與查驗 App 費用、資料混在一起

## 開發

```bash
npm install
npm run dev
```

Functions：

```bash
cd functions && npm install && npm run build
```

## 下一步改造方向（建議）

1. 產品命名／首頁文案改成進度排程
2. 資料模型：工序、計畫起訖、實際進度、責任人
3. 弱化／移除缺失拍照、Drive 即時同步等查驗專用流程
4. 報表改為進度總覽、延期預警

---

原始查驗版請繼續用 `ww3e23/CI`；本倉庫獨立演進。
