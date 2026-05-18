# Device Flow Spike

**Goal:** Verify GitHub Device Flow can complete from a static browser page
without a CORS-proxy backend.

**Test app Client ID:** `<paste from GitHub App registration>`

**Setup:**
1. Visit https://github.com/settings/apps/new and register a public test app:
   - Name: `gpe-practice-spike` (must be unique to your account)
   - Homepage URL: `http://localhost`
   - Callback URL: leave blank
   - Enable **Device Flow**: ✔ (this is the key checkbox)
   - Permissions: Contents (read & write), Pull requests (read & write), Metadata (read)
   - Webhook → Active: **uncheck**
2. Note the **Client ID** shown on the app's settings page. (Do NOT generate a client secret — Device Flow doesn't need one.)
3. Paste the Client ID into `driver.js` (`CLIENT_ID` constant).
4. Serve: `npx --yes serve spike/device-flow -l 5174`
5. Open `http://localhost:5174/` and click "Start device flow".

**Outcome:** Findings will be recorded in `docs/spikes/2026-05-18-device-flow-findings.md` after the run.
