# NEMO Website — Maintenance Guide

This is the NEMO website (`nemoemt.github.io`). It runs on **GitHub Pages**:
the files in this repository *are* the live website. When you change a file
here and save (commit) it, the website updates within a minute or two.

**You do not need to know how to code to keep this site running.** This guide
lists everything that needs updating and exactly how to do each one. Most
edits are done right here on GitHub by clicking a file, clicking the pencil
(✏️) icon, changing some text, and clicking the green **Commit changes**
button.

> **Golden rule:** make one change at a time and commit it. If something looks
> wrong afterward, the previous version is always saved in the file's
> **History**, so nothing is ever truly broken.

---

## Quick reference: what to update and when

| When | What | Where |
|------|------|-------|
| **Once a year** (spring exec turnover) | The status banner dates | `index.html` — see §1 |
| **Once a year** (spring exec turnover) | The leadership board | `people/board.csv` — see §2 |
| **A few times a year** | Open / close the application form | automatic via the banner dates — see §1 |
| **Every couple of years** | Renew the web domain | external — see §3 (current expiration: **2028**) |
| **As needed** | Add/replace a person's photo | `assets/` folder — see §2 |

---

## 1. The status banner (the gold scrolling bar at the top)

The gold bar at the top of the homepage, the "Apply" button, and the
"next cohort" text all change **automatically** depending on the time of year.
You never rewrite the banner sentence by hand — you just keep four dates
current, and the site figures out what to say.

The banner moves through these phases on its own as the calendar passes each
date:

1. **Before applications open** → "Applications for the 2027 cohort open October 1"
2. **While applications are open** → "Applications are open — apply by November 15" (and the Apply button turns on)
3. **After they close, before class** → "Applications are closed — the cohort begins January 6"
4. **While the course is running** → "The 2027 cohort is currently in training"
5. **Right after the course ends** → "Congratulations to the 2027 cohort!"

### How to update it (once a year)

1. Open **`index.html`** and click the pencil (✏️) to edit.
2. Use your browser's Find (Ctrl-F or Cmd-F) and search for **`BANNER_CONFIG`**.
3. You'll see a short block that looks like this:

   ```
   const BANNER_CONFIG = {
     cohortYear: 2027,                // the cohort being recruited / taught now

     applicationsOpen:  "2026-10-01", // apps OPEN on this date
     applicationsClose: "2026-11-15", // apps CLOSE (deadline) on this date
     classStarts:       "2027-01-06", // first day of the EMT course
     classEnds:         "2027-03-14"  // last day of the course / graduation
   };
   ```

4. Change the five values:
   - **`cohortYear`** — the year of the cohort you're recruiting/teaching now.
   - The **four dates** — keep the quotes and the `YYYY-MM-DD` format.
     `2026-10-01` means **October 1, 2026** (Year-Month-Day, with leading zeros).
5. Commit. That's it — the banner will show the right message all year.

> **The Apply button opens and closes itself.** When today's date is between
> `applicationsOpen` and `applicationsClose`, the button says "Apply now" and
> works. Outside that window it says "Applications closed" and is greyed out.
> You don't toggle it manually.

### If the application *form link* changes

The dates control *when* the button is active; the link it points to is set
separately (once). In `index.html`, search for **`APPLICATION FORM`** — right
below that comment is the `Application` link with the Google Form URL. Replace
just the web address inside the quotes, keep everything else, and commit.

---

## 2. The leadership board (exec photos on the homepage)

Everyone on the leadership row — and each person's individual profile page —
comes from **one file**: `people/board.csv`. You never edit the homepage or
the individual profile pages by hand; you edit the CSV, and the site rebuilds
the pages for you automatically.

> There is a separate, detailed walkthrough in **`LEADERSHIP_README.md`** in
> this repo. The short version is below.

### To change the board (once a year, at turnover)

1. Open **`people/board.csv`** and click the pencil (✏️).
2. Each person is one row: `order, name, role, email, school/year, major,
   fun-fact label, fun-fact, bio, slug`. You only need `name` and `role`;
   the rest are optional and can be left blank.
   - **Rename someone / change a role:** edit their `name` or `role`.
   - **Add someone:** add a new row.
   - **Remove someone:** delete their row (their page is removed automatically).
   - **Reorder:** change the numbers in the `order` column.
3. Commit. Within a minute the homepage and that person's profile page update.

### Photos

The site finds each person's photo by their name. Upload the photo to the
**`assets/`** folder named **`firstname-lastname.jpg`**, all lowercase, with a
hyphen — for example **`adam-dipasquale.jpg`**. If the photo isn't there, the
person's photo frame is simply blank until you add it. *The website cannot
create a photo for you — you have to upload the image file.*

### A note on bios with long text

A bio can be long. If you write a bio with commas in it, the spreadsheet/CSV
needs that whole bio wrapped in "quotes" (a spreadsheet program does this for
you automatically). If you ever see a yellow warning on the CSV page in GitHub
about "columns," it usually means a bio has a stray line break — put the whole
paragraph on one line, or use `||` where you want a paragraph break, and the
warning goes away. (This is cosmetic and usually doesn't break the site, but
it's tidier to fix.)

---

## 3. Renewing the web domain

The site is reached at its web address (domain). **The current registration
is paid through 2028.** Before it expires, someone needs to renew it with
whatever registrar NEMO used to buy it, using the NEMO account/payment on
file.

> **Action for the exec who set this up:** record *which registrar* the domain
> was purchased from and *which account/email* it's under, right here:
>
> - Registrar: _______________________
> - Account / login email: _______________________
> - Expiration date: **2028** (confirm exact date at renewal time)
>
> Filling this in now saves a future exec from a scramble if the site ever
> goes dark because the domain lapsed. Set a calendar reminder a month before
> expiration.

If the domain ever does lapse, the site itself isn't lost — all the files are
still safe here in GitHub. Only the custom web address stops pointing at it
until the domain is renewed.

---

## 4. How to make any edit (the basics)

For anyone who hasn't used GitHub before:

1. Click the file you want to change (e.g. `index.html` or `people/board.csv`).
2. Click the **pencil (✏️) icon** near the top right of the file.
3. Make your change in the editor.
4. Scroll down, optionally type a short note about what you changed, and click
   the green **Commit changes** button.
5. Wait about a minute, then refresh the live site to see it. (If it looks
   unchanged, do a "hard refresh": **Ctrl-Shift-R** or **Cmd-Shift-R** — your
   browser may be showing a saved copy.)

**To undo a mistake:** open the file, click **History** (top right), open an
earlier version, and you can restore it. Nothing is ever permanently lost.

---

## 5. If something looks broken

- **The banner shows the wrong thing:** check the dates in `BANNER_CONFIG`
  (§1). The message is decided entirely by today's date vs. those dates.
- **A new exec's photo is blank:** the photo file is missing or misnamed in
  `assets/`. It must be `firstname-lastname.jpg`, lowercase (§2).
- **The board didn't update after editing the CSV:** go to the **Actions** tab
  at the top of the repo. There should be a recent "Build leadership pages" run
  with a green check. If it has a red ✗, click it — the log says what's wrong
  (usually a formatting problem in the CSV). Fix the CSV and commit again.
- **Anything else:** the file's **History** has every previous version. Restore
  the last good one and the site reverts.

---

*This site is plain HTML hosted on GitHub Pages. The leadership pages are
generated by `build_leadership.py` (run automatically by GitHub Actions when
`people/board.csv` changes). The status banner is driven by `BANNER_CONFIG` in
`index.html`. No servers, databases, or paid hosting are involved — just these
files.*
