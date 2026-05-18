// Device Flow CORS spike — see ../README.md for setup.
//
// Goal: determine whether both endpoints respond to a browser fetch with
// permissive CORS:
//   1. POST https://github.com/login/device/code
//   2. POST https://github.com/login/oauth/access_token
//
// The user supplies the Client ID via the UI (saved to localStorage for
// convenience on reload). Client IDs are public by design — safe to keep
// in localStorage. No client secret is involved.

const STORAGE_KEY = 'gpe-spike-device-flow:client-id';
const SCOPE_KEY   = 'gpe-spike-device-flow:scope';

const $clientId = document.getElementById('client-id');
const $scope    = document.getElementById('scope');
const $start    = document.getElementById('start');
const $log      = document.getElementById('log');

const log = (msg) => { $log.textContent += msg + '\n'; };
const clearLog = () => { $log.textContent = ''; };

// ---- Restore previous inputs --------------------------------------------
$clientId.value = localStorage.getItem(STORAGE_KEY) ?? '';
$scope.value    = localStorage.getItem(SCOPE_KEY) ?? $scope.value;

if ($clientId.value) {
  $log.textContent = '已載入儲存的 Client ID。按下「開始 Device Flow」啟動測試。';
}

// ---- Persist on change --------------------------------------------------
$clientId.addEventListener('input', () => {
  localStorage.setItem(STORAGE_KEY, $clientId.value.trim());
});
$scope.addEventListener('input', () => {
  localStorage.setItem(SCOPE_KEY, $scope.value.trim() || 'public_repo');
});

// ---- Main flow ----------------------------------------------------------
$start.addEventListener('click', async () => {
  const clientId = $clientId.value.trim();
  const scope    = $scope.value.trim() || 'public_repo';

  if (!clientId) {
    clearLog();
    log('ABORT: 請先輸入 Client ID');
    $clientId.focus();
    return;
  }

  $start.disabled = true;
  clearLog();
  log(`client_id: ${clientId}`);
  log(`scope:     ${scope}`);
  log('');
  log('--- Step A: POST /login/device/code ---');

  let codeResp;
  try {
    codeResp = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept':       'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_id: clientId, scope }),
    });
  } catch (e) {
    log('NETWORK FAILED (likely CORS preflight): ' + e.message);
    log('Verdict for Step A: FAIL — endpoint not browser-callable.');
    $start.disabled = false;
    return;
  }

  if (!codeResp.ok) {
    const body = await codeResp.text();
    log(`HTTP ${codeResp.status}: ${body}`);
    if (codeResp.status === 404) {
      log('Hint: 404 通常表示 Client ID 拼錯或該 App 沒有啟用 Device Flow。');
    }
    $start.disabled = false;
    return;
  }

  const code = await codeResp.json();
  log(`device_code:      ${code.device_code.slice(0, 6)}…`);
  log(`user_code:        ${code.user_code}`);
  log(`verification_uri: ${code.verification_uri}`);
  log(`interval:         ${code.interval}s`);
  log(`expires_in:       ${code.expires_in}s`);
  log('');
  log(`>>> 請在新分頁開啟 ${code.verification_uri}`);
  log(`>>> 輸入 user_code: ${code.user_code}`);
  log('>>> 授權後輪詢將自動開始（5 秒後）。');
  log('');

  await new Promise((r) => setTimeout(r, 5000));

  log('--- Step B: poll POST /login/oauth/access_token ---');
  const deadline = Date.now() + code.expires_in * 1000;

  while (Date.now() < deadline) {
    let pollResp;
    try {
      pollResp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept':       'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id:   clientId,
          device_code: code.device_code,
          grant_type:  'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
    } catch (e) {
      log('POLL NETWORK FAILED (CORS?): ' + e.message);
      log('Verdict for Step B: FAIL — token endpoint not browser-callable.');
      $start.disabled = false;
      return;
    }

    const body = await pollResp.json();
    if (body.access_token) {
      log(`SUCCESS — token 開頭: ${body.access_token.slice(0, 6)}…`);
      log('Verdict: PASS — Device Flow viable from a static origin.');
      $start.disabled = false;
      return;
    }
    if (body.error === 'authorization_pending') {
      log('… 仍在等待使用者授權');
    } else if (body.error === 'slow_down') {
      log('… slow_down，間隔加倍');
      code.interval *= 2;
    } else {
      log(`POLL ERROR: ${body.error} — ${body.error_description || ''}`);
      $start.disabled = false;
      return;
    }
    await new Promise((r) => setTimeout(r, code.interval * 1000));
  }

  log('TIMED OUT 等待使用者授權');
  $start.disabled = false;
});
