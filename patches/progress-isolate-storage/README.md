# Progress 与查验 CI 隔离补丁（需合入 ww3e23/Progress）

本 Agent 对 Progress 仓库无 push 权限。请在 Progress 开 Agent 或本机套用：

1. 新增 `src/lib/storageKeys.ts`（本目录有副本）
2. `useAuthStore` persist name → `PROGRESS_AUTH_STORAGE_KEY`（`site-progress-auth-v1`）
3. `useProjectStore` persist name → `PROGRESS_PROJECT_STORAGE_KEY`（`site-progress-data-v1`）
4. `mediaPersist` / `pendingMediaDb` 改用 progress 专用 key／DB 名
5. `.firebaserc` default 改为独立 Firebase（勿再用 `ci-inspection`）；GitHub Secrets 也要换成新专案
6. 参考 commit（本机已做好但推不上去）：见同目录 `COMMIT_MSG.txt`

查验 CI 已改为 `ci-inspection-auth-v1` / `ci-inspection-data-v1`，两边不再共用本机储存。
