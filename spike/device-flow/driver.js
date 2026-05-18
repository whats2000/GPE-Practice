// Device Flow CORS spike — see ../README.md for setup.
// Goal: determine whether both endpoints respond to a browser fetch with permissive CORS:
//   1. POST https://github.com/login/device/code
//   2. POST https://github.com/login/oauth/access_token

const CLIENT_ID = 'REPLACE_WITH_CLIENT_ID_FROM_GITHUB_APP_REGISTRATION';
const SCOPE = 'public_repo';

const $log = document.getElementById('log');
const log = (msg) => { $log.textContent += msg + '\n'; };

document.getElementById('start').onclick = async () => {
  if (CLIENT_ID.startsWith('REPLACE_')) {
    log('ABORT: Set CLIENT_ID in driver.js first (see README).');
    return;
  }

  log('--- Step A: POST /login/device/code ---');
  let codeResp;
  try {
    codeResp = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE }),
    });
  } catch (e) {
    log('NETWORK FAILED (likely CORS preflight): ' + e.message);
    return;
  }
  if (!codeResp.ok) {
    log(`HTTP ${codeResp.status}: ${await codeResp.text()}`);
    return;
  }
  const code = await codeResp.json();
  log(`device_code:       ${code.device_code.slice(0, 6)}…`);
  log(`user_code:         ${code.user_code}`);
  log(`verification_uri:  ${code.verification_uri}`);
  log(`interval:          ${code.interval}s`);
  log(`expires_in:        ${code.expires_in}s`);

  log('\n>>> Open the verification URI in another tab and enter the user code.');
  log('>>> Polling will start in 5 seconds.\n');

  await new Promise((r) => setTimeout(r, 5000));

  log('--- Step B: poll POST /login/oauth/access_token ---');
  const deadline = Date.now() + code.expires_in * 1000;
  while (Date.now() < deadline) {
    let pollResp;
    try {
      pollResp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          device_code: code.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
    } catch (e) {
      log('POLL NETWORK FAILED (CORS?): ' + e.message);
      return;
    }
    const body = await pollResp.json();
    if (body.access_token) {
      log(`SUCCESS — token starts with: ${body.access_token.slice(0, 6)}…`);
      log('CORS OK on both endpoints. Device Flow viable from a static site.');
      return;
    }
    if (body.error === 'authorization_pending') {
      log('… still pending');
    } else if (body.error === 'slow_down') {
      log('… slow_down, doubling interval');
      code.interval *= 2;
    } else {
      log(`POLL ERROR: ${body.error} — ${body.error_description || ''}`);
      return;
    }
    await new Promise((r) => setTimeout(r, code.interval * 1000));
  }
  log('TIMED OUT waiting for user authorization');
};
