# Math Facts

Timed multiplication practice for Caleb, plus a parent dashboard.

- **Quiz (Caleb's phone):** https://gwallee.github.io/MathFacts/
- **Dashboard (your phone):** https://gwallee.github.io/MathFacts/dashboard.html

No accounts and no login anywhere. Results go to a private Google Sheet through a
Google Apps Script web app, which also pushes a notification to your phone via
[ntfy.sh](https://ntfy.sh). Neither of you ever has to open the Sheet.

```
Caleb's phone  --POST-->  Apps Script  --append-->  Google Sheet
                              |
                              +--push-->  ntfy.sh  -->  your phone

Your phone  --GET-->  Apps Script  --read-->  Google Sheet  -->  dashboard
```

---

## Setup — do these once, in order

Steps 1–3 take about ten minutes. Nothing here needs a computer except step 2,
which is much easier on one.

### 1. Pick an ntfy topic

A topic is just a name. Anyone who knows it can read your notifications, so make it
unguessable. Suggested:

```
caleb-math-facts-q7v2rk9xz4
```

Change a few characters so it is genuinely yours, then write it down — you need it
twice below. **Never put this topic in `config.js` or in either HTML file.** It only
ever belongs in the Apps Script, which is private to your Google account.

### 2. Create the Sheet and the Apps Script

1. Go to [sheets.new](https://sheets.new) and name the spreadsheet
   `Caleb Math Facts`. Do not add any headers — the script creates its own tab and
   header row the first time it runs.
2. In that sheet: **Extensions → Apps Script**. Delete whatever is in `Code.gs`.
3. Copy the entire contents of [`apps-script/Code.gs`](apps-script/Code.gs) from this
   repo and paste it in.
4. At the top, replace `PUT-YOUR-NTFY-TOPIC-HERE` with the topic from step 1.
   Save (the disk icon).
5. Test the push before deploying: in the function dropdown at the top pick
   **`testNotification`**, click **Run**, and approve the permission prompts. Google
   will warn that the app is unverified — click **Advanced → Go to (project name)**,
   then **Allow**. This is your own script; the warning is expected.
   (Your phone will not buzz yet — set up ntfy in step 3, then run it again.)
6. Deploy: **Deploy → New deployment → gear icon → Web app**.
   - Description: anything
   - **Execute as: Me**
   - **Who has access: Anyone**  ← required, or the phones cannot reach it
   - Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.
7. Sanity check: paste that URL into a browser with `?ping=1` on the end. You should
   see `{"ok":true,"pong":true,...}`.

> **Whenever you edit the Apps Script later**, you must deploy a *new version* or the
> phones keep running the old code: **Deploy → Manage deployments → pencil icon →
> Version: New version → Deploy**. The URL stays the same.

### 3. Subscribe to the topic on your phone

1. Install **ntfy** from the App Store (or Play Store).
2. Open it, tap **+**, and enter your topic name exactly. Leave the server as the
   default `ntfy.sh`.
3. Allow notifications when iOS asks.
4. Back in the Apps Script editor, run **`testNotification`** again. Your phone should
   buzz with `Finished: 18/20 in 2:41` and the missed facts.

### 4. Put the URL into the app

Everything the two web pages need lives in one file: **`config.js`**.

1. Open [`config.js`](config.js) here on GitHub and click the pencil icon.
2. Paste your `/exec` URL between the quotes on the `SCRIPT_URL` line.
3. Commit. GitHub Pages redeploys in 30–60 seconds.

That is the only edit either page ever needs. Every other setting — the 3–12 range,
20 problems, the 8-second timer, the dashboard windows — is in that same file, each
line commented.

### 5. Add the quiz to Caleb's phone

On his phone, in **Safari** (not Chrome — only Safari can install to the home screen):

1. Go to https://gwallee.github.io/MathFacts/
2. Tap the **Share** button (square with an up arrow).
3. **Add to Home Screen** → name it `Math Facts` → **Add**.

Launch it from that icon, not from Safari. It then runs full-screen with no address
bar, and works offline.

### 6. Bookmark the dashboard on your phone

Open https://gwallee.github.io/MathFacts/dashboard.html and add it to your home
screen the same way, or just bookmark it. There is no login — the URL is the only
thing protecting it, which is fine for multiplication scores.

---

## How the pieces behave

**Quiz.** 20 random multiplication problems, factors 3–12 (no ×2 problems, nothing
above 12). Each problem gets an 8-second countdown ring; running out counts as a miss
exactly like a wrong answer. Selection is purely random — a missed fact is *not*
re-asked, it is only logged. The end screen shows the score, total time, and every
fact he missed with what he typed.

**Offline.** The app is cached on the phone, so it opens and runs with no signal. If
the score cannot be uploaded, the screen tells him in plain words to show a parent,
and the session is kept on the phone and sent automatically the next time the app is
opened with a connection. Nothing is lost.

**Notification.** One push per finished session:

```
Math facts - Caleb 17/20
Finished: 17/20 in 2:41
Missed: 11x3=33 (said 34), 12x6=72 (said 73), 12x4=48 (ran out of time)
```

Below 80% it is sent at higher priority so it breaks through.

**Dashboard.** Sessions per week, accuracy trend, seconds-per-problem trend, the
recent session list, and a **trouble facts** ranking: facts missed in at least 2 of
the last 10 sessions, so a single bad guess stays noise and only real patterns
surface. `7×9` and `9×7` count as the same fact. It also shows what he answered
instead, which is usually the interesting part.

---

## Notes for future changes

- `sw.js` has `const CACHE = 'mathfacts-vN'`. **Bump N on every deploy that changes a
  cached file** — that is the only cache-busting mechanism. Phones then pick the
  change up on the *second* open (first open downloads, second runs it). `config.js`
  is deliberately network-first, so settings edits land on the very next open.
- The Apps Script web app is deployed as "Anyone", so anyone who learns the `/exec`
  URL could post junk sessions. The script only accepts sessions for the configured
  student name and range-checks every field, which is as far as it is worth going for
  this. If it ever matters, add a shared secret to the payload — but note that the
  quiz page is public source, so any secret in it is public too.
- The copy of `Code.gs` in this repo carries a placeholder topic on purpose. The real
  topic exists only in the Apps Script editor.
- Local testing: `node dev-server.mjs`, then http://localhost:8318. Service workers do
  not register in embedded browsers — test the offline behaviour in real Safari.
