# Math Facts — project handoff

Timed multiplication-facts PWA for Brian's 10-year-old son **Caleb**, plus a parent
dashboard. Sibling project to Palabritas (`C:\Users\brian\Desktop\Spelling`) and
deliberately follows the same shape: vanilla HTML/CSS/JS, no build step, no
dependencies, GitHub Pages, Add to Home Screen.

- **Quiz:** https://gwallee.github.io/MathFacts/
- **Dashboard:** https://gwallee.github.io/MathFacts/dashboard.html
- **Repo:** https://github.com/gwallee/MathFacts (public)

## Architecture

```
quiz (index.html) --POST json--> Apps Script doPost --> Google Sheet
                                        |
                                        +--UrlFetchApp--> ntfy.sh --> Brian's phone
dashboard.html --GET--> Apps Script doGet --> JSON --> charts
```

Unlike Palabritas (all local storage), the source of truth here is a Google Sheet that
**neither Brian nor Caleb ever opens directly**. The Apps Script web app is the only
door in or out.

## Hard requirements (from Brian)

- Multiplication only, factors **3–12**. He explicitly excluded ×2 ("don't need 5 x 2,
  but I do want 5 x 3") and explicitly capped it at 12 ("don't go past 12 either").
- 20 problems, 8-second timer per problem, timeout counts as a miss.
- **Purely random selection — no adaptive weighting.** Misses are logged for analysis
  on the dashboard, never re-asked in the session. (This is the opposite of Palabritas,
  which re-queues misses. Do not "improve" it into an adaptive quiz.)
- The **ntfy topic must never appear in the quiz or dashboard source** — only in the
  Apps Script. The committed `apps-script/Code.gs` therefore carries a placeholder.
- No login on the dashboard; an obscure URL is accepted security.
- If the upload fails, the score screen must tell Caleb to show a parent.

## File map

- `config.js` — **every setting for both pages**, one commented block. The only file
  Brian ever needs to edit (he pastes the Apps Script `/exec` URL into `SCRIPT_URL`).
  Both HTML files carry a `DEFAULTS` object as a fallback if it fails to load.
- `index.html` — the quiz. Three screens (start / play / done) in one file. Countdown
  is a `requestAnimationFrame` loop against a `performance.now()` deadline drawn as an
  SVG ring; note rAF is throttled when the tab is hidden, so backgrounding the app
  mid-problem loses that problem — deliberate, it stops the timer being dodged.
- `dashboard.html` — parent analytics. Hand-rolled inline SVG line/bar charts, no
  libraries. Trouble-fact ranking normalises commutative pairs (`7×9` ≡ `9×7`) and
  needs a fact missed in ≥2 of the last 10 sessions before it surfaces.
- `apps-script/Code.gs` — the copy to paste into the Apps Script editor. `doPost`
  validates → appends a row → pushes to ntfy (a push failure never fails the store).
  `doGet` returns rows as JSON. `testNotification` / `testAppendRow` are for running
  by hand from the editor.
- `sw.js` — `CACHE = 'mathfacts-vN'`, **bump N on every deploy touching a cached
  file**. `config.js` is network-first (settings land next open); everything else is
  cache-first with background refresh (code lands on the *second* open). Cross-origin
  requests — i.e. the Apps Script calls — are never intercepted.
- `dev-server.mjs` + `.claude/launch.json` (name `mathfacts`, port 8318). Uses
  `fileURLToPath`, not `URL.pathname`, because the directory name contains a space.
- Icons are generated, not hand-drawn: a white × on a blue gradient, written by a
  throwaway Node PNG encoder. Regenerate rather than editing by hand.

## Data model (Sheet columns)

`Timestamp | ReceivedAt | Student | Score | Total | Accuracy | ElapsedSeconds |
AvgSecPerProblem | MissedCount | Missed`

- `Timestamp` is the phone's clock at finish (what the dashboard groups by);
  `ReceivedAt` is the server's. Both stored as ISO **text** — column format is forced
  to `@` so Sheets does not reformat them into locale dates.
- `Missed` is JSON: `[{a, b, correct, given, timeout}]`. `given` is `''` on a timeout.

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
  and the ntfy body format were verified without touching Google.
- Service workers **do not register in the Claude Code browser pane** (any script
  fails with "unknown error when fetching the script"). Test offline behaviour in real
  Safari.

## State / history

- v1.0.0 (2026-08-26, current): initial build — quiz, Apps Script, dashboard. Live on
  Pages the same day. Brian still has to do the Google/ntfy setup in README steps 1–4
  before scores actually go anywhere; `SCRIPT_URL` in `config.js` is still `''`.
- Originally requested as copy-paste code blocks; Brian corrected that mid-build and
  asked for a real app pushed to GitHub like Palabritas.
- No known open bugs. Not requested, do not add unless asked: adaptive/weighted
  problem selection, division or other operations, multiple kids, login.
