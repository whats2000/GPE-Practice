# GitHub PAT 驗證測試

> **注意：** 本目錄原為 Device Flow CORS 測試用途，已於 2026-05-18 改為
> PAT（Personal Access Token）驗證測試頁。改用 PAT 的原因請參閱下方「為何選擇 PAT」段落。

## 為何選擇 PAT 而非 Device Flow

Device Flow 需要使用者自行註冊 GitHub App 並取得 Client ID，且
`POST /login/oauth/access_token` 端點在瀏覽器端歷來不回傳 CORS 標頭，
從靜態頁面直接呼叫此端點必須使用 CORS Proxy（違反「無後端」設計不變式）或
讓使用者手動安裝 GitHub App（比貼上 PAT 的門檻更高）。

兄弟專案 `robotic-skill-visualize`（即 RoboSkills）已在 GitHub Pages 上以 PAT
方式運行，可直接建立 PR，且無需任何後端服務。本專案採用相同的成熟做法。

詳細決策紀錄請參閱 `docs/spikes/2026-05-18-device-flow-findings.md`，
正式 UX 規格請參閱 `docs/superpowers/specs/2026-05-18-gpe-practice-rebuild-design.md` §9。

---

## 建立 PAT（兩種方式擇一）

### 推薦方式：Classic Token + 預填連結（一鍵建立）

點此連結即可開啟已預填 scope 與描述的建立頁面：

> [github.com/settings/tokens/new?scopes=repo&description=GPE-Practice%20PR%20Bot](https://github.com/settings/tokens/new?scopes=repo&description=GPE-Practice%20PR%20Bot)

頁面開啟後 `repo` scope 已預先勾選、描述欄位已填好，只需點「Generate token」即可。
這是兄弟專案 RoboSkills 採用的方式，亦為本專案正式 UX（規格 §9）所採納。
**請妥善保管 token，頁面離開後無法再次查看。**

### 進階方式：Fine-grained PAT（最小權限）

若希望採用最小權限原則，可改用 fine-grained PAT。注意此頁面**不支援**
query 預填，必須手動勾選權限：

1. 前往 [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
2. **Token name**：例如 `gpe-practice-spike`
3. **Repository access**：選擇「Only select repositories」，加入
   `whats2000/GPE-Practice`
4. **Permissions（Repository permissions）**：
   | 權限 | 層級 |
   |------|------|
   | Contents | Read and write |
   | Pull requests | Read and write |
   | Metadata | Read（預設必選） |
5. 點擊「Generate token」並複製。

---

## 執行測試頁

```powershell
npx --yes serve spike/device-flow -l 5174
```

接著在瀏覽器開啟 `http://localhost:5174/`：

1. 將您的 PAT 貼入密碼欄位（`ghp_...`）。
2. 確認或修改目標儲存庫的擁有者（owner）與名稱（repo），預設為
   `whats2000 / GPE-Practice`。
3. 若要一併測試 fork 權限，請勾選「同時測試 Fork 權限」。
4. 點擊「驗證 Token」。

頁面將依序執行：

| 步驟 | 端點 | 目的 |
|------|------|------|
| 1 | `GET /user` | 確認 token 有效，取得已驗證的使用者名稱 |
| 2 | `GET /repos/{owner}/{repo}` | 確認 token 具備目標儲存庫的讀取權限 |
| 3（可選） | `POST /repos/{owner}/{repo}/forks` | 確認具備 fork 與 PR 所需的寫入權限 |

每個步驟記錄 HTTP 狀態碼與關鍵回應欄位。Token 本身不會出現在日誌中，
僅顯示末 4 碼供辨識。所有步驟通過後顯示 `PASS`；任一步驟失敗則顯示
`FAIL` 並附上失敗端點與 HTTP 狀態碼。

---

## 注意事項

- 本測試頁為**健全性檢查工具**，而非架構性 spike。PAT 搭配 octokit 在
  靜態頁面上的可行性已是普遍共識（兄弟專案即為現成佐證）。
- 正式應用程式的 PAT 輸入 UX 定義於規格文件 §9，實作位於
  `app/src/contrib/octokitClient.ts`。
