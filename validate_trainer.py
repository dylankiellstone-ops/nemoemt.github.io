#!/usr/bin/env python3
"""Validate the Scenario Trainer data files (trainer/sheets.js, trainer/scenarios.js).

Fails (exit 1) on anything that could put wrong or uncited clinical content in
front of a student; warns on scenarios that have not been clinically reviewed.
Run from the repo root:  python3 validate_trainer.py
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TRAINER = ROOT / "trainer"
PROTOCOLS = ROOT / "assets" / "protocols"

VERDICTS = {"indicated", "not-indicated", "contraindicated"}
SCOPES = {"EMR", "EMT", "PM"}
TYPES = {"medical", "trauma"}
PRIORITIES = {"stable", "unstable"}
TXT_REF = re.compile(r"^(ch\d{1,2}|appA)$")
FORBIDDEN = re.compile(r"\b(ROSTER|EVALUATORS|ACCESS_PASSWORD|CLOUD_SAVE_SECRET)\b")

errors, warnings = [], []
def err(msg): errors.append(msg)
def warn(msg): warnings.append(msg)


def load_js(path):
    """Parse `window.NAME = <json>;` assignments out of a generated data file."""
    text = path.read_text(encoding="utf-8")
    if FORBIDDEN.search(text):
        err(f"{path.name}: contains proctor-page identifiers (roster/evaluator/secret) — must not be published")
    out = {}
    for m in re.finditer(r"^window\.(\w+)\s*=\s*", text, re.M):
        start = m.end()
        dec = json.JSONDecoder()
        try:
            obj, end = dec.raw_decode(text, start)
        except json.JSONDecodeError as e:
            err(f"{path.name}: could not parse window.{m.group(1)}: {e}")
            continue
        out[m.group(1)] = obj
    return out


def check_cite(c, where, required=True):
    if c is None:
        if required:
            err(f"{where}: missing cite")
        return
    if not isinstance(c, dict) or not {"src", "ref", "page"} <= set(c):
        err(f"{where}: cite must be {{src, ref, page}}, got {c!r}")
        return
    if c["src"] == "SOP":
        if not (PROTOCOLS / f"{c['ref']}.pdf").exists():
            err(f"{where}: SOP ref '{c['ref']}' has no assets/protocols/{c['ref']}.pdf")
    elif c["src"] == "TXT":
        if not TXT_REF.match(str(c["ref"])):
            err(f"{where}: TXT ref must look like ch19 or appA, got '{c['ref']}'")
    elif c["src"] not in {"AHA", "NREMT"}:
        err(f"{where}: unknown cite src '{c['src']}'")
    if not isinstance(c["page"], int) or c["page"] < 1:
        err(f"{where}: cite page must be a positive integer, got {c['page']!r}")


def sheet_items(sheet, complaints=False):
    items = set()
    for sec in sheet.get("sections", []):
        for it in sec.get("items", []):
            items.add(it["item"])
    if complaints:
        for c in sheet.get("complaints", {}).values():
            for sec in c.get("sections", []):
                for it in sec.get("items", []):
                    items.add(it["item"])
    return items


def treatment_items(sheet):
    """Sheet items that are actions, not questions (`treatment: true` or inside a
    `treatmentSection`). The client handles them through treatments[].match, so
    they need no synonyms."""
    items = set()
    secs = list(sheet.get("sections", []))
    for c in sheet.get("complaints", {}).values():
        secs += c.get("sections", [])
    for sec in secs:
        for it in sec.get("items", []):
            if it.get("treatment") or sec.get("treatmentSection"):
                items.add(it["item"])
    return items


def valid_regex(s):
    try:
        re.compile(s)
        return True
    except re.error:
        return False


def main():
    sheets = load_js(TRAINER / "sheets.js")
    data = load_js(TRAINER / "scenarios.js")
    S = sheets.get("TRAINER_SHEETS")
    fails = sheets.get("TRAINER_CRITICAL_FAILS")
    scenarios = data.get("TRAINER_SCENARIOS")
    synonyms = sheets.get("TRAINER_SYNONYMS")
    if not S or not fails or scenarios is None or synonyms is None:
        err("missing TRAINER_SHEETS / TRAINER_CRITICAL_FAILS / TRAINER_SYNONYMS / TRAINER_SCENARIOS")
        return
    for k in ("PROTOCOL_EDITION", "TEXTBOOK_EDITION", "REVIEWERS"):
        if k not in data:
            err(f"scenarios.js: missing window.{k}")
    for t in TYPES:
        if t not in S:
            err(f"sheets.js: missing '{t}' sheet")
    n_fail = len(fails)

    ids = set()
    for sc in scenarios:
        sid = sc.get("id", "?")
        w = f"[{sid}]"
        if sid in ids:
            err(f"{w}: duplicate id")
        ids.add(sid)
        for k in ("title", "tag", "type", "patient", "meta", "dispatch", "scene", "vitals", "responses", "treatments", "transport"):
            if k not in sc:
                err(f"{w}: missing '{k}'")
        if sc.get("type") not in TYPES:
            err(f"{w}: type must be medical|trauma")
            continue
        sheet = S.get(sc["type"], {})
        known = sheet_items(sheet, complaints=(sc["type"] == "medical"))
        if sc["type"] == "medical":
            if sc.get("complaint") not in sheet.get("complaints", {}):
                err(f"{w}: complaint '{sc.get('complaint')}' is not a medical sheet branch")
        meta = sc.get("meta", {})
        if not meta.get("reviewedBy"):
            warn(f"{w}: not yet clinically reviewed (meta.reviewedBy is empty)")
        elif not meta.get("reviewedOn"):
            err(f"{w}: reviewedBy set but reviewedOn missing")
        for i, c in enumerate(meta.get("sources", [])):
            check_cite(c, f"{w} meta.sources[{i}]")
        if not meta.get("sources"):
            err(f"{w}: meta.sources is empty — every scenario needs at least one SOP/textbook source")

        v = sc.get("vitals", {})
        for k in ("initial", "after"):
            if not v.get(k):
                err(f"{w}: vitals.{k} is empty")
        for k, resp in sc.get("responses", {}).items():
            if k not in known:
                err(f"{w}: response for unknown sheet item '{k}'")
        tx = sc.get("treatments", [])
        if not tx:
            err(f"{w}: no treatments")
        if not any(t.get("verdict") == "indicated" for t in tx):
            err(f"{w}: no indicated treatment")
        for i, t in enumerate(tx):
            tw = f"{w} treatments[{i}] '{t.get('action', '?')}'"
            if t.get("verdict") not in VERDICTS:
                err(f"{tw}: verdict must be one of {sorted(VERDICTS)}")
            if t.get("scope") not in SCOPES:
                err(f"{tw}: scope must be one of {sorted(SCOPES)}")
            if not t.get("result"):
                err(f"{tw}: missing result text")
            check_cite(t.get("cite"), tw)
            fc = t.get("failCategory")
            if fc is not None and not (isinstance(fc, int) and 0 <= fc < n_fail):
                err(f"{tw}: failCategory must be null or 0..{n_fail - 1}")
            if t.get("critical") and t.get("verdict") == "indicated" and fc is None:
                warn(f"{tw}: critical indicated treatment without failCategory (defaults to 'competent EMT')")
        for i, ca in enumerate(sc.get("criticalAssessments", [])):
            cw = f"{w} criticalAssessments[{i}]"
            if ca.get("item") not in known:
                err(f"{cw}: item '{ca.get('item')}' is not on the {sc['type']} sheet")
            if not ca.get("label"):
                err(f"{cw}: missing label")
            check_cite(ca.get("cite"), cw)
        # ---- Phase 2: reasoning mode + deterioration ----
        extras = sc.get("extras", []) or []
        extra_items = set()
        for i, x in enumerate(extras):
            xw = f"{w} extras[{i}]"
            if not x.get("item") or not x.get("text"):
                err(f"{xw}: needs both item and text")
                continue
            extra_items.add(x["item"])
            if x["item"] in known:
                err(f"{xw}: '{x['item']}' duplicates a sheet item — put its text in responses instead")
            if x["item"] not in synonyms:
                err(f"{xw}: '{x['item']}' has no TRAINER_SYNONYMS entry — students cannot ask for it in reasoning mode")
        askable = known | extra_items
        for i, t in enumerate(tx):
            tw = f"{w} treatments[{i}] '{t.get('action', '?')}'"
            m = t.get("match")
            if not m or not isinstance(m, str) or not valid_regex(m):
                err(f"{tw}: match must be a non-empty valid regex (students type treatments in reasoning mode)")
            if not isinstance(t.get("needsImpression", False), bool):
                err(f"{tw}: needsImpression must be true/false")
            for j, g in enumerate(t.get("requires", []) or []):
                gw = f"{tw} requires[{j}]"
                anys = g.get("any") or []
                if not anys:
                    err(f"{gw}: 'any' list is empty")
                for it in anys:
                    if it not in askable:
                        err(f"{gw}: gate item '{it}' is not a sheet item or scenario extra")
                if not g.get("why"):
                    err(f"{gw}: missing why (shown to the student when the gate blocks a treatment)")
                check_cite(g.get("cite"), gw)
        p2 = sc.get("phase2")
        if not isinstance(p2, dict):
            err(f"{w}: missing phase2 block (impression + deterioration)")
        else:
            opts = (p2.get("impression") or {}).get("options") or []
            n_correct = sum(1 for o in opts if o.get("correct"))
            if n_correct != 1:
                err(f"{w} phase2.impression: exactly one option must be correct (found {n_correct})")
            if len(opts) - n_correct < 2:
                err(f"{w} phase2.impression: need at least two distractor impressions")
            labels = set()
            for i, o in enumerate(opts):
                ow = f"{w} phase2.impression.options[{i}]"
                if not o.get("label"):
                    err(f"{ow}: missing label")
                elif o["label"] in labels:
                    err(f"{ow}: duplicate label '{o['label']}'")
                labels.add(o.get("label"))
                if not o.get("why"):
                    err(f"{ow}: missing why (the debrief explains every differential)")
                check_cite(o.get("cite"), ow)
            det = p2.get("deterioration")
            if not isinstance(det, list):
                err(f"{w} phase2.deterioration must be a list (may be empty)")
                det = []
            vital_rows = {r[0] for r in v.get("initial", []) if isinstance(r, list) and r} | {"Mental status"}
            last_at = 0
            for i, e in enumerate(det):
                ew = f"{w} phase2.deterioration[{i}]"
                at = e.get("at")
                if not isinstance(at, int) or at <= 0:
                    err(f"{ew}: at must be a positive number of seconds")
                elif at <= last_at:
                    err(f"{ew}: events must be in ascending time order")
                else:
                    last_at = at
                for k in (e.get("unless") or {}).get("tx", []) or []:
                    if not isinstance(k, int) or not 0 <= k < len(tx):
                        err(f"{ew}: unless.tx index {k!r} is not a treatment index")
                    elif tx[k].get("verdict") != "indicated":
                        warn(f"{ew}: unless.tx[{k}] '{tx[k].get('action')}' is not an indicated treatment")
                rows = e.get("vitals") or []
                if not rows:
                    err(f"{ew}: no vitals change")
                for r in rows:
                    if not (isinstance(r, list) and len(r) == 2 and all(isinstance(s, str) and s for s in r)):
                        err(f"{ew}: vitals rows must be [label, value] strings, got {r!r}")
                    elif r[0] not in vital_rows:
                        err(f"{ew}: vitals row '{r[0]}' is not in vitals.initial (rows: {sorted(vital_rows)})")
                if not e.get("narrative"):
                    err(f"{ew}: missing narrative")
                check_cite(e.get("cite"), ew)
        tr = sc.get("transport", {})
        if tr.get("priority") not in PRIORITIES:
            err(f"{w}: transport.priority must be stable|unstable")
        if not tr.get("destination"):
            err(f"{w}: transport.destination missing")
        check_cite(tr.get("cite"), f"{w} transport")

    # ---- Synonyms table (reasoning-mode matcher) ----
    all_items, all_extras, tx_items = set(), set(), set()
    for t in TYPES:
        all_items |= sheet_items(S.get(t, {}), complaints=True)
        tx_items |= treatment_items(S.get(t, {}))
    for sc in scenarios:
        for x in sc.get("extras", []) or []:
            if x.get("item"):
                all_extras.add(x["item"])
    for key, pats in synonyms.items():
        if key not in all_items | all_extras:
            err(f"TRAINER_SYNONYMS: '{key}' is not a sheet item or scenario extra")
        if not isinstance(pats, list) or not pats:
            err(f"TRAINER_SYNONYMS['{key}']: must be a non-empty list of regex strings")
            continue
        for ptn in pats:
            if not isinstance(ptn, str) or not ptn or not valid_regex(ptn):
                err(f"TRAINER_SYNONYMS['{key}']: invalid regex {ptn!r}")
    for it in sorted((all_items - tx_items) | all_extras):
        if it not in synonyms:
            err(f"TRAINER_SYNONYMS: no entry for '{it}' — students cannot ask for it in reasoning mode")

    print(f"Checked {len(scenarios)} scenarios against {len(S)} skill sheets.")
    for m in warnings:
        print("WARN ", m)
    for m in errors:
        print("ERROR", m)
    print(f"{len(errors)} error(s), {len(warnings)} warning(s).")


if __name__ == "__main__":
    main()
    sys.exit(1 if errors else 0)
