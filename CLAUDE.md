# Math Facts — project handoff

Timed multiplication-facts PWA for Brian's two kids — **Caleb** (10) and **Ellie**
(younger) — plus a parent dashboard. Sibling project to Palabritas (`C:\Users\brian\Desktop\Spelling`) and
deliberately follows the same shape: vanilla HTML/CSS/JS, no build step, no
dependencies, GitHub Pages, Add to Home Screen.

- **Quiz:** https://gwallee.github.io/MathFacts/?student=caleb (and ?student=ellie)
- **Dashboard:** https://gwallee.github.io/MathFacts/dashboard.html
- **Repo:** https://github.com/gwallee/MathFacts (public)

## Architecture

```
quiz (index.html) --POST session--> Apps Script doPost --> Sessions tab
                  --GET  settings-->            doGet   <-- Settings tab
                                        |
                                        +--UrlFetchApp--> ntfy.sh --> Brian's phone
dashboard.html    --GET  all-------->            doGet   <-- both tabs
                  --POST settings--->            doPost  --> Settings tab
```

Unlike Palabritas (all local storage), the source of truth here is a Google Sheet that
**nobody in the family ever opens directly**. The Apps Script web app is the only door
in or out.

## Hard requirements (from Brian)

- Multiplication only. **Per kid** ranges: Caleb 3–12 (Brian explicitly excluded ×2 —
  "don't need 5 x 2, but I do want 5 x 3" — and capped it at 12, "don't go past 12
  either"); Ellie 1–10 at 12 seconds.
- Timeout counts as a miss.
- **Purely random selection — no adaptive weighting.** Misses are logged for analysis
  on the dashboard, never re-asked in the session. (This is the opposite of Palabritas,
  which re-queues misses. Do not "improve" it into an adaptive quiz.)
- **The timer and range must be changeable from the parent dashboard**, not by editing
  code — that is why practice settings live in the Sheet rather than `config.js`.
- The **ntfy topic must never appear in the quiz or dashboard source** — only in the
  Apps Script. The committed `apps-script/Code.gs` therefore carries a placeholder.
- No login on the dashboard; an obscure URL is accepted security.
- If the upload fails, the score screen must tell the kid to show a parent.
- One Sheet for all kids, named `Math Facts` (Brian's call — the file name is cosmetic,
  only the tab names matter to the code).

## File map

- `config.js` — `SCRIPT_URL` (the only required edit) plus shared UI/dashboard
  constants. The `STUDENTS` block here is a **fallback only**: it seeds the Sheet's
  `Settings` tab on first run and is what the quiz uses before it has ever reached the
  network. Live per-kid settings come from the Sheet. Both HTML files carry their own
  `DEFAULTS` object in case `config.js` fails to load entirely.
- `index.html` — the quiz. Four screens (pick / start / play / done) in one file.
  - Which kid is decided by `?student=<key>` → `localStorage['mathfacts_student_v1']`
    → picker. Choosing `history.replaceState`s the key back into the URL.
  - **iOS 16.4+ gotcha (v1.1.1):** Safari now honors web app manifests, so Add to
    Home Screen installs the manifest's `start_url` and *throws away* `?student=`.
    Fixed two ways at once: `applyHomeScreenIdentity()` swaps the `<link rel=manifest>`
    to that kid's own `<key>.webmanifest` (whose `start_url` carries the key, and whose
    `short_name` labels the icon with their name), and the last kid chosen is
    remembered on the device as a fallback. A missing `<key>.webmanifest` degrades
    safely — the manifest is ignored and iOS falls back to the current URL, which
    still has the query. Do not put `start_url` back into the shared
    `manifest.webmanifest` as anything but `./`.
  - Settings resolution: `localStorage['mathfacts_settings_v1']` → `config.js`
    fallback, then a background `?settings=1` fetch updates both. `refreshSettings()`
    deliberately **no-ops while a problem is on screen** so the rules never change
    mid-session; `S.seconds` is frozen at session start for the same reason.
  - **Mis-tap guard on `go` (v1.6).** `go` sits directly below 9 and beside 0 in the
    pad grid, so a kid reaching for a second digit taps it instead and submits a
    one-digit answer they never meant. `press()` therefore ignores `go` in exactly
    one case: the answer is a single digit **and** it arrived within
    `CONFIG.MISTAP_MS` (300ms) of that digit. It never consults the correct answer,
    so a fast single digit is swallowed even when it is right (3×3=9) — that is what
    makes it leak nothing and stop it being pressed repeatedly to probe. A *paused*
    single digit still submits, right or wrong; two or more digits always submit; the
    timer keeps running, so a swallowed press costs time. `del` clears the window.
    Do **not** "improve" this into auto-accepting a correct answer: `del` makes that
    brute-forceable (type, delete, retry, free), and the only non-exploitable version
    — commit the moment the typed prefix diverges from the answer — is *harsher* than
    this, since it removes the chance to fix a fat-fingered digit.
  - Countdown is a `requestAnimationFrame` loop against a `performance.now()` deadline
    drawn as an SVG ring; rAF is throttled when the tab is hidden, so backgrounding the
    app mid-problem loses that problem — deliberate, it stops the timer being dodged.
- `dashboard.html` — parent analytics + the settings editor. One tab per kid; every
  chart and the trouble list are filtered to the selected kid. Hand-rolled inline SVG
  line/bar charts, no libraries. Trouble-fact ranking normalizes commutative pairs
  (`7×9` ≡ `9×7`) and needs a fact missed in ≥2 of the last 10 sessions before it
  surfaces. The settings card posts `{type:'settings'}` back to the Apps Script and
  shows each kid's `?student=` link for texting to them.
- `apps-script/Code.gs` — the copy to paste into the Apps Script editor.
  - `doPost` branches on `payload.type`: `'settings'` → validate + rewrite the
    `Settings` tab; anything else → a session (validate → append → push to ntfy, where
    a push failure never fails the store).
  - `doGet` returns sessions + settings; `?settings=1` returns settings only (what the
    quiz asks for on every open); `?ping=1` is a health check.
  - Sessions are accepted by student **key or display name**, and only for a kid that
    exists in the `Settings` tab. Settings writes are clamped by `LIMITS`, never
    trusted. `PARENT_PIN` (default `''`) optionally gates settings writes — it works
    precisely because it is checked here and not in the public page source.
  - `testNotification` / `testAppendRow` / `showSettings` are for running by hand.
- `sw.js` — `CACHE = 'mathfacts-vN'`, **bump N on every deploy touching a cached
  file**. `config.js` is network-first (a `SCRIPT_URL` edit lands next open); everything
  else is cache-first with background refresh (code lands on the *second* open).
  Navigations are cached under their **bare path** — without that, `?student=ellie`
  misses the cache and offline breaks. Cross-origin requests — i.e. the Apps Script
  calls — are never intercepted.
- `dev-server.mjs` + `.claude/launch.json` (name `mathfacts`, port 8318). Uses
  `fileURLToPath`, not `URL.pathname`, because the directory name contains a space.
- Icons are generated, not hand-drawn: a white × on a blue gradient, written by a
  throwaway Node PNG encoder. Regenerate rather than editing by hand.

## Data model (two tabs in one spreadsheet)

**`Sessions`** — `Timestamp | ReceivedAt | StudentKey | Student | Score | Total |
Accuracy | ElapsedSeconds | AvgSecPerProblem | MissedCount | Missed`

- `Timestamp` is the phone's clock at finish (what the dashboard groups by);
  `ReceivedAt` is the server's. Both stored as ISO **text** — column format is forced
  to `@` so Sheets does not reformat them into locale dates.
- `StudentKey` is the stable id (`caleb`); `Student` is the display name *at the time
  of that session*, so renaming a kid does not rewrite history.
- `Missed` is JSON: `[{a, b, correct, given, timeout}]`. `given` is `''` on a timeout.

**`Settings`** — `Key | Name | MinFactor | MaxFactor | ProblemsPerSession |
SecondsPerProblem | UpdatedAt`

- Seeded from `DEFAULT_STUDENTS` in the script on first run, then owned by the
  dashboard. Rewritten wholesale on save, so a partial edit merges against the current
  row rather than blanking the untouched fields.

## Notifications, and how they fail

`NOTIFY_VIA` picks the path: `'ntfy'` (push, email on failure), `'email'` (never
touches ntfy), `'both'`. `NOTIFY_EMAIL` is the address for the latter two and the
fallback for the first.

Hard-won detail, all of it seen in one evening:

- **The root cause of the flakiness is ntfy's free-tier quota, not the network.**
  It comes back as `HTTP 429: daily message quota reached`. ntfy.sh rations per IP,
  and Apps Script sends from Google's shared egress, so the quota is shared with
  every other Apps Script user hitting ntfy and runs out at unpredictable times.
  `NTFY_TOKEN` (free ntfy account → Account → Access tokens) attributes the traffic
  to the account instead of that shared IP, which is the only way to keep real push.
- **It can also fail as `Address unavailable` after a ~50 second connection
  timeout.** `UrlFetchApp` has no timeout setting, so never add retries — that
  multiplies the hang. `doPost` cannot answer until the push returns and the quiz
  gives up at 12s, so that flavour of failure makes a perfectly stored session show
  "could not send". A 429 at least fails instantly.
- **`muteHttpExceptions: true` hides a rejected push.** The status code is now
  checked and non-2xx throws, and `doPost` returns `pushError`. Do not go back to
  swallowing it — a silent push failure cost hours.
- **Pasting a fresh `Code.gs` wipes `NTFY_TOPIC` back to the placeholder.** That
  happened, and sessions went to `PUT-YOUR-NTFY-TOPIC-HERE`, a world-readable topic
  named in this public repo, until it was spotted. The script now refuses to push to
  the placeholder and the dashboard shows a red banner. Always re-enter the topic
  after pasting.
- **Hand-editing CONFIG deleted `NTFY_SERVER`**, which built `http://undefined/<topic>`
  and failed as a DNS error. `ntfyServer_()` / `ntfyTitle_()` / `notifyEmail_()` now
  supply defaults, and the committed example email counts as unset.
- `testNotification` and `testConnectivity` (run by hand from the editor) are the
  fastest way to tell a config fault from a network one. The Executions panel shows
  the real exception; the quiz screen never will.

**Known, accepted, not yet fixed.** Measured about one ntfy failure in three. Brian
runs `'ntfy'` with `NOTIFY_EMAIL` set, so he always gets the result — but each
failure still costs the 50s hang, which outlasts the quiz's 12s timeout, so roughly
one session in three shows the kid "could not send" on a score that stored fine. He
chose to live with that for now. The fix, if it starts to grate: stop notifying
inside `doPost` — store the row, reply immediately, add a `Notified` column, and let
a time-driven trigger (every 5 min, added by hand in the editor) push anything
outstanding. That also retries failures for free, which suits a flaky route.
Alternatives considered: `NOTIFY_VIA: 'email'` (reliable, but not a push), or
swapping ntfy for Telegram / a Discord webhook.

## CORS, the one non-obvious bit

Apps Script web apps cannot answer a CORS preflight. The quiz therefore posts with
`Content-Type: text/plain;charset=utf-8`, which keeps it a "simple" request so no
`OPTIONS` is sent; `doPost` parses `e.postData.contents` itself. **Do not change that
content type to `application/json`** — it will start failing in the browser while
still working from curl.

## Deploying

Same as Palabritas — Pages serves the **gh-pages** branch; push main onto it:

```
git add -A && git commit -m "..."
git push origin main && git push origin main:gh-pages
```

- In Claude Code shells set `$env:GCM_INTERACTIVE = 'auto'` first, or the credential
  helper refuses to prompt.
- **Pushing is non-interactive; creating a repo is not.** Git Credential Manager has a
  GitHub token cached in Windows Credential Manager, so `git push` to an existing repo
  needs no prompt. The `gh` CLI is *not* installed, so a brand-new repo has to be
  created by Brian at github.com/new (that is why `MathFacts` is CamelCase and not the
  `math-facts` the first draft assumed). Note PowerShell wraps git's stderr as a
  scary-looking `NativeCommandError` even on a successful push — check the actual
  output lines, not the exception.
- Pages auto-enabled itself the moment `gh-pages` was first pushed; it took about
  40 seconds to go from 404 to 200.
- Remember the `sw.js` CACHE bump.
- Editing the Apps Script requires **Deploy → Manage deployments → New version**, or
  the phones keep running the old code at the same URL.

## Testing

- `node --check` on `sw.js` / `config.js`; inline `<script>` blocks parse-check with
  `new Function(...)`.
- `apps-script/Code.gs` can be run under Node with stubs for `SpreadsheetApp`,
  `LockService`, `UrlFetchApp`, `ContentService` — that is how doPost/doGet/validation
  and the ntfy body format were verified without touching Google. Going further, wrap
  that same sandbox in a tiny `http` server with `Access-Control-Allow-Origin: *` and
  point the pages' `CONFIG.SCRIPT_URL` at it: the quiz and dashboard then run the real
  script logic end to end (session → row → push → dashboard → settings save → quiz
  picks up the change) with no Google account involved. Worth rebuilding if you touch
  the contract.
- Service workers **do not register in the Claude Code browser pane** (any script
  fails with "unknown error when fetching the script"). Test offline behavior in real
  Safari.

## State / history

- v1.0.0 (2026-08-26): initial build — quiz, Apps Script, dashboard. Live on Pages the
  same day. Single kid, settings hard-coded in `config.js`.
- v1.1.0 (2026-08-26, current): Ellie added (1–10 at 12s) via `?student=` links; all
  practice settings moved out of `config.js` into the Sheet and made editable on the
  dashboard; optional `PARENT_PIN`; SW caches navigations by bare path so the
  `?student=` links stay offline-capable.
- v1.1.1 (2026-08-26, current): per-kid manifests + remembered student, because iOS
  was dropping `?student=` at Add to Home Screen. US spelling throughout — Brian
  flagged "practising"; use *practicing*, *normalize*, *behavior*.
- v1.6 (2026-09-02, current): mis-tap guard on the `go` key — Brian noticed the kids
  "sometimes press enter instead of the second digit". He raised auto-accepting a
  correct answer and worried it would let them type numbers until one worked; it
  would (see the `index.html` notes), so the timing guard went in instead. He
  declined, for now, the other half of the fix: swapping `del` and `go` in the pad so
  the mis-tap lands on a harmless, recoverable key rather than an irreversible one.
- Originally requested as copy-paste code blocks; Brian corrected that mid-build and
  asked for a real app pushed to GitHub like Palabritas.
- Brian still has to do the Google/ntfy setup in README steps 1–4 before scores go
  anywhere; `SCRIPT_URL` in `config.js` is still `''` as of v1.1.0.
- No known open bugs. Not requested, do not add unless asked: adaptive/weighted problem
  selection, division or other operations, login, per-kid notification topics.
