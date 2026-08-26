# Math Facts

Timed multiplication practice for Caleb and Ellie, plus a parent dashboard.

- **Caleb's quiz:** https://gwallee.github.io/MathFacts/?student=caleb
- **Ellie's quiz:** https://gwallee.github.io/MathFacts/?student=ellie
- **Dashboard (your phone):** https://gwallee.github.io/MathFacts/dashboard.html

Each kid gets their own link with their own range and timer. Opening the plain
address instead shows a "who's practising?" picker.

No accounts and no login anywhere. Results go to one private Google Sheet through a
Google Apps Script web app, which also pushes a notification to your phone via
[ntfy.sh](https://ntfy.sh). Neither of you ever has to open the Sheet.

```
kid's phone  --POST-->  Apps Script  --append-->  Google Sheet
                            |
                            +--push-->  ntfy.sh  -->  your phone

your phone   --GET--->  Apps Script  --read---->  Google Sheet  -->  dashboard
             --POST-->  Apps Script  --write--->  practice settings
```

**Where settings live:** the range, problem count and seconds-per-problem for each kid
live in the Sheet and are edited at the bottom of the dashboard, on your phone. You do
not edit code to retune the timer. The only thing in `config.js` is the Apps Script
address.

---

## Setup — do these once, in order

Steps 1–3 take about ten minutes. Only step 2 really wants a computer.

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

1. Go to [sheets.new](https://sheets.new) and name the spreadsheet **`Math Facts`**
   (one Sheet covers both kids). Do not add any headers — the script creates its own
   `Sessions` and `Settings` tabs the first time it runs.
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

1. Open [`config.js`](config.js) here on GitHub and click the pencil icon.
2. Paste your `/exec` URL between the quotes on the `SCRIPT_URL` line.
3. Commit. GitHub Pages redeploys in 30–60 seconds.

That is the only code edit this project ever needs.

### 5. Add each kid's quiz to their phone

On the kid's phone, in **Safari** (not Chrome — only Safari can install to the home
screen):

1. Go to their link — `…/MathFacts/?student=caleb` or `…/MathFacts/?student=ellie`.
   The dashboard shows each kid's link at the bottom of their settings card, so you
   can just text it to them.
2. Tap the **Share** button (square with an up arrow).
3. **Add to Home Screen** → name it `Math Facts` → **Add**.

Launch it from that icon, not from Safari. It then runs full-screen with no address
bar, and works offline. The `?student=` tag is remembered by the icon, so it always
opens as the right kid.

### 6. Bookmark the dashboard on your phone

Open https://gwallee.github.io/MathFacts/dashboard.html and add it to your home screen
the same way, or just bookmark it. There is no login — the URL is the only thing
protecting it, which is fine for multiplication scores.

---

## Day-to-day

### Changing a kid's settings

Open the dashboard, tap that kid's tab, scroll to the bottom. You can change:

| Setting | Notes |
|---|---|
| Name | what the quiz greets them with |
| Seconds per problem | how long before it counts as a miss |
| Smallest number | e.g. 3 skips every ×2 fact |
| Largest number | |
| Problems per session | |

Tap **Save**. The change is stored in the Sheet, and the kid's phone picks it up the
next time the app opens. Starting values are Caleb 3–12 at 8 seconds, Ellie 1–10 at
12 seconds.

### Adding a third kid

Add a key to the `STUDENTS` block in `config.js`, commit, then open the dashboard —
the new kid appears as a tab and gets their own `?student=` link. (The Sheet seeds
itself from `config.js` only on the very first run, so for a later addition you can
also just add a row to the `Settings` tab by hand.)

### Locking the settings editor (optional)

The dashboard URL is unlisted but not secret. If you want the settings editor locked,
set `PARENT_PIN` to a short code near the top of the Apps Script and redeploy a new
version. The dashboard will then ask for it once and remember it. Because the PIN is
checked inside the Apps Script and never appears in the public page source, it is a
real lock.

---

## How the pieces behave

**Quiz.** Random multiplication problems within that kid's range. Each problem gets a
countdown ring; running out counts as a miss exactly like a wrong answer. Selection is
purely random — a missed fact is *not* re-asked, only logged. The end screen shows the
score, total time, and every fact missed along with the answer that was typed.

**Offline.** The app is cached on the phone, so it opens and runs with no signal, using
the last settings it synced. If a score cannot be uploaded, the screen says so in plain
words and asks them to show a parent, and the session is kept on the phone and sent
automatically the next time the app opens with a connection. Nothing is lost.

**Notification.** One push per finished session, naming the kid:

```
Math facts - Ellie 18/20
Finished: 18/20 in 3:40
Missed: 6x6=36 (said 37), 7x7=49 (ran out of time)
```

Below 80% it is sent at higher priority so it breaks through.

**Dashboard.** One tab per kid. Sessions per week, accuracy trend, seconds-per-problem
trend, the recent session list, and a **trouble facts** ranking: facts missed in at
least 2 of the last 10 sessions, so a single bad guess stays noise and only real
patterns surface. `7×9` and `9×7` count as the same fact. It also shows the wrong
answers that were given, which is usually the interesting part.

---

## Notes for future changes

- `sw.js` has `const CACHE = 'mathfacts-vN'`. **Bump N on every deploy that changes a
  cached file** — that is the only cache-busting mechanism. Phones then pick the change
  up on the *second* open (first open downloads, second runs it). `config.js` is
  deliberately network-first, and practice settings come from the Sheet, so neither of
  those has the two-open lag.
- The Apps Script web app is deployed as "Anyone", so anyone who learns the `/exec` URL
  could post junk sessions or change the practice settings. Sessions are only accepted
  for a known student and every field is range-checked; `PARENT_PIN` closes the
  settings side if you want it. A secret inside the quiz page itself would be pointless
  — that source is public.
- The copy of `Code.gs` in this repo carries a placeholder topic on purpose. The real
  topic exists only in the Apps Script editor.
- Local testing: `node dev-server.mjs`, then http://localhost:8318. Service workers do
  not register in embedded browsers — test the offline behaviour in real Safari.
