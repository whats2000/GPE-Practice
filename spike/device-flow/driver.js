// PAT 驗證測試 — 確認 Fine-grained PAT 是否具備正確的 GitHub 存取權限。
//
// 測試步驟：
//   1. GET /user                       → 確認 token 有效，記錄使用者名稱
//   2. GET /repos/{owner}/{repo}       → 確認對目標儲存庫有讀取權限
//   3. POST /repos/{owner}/{repo}/forks（可選）→ 確認具備 fork 所需的寫入權限
//
// Token 本身不會被記錄；日誌僅顯示末 4 碼。

const $pat      = document.getElementById('pat');
const $owner    = document.getElementById('owner');
const $repo     = document.getElementById('repo');
const $testFork = document.getElementById('test-fork');
const $verify   = document.getElementById('verify');
const $log      = document.getElementById('log');

const log = (msg) => { $log.textContent += msg + '\n'; };
const clearLog = () => { $log.textContent = ''; };

// ---- Main flow ----------------------------------------------------------
$verify.addEventListener('click', async () => {
  const pat   = $pat.value.trim();
  const owner = $owner.value.trim();
  const repo  = $repo.value.trim();

  if (!pat) {
    clearLog();
    log('中止：請先輸入 PAT。');
    $pat.focus();
    return;
  }
  if (!owner || !repo) {
    clearLog();
    log('中止：請填寫目標儲存庫的擁有者與名稱。');
    return;
  }

  $verify.disabled = true;
  clearLog();
  log(`PAT 末 4 碼：…${pat.slice(-4)}`);
  log(`目標儲存庫：${owner}/${repo}`);
  log('');

  // 延遲匯入 octokit（CDN，無需建置步驟）
  let Octokit;
  try {
    log('正在從 CDN 載入 octokit …');
    const mod = await import('https://esm.sh/octokit');
    Octokit = mod.Octokit;
    log('octokit 載入完成。');
  } catch (e) {
    log('CDN 載入失敗：' + e.message);
    log('請確認網路連線，或改用 VPN。');
    $verify.disabled = false;
    return;
  }

  const octokit = new Octokit({ auth: pat });
  let allPassed = true;

  // ---- Step 1: GET /user ------------------------------------------------
  log('');
  log('--- 步驟 1：GET /user ---');
  try {
    const { data, status } = await octokit.request('GET /user');
    log(`HTTP ${status}  使用者名稱：${data.login}`);
    log('步驟 1：PASS');
  } catch (e) {
    const status = e.status ?? '???';
    log(`HTTP ${status}  錯誤：${e.message}`);
    log(`步驟 1：FAIL — GET /user 回傳 ${status}`);
    allPassed = false;
  }

  // ---- Step 2: GET /repos/{owner}/{repo} --------------------------------
  log('');
  log(`--- 步驟 2：GET /repos/${owner}/${repo} ---`);
  try {
    const { data, status } = await octokit.request('GET /repos/{owner}/{repo}', { owner, repo });
    log(`HTTP ${status}  儲存庫全名：${data.full_name}  可見度：${data.private ? '私有' : '公開'}`);
    log('步驟 2：PASS');
  } catch (e) {
    const status = e.status ?? '???';
    log(`HTTP ${status}  錯誤：${e.message}`);
    log(`步驟 2：FAIL — GET /repos/${owner}/${repo} 回傳 ${status}`);
    allPassed = false;
  }

  // ---- Step 3（可選）: POST /repos/{owner}/{repo}/forks -----------------
  if ($testFork.checked) {
    log('');
    log(`--- 步驟 3（可選）：POST /repos/${owner}/${repo}/forks ---`);
    try {
      const { data, status } = await octokit.request('POST /repos/{owner}/{repo}/forks', { owner, repo });
      log(`HTTP ${status}  Fork 名稱：${data.full_name}`);
      log('步驟 3：PASS');
    } catch (e) {
      const status = e.status ?? '???';
      // 202 Accepted 也是正常回應，octokit 不會拋出
      if (status === 202) {
        log(`HTTP 202  Fork 操作已接受（非同步）。`);
        log('步驟 3：PASS');
      } else {
        log(`HTTP ${status}  錯誤：${e.message}`);
        log(`步驟 3：FAIL — POST /forks 回傳 ${status}`);
        allPassed = false;
      }
    }
  }

  // ---- 總結 -------------------------------------------------------------
  log('');
  log('========================================');
  if (allPassed) {
    log('PASS — 所有必要步驟均成功通過。此 PAT 可用於 GPE-Practice 的 PR 操作。');
  } else {
    log('FAIL — 部分步驟失敗，請依上方錯誤訊息調整 PAT 的權限設定後再試一次。');
  }
  log('========================================');

  $verify.disabled = false;
});
