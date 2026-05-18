# Device Flow Spike

**Goal:** Verify GitHub Device Flow can complete from a static browser page
without a CORS-proxy backend.

## Setup

1. Visit https://github.com/settings/apps/new and register a public test app:
   - **Name:** any unique name on your account, e.g. `gpe-practice-spike`
   - **Homepage URL:** `http://localhost`
   - **Callback URL:** leave blank
   - **Enable Device Flow:** ✔ (key checkbox; without this, `/login/device/code`
     returns 404)
   - **Permissions:** Contents (R/W), Pull requests (R/W), Metadata (R)
   - **Webhook → Active:** uncheck
   - Do NOT generate a client secret — Device Flow doesn't need one.

2. Note the **Client ID** shown on the app's settings page. (Public by design.)

3. Serve the spike:
   ```powershell
   npx --yes serve spike/device-flow -l 5174
   ```

4. Open `http://localhost:5174/` in a browser.

5. Paste the Client ID into the input field on the page. The value is saved
   to `localStorage` for convenience on reload — Client IDs are public, so
   persisting them is safe.

6. Click **開始 Device Flow**. Follow the on-screen instructions: open the
   `verification_uri` in a new tab, enter the `user_code`, authorize the app.

7. The browser polls the token endpoint every few seconds. The page logs
   either `PASS` (token received → CORS OK on both endpoints) or `FAIL`
   (CORS error on one of them).

## What this tells us

- **PASS:** `contrib/octokitClient.ts` can use `@octokit/auth-oauth-device`
  in the browser as the primary auth path; PAT-paste fallback is shown only
  behind an "Advanced" disclosure.
- **FAIL (Step A):** GitHub blocks `/login/device/code` from browsers. Device
  Flow is dead-in-the-water for static sites. We make PAT the primary path.
- **FAIL (Step B):** The user-visible step works but we can't claim the token.
  Either fall back to PAT or accept a tiny CORS-proxy Worker (would violate
  the static-only spec invariant).

Outcome will be recorded in `docs/spikes/2026-05-18-device-flow-findings.md`.
