# NEMO Scenario Trainer — Maintenance Guide

This is the guide for the **Scenario Trainer** at `nemonu.org/trainer/`. It is a
separate section of the site with its own files, so nothing here touches the
protocol pages, the vault, or the proctor page.

**You do not need to know how to code to review a scenario.** You do need to be
careful: everything a student sees in the trainer is a clinical claim, and the
trainer is public.

## Quick reference

| When | What | Where |
|------|------|-------|
| A scenario has been clinically checked | Sign it off (see §2) | `trainer/gen_trainer.js` → that scenario's `OVERLAY` block |
| The Region X SOP changes | Update the edition string and re-check every cite | `trainer/gen_trainer.js` → `PROTOCOL_EDITION`, then §4 |
| A student reports a wrong finding/treatment | Fix the overlay, rebuild, validate | §3, §4 |
| Adding a new scenario | §5 | `trainer/proctor_data.json` + `OVERLAY` |
| Anything looks broken on the page | Open the GitHub Actions tab — "Validate scenario trainer" tells you why | github.com → Actions |

## 1. What's in the folder

```
trainer/
  index.html         the app (home, scenario runner, debrief) — one page, no build step
  sheets.js          GENERATED — medical & trauma skill sheets + critical-fail list
  scenarios.js       GENERATED — the 16 scenarios with cites, treatments, vitals
  gen_trainer.js     the generator: rebuilds the two files above
  proctor_data.json  the source scenario briefs — NOT in git, lives only on your computer
validate_trainer.py  checks the generated files before anything is published
.github/workflows/validate-trainer.yml   runs the validator on every push
```

**Never edit `sheets.js` or `scenarios.js` by hand.** They are overwritten every
time the generator runs. Edit `gen_trainer.js` (the `OVERLAY` section) instead.

## 2. Signing off a scenario (the important one)

Every scenario shows an **"Under review"** banner to students until one of the
approved reviewers (Nathan, Dylan, or Sophia) signs it off. To sign off:

1. Open the scenario in the trainer and run it end to end. Read every finding,
   every treatment result, and the debrief. Open each SOP citation link and
   confirm the page says what the trainer says.
2. Check that scenario's **reviewer flags** on the debrief page ("Sources &
   reviewer flags"). Each one is a spot where the SOP and the original brief
   didn't obviously agree. Resolve each — either the trainer is right, or fix it (§3).
3. In `trainer/gen_trainer.js`, find the scenario's block inside `OVERLAY`
   (search for its id, e.g. `"medical-3":`) and set:
   ```js
   reviewedBy: "Dylan Stone (Co-President)",
   reviewedOn: "2026-10-01",
   ```
   Use the exact name from the `REVIEWERS` list at the top of the file.
4. Rebuild and validate (§4), then commit.

Sign-off means *you personally checked it against the current SOP*. If you're
not sure, leave it unreviewed — the banner is doing its job.

## 3. Fixing clinical content

All clinical text lives in the `OVERLAY` object in `gen_trainer.js`, one block per
scenario. The fields you'll touch:

| Field | What it is | Rule |
|-------|-----------|------|
| `treatments[]` | Every intervention a student can choose | Each needs `verdict` (`indicated` / `not-indicated` / `contraindicated`), `scope` (`EMR` / `EMT` / `PM`), a `cite`, and a `result` sentence |
| `criticalAssessments[]` | Sheet items that, if skipped, fail the scenario | Must match a skill-sheet item word for word |
| `transport` | `priority` (`stable` / `unstable`), `destination`, `cite` | Cite the triage protocol or routine care |
| `vitals.after` / `afterNote` | What vitals look like after correct treatment | |
| `expectedTreatmentHtml`, `pitfallsHtml` | Debrief prose | Keep it to what the SOP actually says |
| `reviewerFlags[]` | Notes to whoever signs off | Delete a flag once resolved |

A **cite** looks like `S("acute-coronary-syndrome", 16)` for the SOP (the file
name in `assets/protocols/` without `.pdf`, then the page in the full SOP PDF) or
`T("ch19", 530)` for the textbook (chapter, then page). **The textbook wins over the SOP
whenever they disagree** (NEMO members work outside Region X, and the textbook is the more
broadly accurate reference; SOPs are cited for local specifics). Paraphrase the textbook; never paste from it.

## 4. Rebuild and validate

From the repo folder:

```bash
node trainer/gen_trainer.js
```
```bash
python3 validate_trainer.py
```

The validator **fails** (and GitHub will show a red ✗ on the commit) if any
treatment, critical assessment, or transport decision is missing a citation,
cites a protocol file that doesn't exist, uses an unknown verdict/scope, or if
any roster/evaluator/password identifier from the proctor page has leaked into
the generated files. It **warns** for every scenario not yet signed off.

## 5. Adding a scenario

1. Add the brief to `trainer/proctor_data.json` under `SCENARIOS`, in the same
   shape as the existing ones (id, title, type, complaint, dispatch, scene,
   vitals, responses keyed by skill-sheet item).
2. Add a matching block to `OVERLAY` in `gen_trainer.js` — copy the closest
   existing scenario and change every field.
3. Rebuild, validate, run it in the browser, then get it signed off (§2).

## 6. What must never go in the trainer

- **Roster or evaluator names, the proctor password, or the cloud-save secret.**
  `proctor_data.json` is git-ignored for this reason, and the generator refuses to
  run if any of those keys are present. The trainer is public.
- Anything from the textbook copied word for word.
- A treatment without a citation — the validator will stop you anyway.

## 7. Student progress

Progress badges on the home page are stored in the student's own browser
(`localStorage`). Nothing is sent anywhere. Clearing browser data clears it.

## 8. Reasoning mode & deterioration (Phase 2)

The trainer opens every run in **Reasoning mode**. The student sees no checklist —
they type what they would ask, check, or do, and findings reveal only when asked
for. The point is to make them decide *what* to ask and *why*, not pick from a list.
**Guided mode** (toggle at the top of a run) shows the classic checklists; switching
to it costs reasoning points but the skill-sheet score still works.

### How free text is matched

- `TRAINER_SYNONYMS` in `sheets.js` maps every askable sheet item and every scenario
  `extra` to a list of regexes. The synonym table lives in `gen_trainer.js`
  (`SYNONYMS`). The validator fails if any non-treatment sheet item or extra has no
  entry, or if a pattern is not a valid regex.
- Each treatment has a `match` regex (set automatically from the action name by the
  `tx()` helper, or override with `o.match`). On the Treatment tab, treatments are
  tried first; elsewhere, assessment items are tried first.
- One clear match reveals the finding. Several matches show **chips** so the student
  chooses what they meant (or "All of these"). Vital-sign items reveal together.
- No match → the student gets a nudge that gets more specific after repeated misses,
  and the miss is listed (not penalised) in the debrief.

### Impression checkpoint and confirm step

Treatments marked `needsImpression: true` (medications the student must justify —
set with `o.needsImpression` in the generator) and typing "field impression" both
open a four-option differential from `phase2.impression.options`. Exactly one option
is `correct`; every option carries a `why` and a cite because the debrief explains
all of them. After a correct pick the student must **name the finding that supports
it** in free text (matched against `criticalAssessments` synonyms) or skip.

### Treatment gates

`treatments[i].requires = [{any: [items], why, cite}]` lists assessments that must
be done first (e.g. lung sounds before a nebuliser). An unmet gate blocks the
treatment and shows `why`; the student can go ask for the item (the treatment then
applies automatically) or proceed anyway, which is logged as a gate override.
`GATE_RULES` in `gen_trainer.js` attaches gates by scenario/treatment.

### Stuck? tiers

1. **Hint** — a thinking framework for the current phase (no answers). −5 each.
2. **Show checklist** — reveals that tab's list; only offered after a hint. −10 per tab.

### Deterioration clock

`phase2.deterioration` is a list of timed events:
`{at: seconds, unless: {tx: [treatment indices]}, vitals: [[row, value]], narrative, cite}`.
When the run clock reaches `at` and none of the `unless` treatments has been given,
the vitals rows change, a "Patient update" banner appears, and the change is logged.
`vitals` rows must already exist in `vitals.initial` (or be "Mental status").
Events must be in ascending time order. Giving the treatment in time prevents the event.
After an event, asking for a changed row again (BP, pulse, RR, SpO₂, skin, AVPU, pupils,
BGL, lung sounds, cap refill) returns the live value marked "changed since your first look".
The clock is checked every second and also on every ask, tab change, and when the browser
tab becomes visible again (browsers throttle timers in hidden tabs), so an overdue event
fires at the next interaction rather than waiting for the timer.

### Reasoning score (separate from the skill-sheet score, out of 100)

| Penalty | Per | Cap |
|---|---|---|
| Wrong impression pick | −15 | −30 |
| Skipped the confirm step | −10 | −10 |
| Hint | −5 | −20 |
| Checklist reveal / Guided mode | −10 per tab (guided counts as ≥3) | −30 |
| Proceeding past a gate | −10 | −40 |
| Deterioration event fired | −10 | −30 |

These numbers, the hint wording (`HINTS` in `trainer/index.html`), and every
`why`/`narrative` string are student-facing content and need reviewer sign-off like
any other clinical text.

### Adding a scenario under Phase 2

Beyond §5: give every new `extra` a synonym entry, make sure each treatment's
`match` catches how students actually type it, write four impression options with
cites, add `requires` gates where the textbook says "assess before you treat", and
add one or two deterioration events tied to the critical treatment. Rebuild and run
the validator — it checks all of this.

**Golden rule: make one change at a time, rebuild, validate, and commit it.**
