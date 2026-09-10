// gen_trainer.js — builds trainer/sheets.js and trainer/scenarios.js.
//
// Input: trainer/proctor_data.json — the scenario briefs and skill sheets only
// ({MEDICAL_SHEET, TRAUMA_SHEET, SCENARIOS, CRITICAL_FAILS}). That file is
// git-ignored and must NEVER contain ROSTER, EVALUATORS, passwords, or anything
// else from the access-controlled proctor page. The trainer is public.
//
// Authority order (NEMO decision, Sept 2026): the TEXTBOOK (Emergency Care,
// 14th ed.) is the primary source — many NEMO members work outside Region X and
// the textbook is the more broadly accurate reference. Region X SOPs are cited
// second, for local specifics (drug doses, flow rates, triage categories).
// Oxygen policy: oxygen is indicated for dyspnea/respiratory distress, for shock,
// and for SpO2 <94% — not only when SpO2 is below 94%.
// NEMO scope notes: EMTs may ASSIST with a patient's OWN prescribed nitroglycerin
// (SL tablet, spray, or ODT) but may not give nitro to a patient without a
// prescription; NEMO does not teach diphenhydramine; NEMO carries and teaches the
// pelvic binder; glucagon is taught as an EMT treatment for hypoglycemia.
//
// Run from the repo root:  node trainer/gen_trainer.js
// Then:                    python3 validate_trainer.py
const fs = require("fs");
const path = require("path");
const D = require(path.join(__dirname, "proctor_data.json"));
for (const k of ["ROSTER", "EVALUATORS", "ACCESS_PASSWORD", "CLOUD_SAVE_SECRET"]) {
  if (k in D) throw new Error("proctor_data.json contains " + k + " — refusing to build a public page from it.");
}
const OUT = __dirname;

const PROTOCOL_EDITION = "Region X SOP v202605.1 (effective May 25, 2026)";
const TEXTBOOK_EDITION = "Emergency Care, 14th ed. (Limmer & O'Keefe, Pearson/Brady)";
const REVIEWERS = ["Nathan Miller (Executive Advisor)", "Dylan Stone (Co-President)", "Sophia Sanchez (Co-President)"];

// ---------- citation helpers ----------
const S = (ref, page) => ({ src: "SOP", ref, page });
const T = (ref, page) => ({ src: "TXT", ref, page });
const RMC = S("adult-routine-medical-care", 9);
const RTC = S("routine-trauma-care", 10);
const PRMC = S("pediatric-routine-medical-care", 12);
const ACS = S("acute-coronary-syndrome", 16);
const ASTHMA = S("adult-asthma-copd-with-wheezing", 30);
const CHF = S("acute-heart-failure-pulmonary-edema", 32);
const AMS = S("adult-altered-mental-status-syncope", 35);
const ANA = S("adult-allergic-reaction-anaphylaxis", 36);
const DIAB = S("adult-diabetic-emergencies", 38);
const PAIN = S("adult-pain-management", 48);
const TRIAGE = S("region-x-field-triage-transport-criteria", 53);
const BURN = S("adult-burns", 58);
const CRUSH = S("adult-crush-injury", 59);
const HEAD = S("adult-head-spinal-facial-injuries", 62);
const MSK = S("adult-musculoskeletal-extremity-trauma", 63);
const PEDSHOCK = S("pediatric-shock", 101);
const PEDHEAD = S("pediatric-head-spinal-facial-injuries", 106);
const PEDREF = S("pediatric-reference-charts", 110);
const SMR = S("spinal-motion-restriction-smr", 164);
const TQ = S("tourniquet-use", 168);
const PREARR = S("pre-arrival-report", 7);
const TX = {
  airway: T("ch9", 200), vent: T("ch10", 236), primary: T("ch12", 312), secondary: T("ch15", 403),
  reassess: T("ch16", 453), comm: T("ch17", 462), pharm: T("ch18", 494), resp: T("ch19", 517),
  cardiac: T("ch20", 555), diabetic: T("ch22", 619), allergic: T("ch23", 650), abd: T("ch26", 725),
  shock: T("ch29", 783), soft: T("ch30", 823), chest: T("ch31", 867), msk: T("ch32", 892),
  head: T("ch33", 947), multi: T("ch34", 997), peds: T("ch8", 184), lift: T("ch3", 54),
};

// ---------- treatment helpers ----------
// verdict: indicated | not-indicated | contraindicated
// critical: indicated+critical = must be done (missing → critical fail);
//           contraindicated+critical = doing it → "dangerous intervention" critical fail
// failCategory: index into CRITICAL_FAILS used when a critical indicated treatment is missed
const tx = (action, verdict, scope, cite, o = {}) => ({
  action, verdict, scope, cite, critical: !!o.critical,
  failCategory: o.failCategory == null ? (o.critical ? 7 : null) : o.failCategory,
  result: o.result || "", note: o.note || "",
});
const O2_NRB = (o = {}) => tx("Oxygen — non-rebreather mask at 12–15 LPM", "indicated", "EMR", RMC,
  { critical: true, failCategory: 4, result: o.result || "Mask seated, reservoir inflated. SpO₂ begins to climb over the next couple of minutes.", note: o.note || "Oxygen is indicated for dyspnea/respiratory distress, for shock, or when SpO₂ is <94% — not only for a low SpO₂ (textbook). Region X Routine Medical/Trauma Care titrates to keep SpO₂ >94%; NRB runs at 12–15 LPM. Record SpO₂ before and after." });
const O2_NC = (verdict, o = {}) => tx("Oxygen — nasal cannula at 2–6 LPM", verdict, "EMR", RMC, o);
const KEEP_WARM = (cite = TX.shock) => tx("Keep the patient warm (blanket, heat on in the rig)", "indicated", "EMR", cite,
  { result: "Blanket applied.", note: "Preventing heat loss is part of shock care; hypothermia worsens bleeding and outcomes." });
const BVM_NOT = (note) => tx("Ventilate with a bag-valve mask (15 LPM)", "not-indicated", "EMR", RMC,
  { result: "Patient is moving adequate air on their own and pushes the mask away.", note });
const PM_ONLY = (action, cite, note) => tx(action, "not-indicated", "PM", cite,
  { result: "Not available at the EMT-B level on this call.", note: note || "Paramedic-scope intervention in the Region X SOP. Not something an EMT-B performs — note it for the ALS/receiving report." });

// ---------- per-scenario clinical overlays ----------
const OVERLAY = {
  "medical-1": {
    complaint: "respiratory", patient: { age: 24, sex: "F" },
    sources: [TX.resp, ASTHMA, RMC],
    reviewerFlags: ["Oxygen: dyspnea with SpO₂ 89% — indicated (dyspnea and low SpO₂).", "NEMO decision: CPAP or no CPAP are both acceptable as long as the DuoNeb is given. Listed accordingly."],
    transport: { priority: "unstable", destination: "Closest appropriate emergency department (no ALS available — do not delay transport waiting for a response to the nebulizer).", cite: ASTHMA },
    criticalAssessments: [{ item: "Lung sounds", label: "Diffuse wheezing — the finding that drives the DuoNeb decision", cite: ASTHMA }],
    treatments: [
      O2_NRB({ result: "She keeps the mask on; SpO₂ 89% → low 90s within two minutes, still wheezing." }),
      tx("DuoNeb — albuterol 2.5 mg + ipratropium 0.5 mg via nebulizer (may repeat ×2)", "indicated", "EMT", ASTHMA,
        { critical: true, result: "By the end of the first neb her sentences lengthen and the wheeze is quieter. RR trending down.", note: "Region X Asthma/COPD with Wheezing (mild/moderate and severe): DuoNeb 2.5 mg / 0.5 mg, may repeat twice. 'Do not delay transport while waiting for response.'" }),
      tx("Albuterol 2.5 mg nebulizer alone (no ipratropium)", "not-indicated", "EMT", ASTHMA,
        { result: "Wheezing improves somewhat.", note: "Incomplete rather than wrong: the Region X asthma order is the DuoNeb combination (albuterol + ipratropium). Albuterol alone is the NEMO sheet's 'partial point' — forgetting Atrovent is a listed pitfall." }),
      tx("DuoNeb delivered in-line with CPAP at 5 cm H₂O PEEP", "indicated", "EMT", ASTHMA,
        { result: "She tolerates the mask; work of breathing eases.", note: "The SOP severe-asthma branch (unable to speak in sentences, accessory muscle use) is DuoNeb via CPAP 5 cm PEEP, max 10. NEMO: CPAP or NRB delivery are both fine — what matters is that the nebulizer is given." }),
      tx("Position of comfort — let her stay upright / tripod", "indicated", "EMR", TX.resp,
        { result: "She stays in tripod position, visibly more settled.", note: "Never force a patient in respiratory distress supine — a listed pitfall on the NEMO sheet." }),
      tx("Lay the patient supine on the stretcher", "contraindicated", "EMR", TX.resp,
        { result: "She refuses, sits back up, and her work of breathing spikes.", note: "Supine positioning worsens ventilation in acute asthma. Transport upright." }),
      tx("Assist with her own albuterol MDI (2 more puffs)", "not-indicated", "EMT", ASTHMA,
        { result: "Minimal change — she has already used it 20 minutes ago with little effect.", note: "Not harmful, but the nebulized DuoNeb is the Region X order and delivers a larger, sustained dose. Don't let the MDI substitute for the neb." }),
      tx("Epinephrine 0.3 mg IM", "not-indicated", "EMT", ASTHMA,
        { result: "OLMC is not on the line and she is improving with the neb.", note: "The SOP reserves IM epinephrine for the deteriorating severe-asthma patient and only by OLMC order. She is responding to DuoNeb — contact medical control first if she worsens." }),
      BVM_NOT("Tidal volume is adequate and she is protecting her airway. Reassess — if she tires, becomes drowsy, or SpO₂ keeps falling on NRB, escalate to BVM."),
      tx("Reassess lung sounds after the nebulizer", "indicated", "EMR", RMC,
        { result: "Aeration improved bilaterally, scattered end-expiratory wheeze remains.", note: "SOP: reassess after every treatment. Not re-listening after the neb is a listed pitfall." }),
    ],
  },
  "medical-2": {
    complaint: "respiratory", patient: { age: 78, sex: "M" },
    sources: [TX.resp, TX.cardiac, CHF, RMC],
    reviewerFlags: ["Nitroglycerin: EMTs may only assist with a patient's own prescribed nitro (SL/spray/ODT). He has no prescription, so nitro cannot be given — the entry teaches the indications/contraindications anyway.", "Brief calls albuterol 'NO' for cardiac wheeze; listed as contraindicated (non-critical)."],
    transport: { priority: "unstable", destination: "Closest appropriate emergency department, upright on CPAP. No ALS available.", cite: CHF },
    criticalAssessments: [{ item: "Lung sounds", label: "Rales — separates cardiac pulmonary edema from asthma/COPD", cite: CHF }],
    treatments: [
      tx("Oxygen — non-rebreather mask at 15 LPM while CPAP is set up", "indicated", "EMR", RMC,
        { result: "SpO₂ 84% → 93% on NRB, still 2-word sentences and pursed-lip breathing.", note: "Severe dyspnea with SpO₂ 84% — oxygen is indicated on both counts. Bridge to CPAP: NRB alone gets him close to the >94% target but not there; CPAP is the protocol treatment." }),
      tx("CPAP — 5 cm H₂O PEEP, titrate up to 10 cm H₂O", "indicated", "EMT", CHF,
        { critical: true, failCategory: 3, result: "Within minutes: SpO₂ 96%, sentences lengthen, rales less prominent.", note: "Region X Acute Heart Failure / Pulmonary Edema — STABLE (SBP 100–160) and UNSTABLE (SBP >160) branches both call for CPAP 5 cm PEEP, max 10. Requires an alert patient who can follow commands and protect the airway." }),
      tx("Sit him fully upright with legs dependent", "indicated", "EMR", TX.cardiac,
        { result: "He immediately breathes easier sitting up with legs over the edge of the stretcher.", note: "Upright positioning reduces venous return and pulmonary congestion." }),
      tx("Lay the patient flat on the stretcher", "contraindicated", "EMR", TX.cardiac,
        { result: "He becomes frantic, gasping — you sit him back up.", note: "Supine positioning floods the lungs further in pulmonary edema." }),
      tx("Albuterol / DuoNeb nebulizer for the wheeze", "contraindicated", "EMT", CHF,
        { result: "Heart rate climbs; no improvement in breathing.", note: "'Cardiac asthma' — the wheeze is fluid, not bronchospasm. Beta-agonists raise heart rate and myocardial oxygen demand. Rales, JVD, pitting edema and pink sputum point to heart failure, which the SOP treats with CPAP." }),
      tx("Nitroglycerin 0.4 mg (SL tablet, spray, or ODT) — assist with the patient's own prescription", "not-indicated", "EMT", CHF,
        { result: "He has no nitroglycerin prescribed — nothing to assist with. Nitro from the ambulance stock is a paramedic order.", note: "EMTs may ASSIST a patient with their OWN prescribed nitroglycerin — SL tablet, spray, or orally disintegrating tablet (ODT). Indications: chest pain of suspected cardiac origin or acute pulmonary edema, SBP ≥90 (SOP: SBP ≥90 and MAP >65), prescribed to this patient. Contraindications: hypotension, erectile-dysfunction / pulmonary-hypertension drugs in the last 48 h, head injury, not the patient's own prescription, dose maximum reached (1.2 mg / 3 doses). Without a prescription you cannot give it — report SBP 178 and let ALS/the ED decide." }),
      tx("Give his missed dose of Lasix (furosemide)", "not-indicated", "PM", RMC,
        { result: "Not an EMS medication.", note: "Diuretics are not in the Region X EMS formulary at any level. Document that he skipped the dose and hand that to the ED." }),
      BVM_NOT("He is moving air and alert; CPAP is the treatment. If he tires, becomes drowsy, or can't tolerate the mask, remove CPAP and ventilate with BVM."),
      tx("Reassess lung sounds and SpO₂ after CPAP", "indicated", "EMR", RMC,
        { result: "Rales improving, SpO₂ 96%.", note: "Reassess after every treatment (SOP). Continuous SpO₂ on CPAP." }),
    ],
  },
  "medical-3": {
    complaint: "cardiac", patient: { age: 58, sex: "M" },
    sources: [TX.cardiac, TX.shock, ACS, RMC],
    reviewerFlags: ["Cardiogenic shock (gray, diaphoretic, cap refill 4 s): oxygen is indicated for shock regardless of SpO₂ 95% — listed as indicated, critical. Brief accepts NC 2 LPM or NRB; either delivery is fine."],
    transport: { priority: "unstable", destination: "Closest STEMI-capable (cath lab) facility — call an early STEMI alert. No ALS available; do not delay on scene.", cite: ACS },
    criticalAssessments: [{ item: "Blood pressure", label: "SBP 86 — the number that contraindicates nitroglycerin", cite: ACS }],
    treatments: [
      tx("Aspirin 324 mg chewed (4 × 81 mg)", "indicated", "EMT", ACS,
        { critical: true, result: "He chews and swallows the tablets.", note: "Region X ACS: aspirin 81 mg ×4 chewable PO (all scopes except EMR) unless allergic or actively bleeding. No allergy reported." }),
      tx("Nitroglycerin 0.4 mg SL", "contraindicated", "EMT", ACS,
        { critical: true, result: "BP falls further — 70s systolic — and he becomes more lethargic.", note: "SOP: nitroglycerin only in the STABLE branch (SBP ≥90, MAP >65). SBP 86 with bradycardia = unstable. Suspected inferior MI (epigastric pain, low HR/BP) makes nitro especially dangerous — the SOP PEARL flags inferior ST elevation as a reason to withhold." }),
      tx("Oxygen — nasal cannula 2–4 LPM or non-rebreather (he is in shock)", "indicated", "EMR", RMC,
        { critical: true, failCategory: 4, result: "SpO₂ 95% → 97%.", note: "Oxygen is indicated for SHOCK, not just for a low SpO₂ — gray, diaphoretic, cap refill 4 s, SBP 86 is cardiogenic shock (textbook). Either NC or NRB is acceptable; SOP titrates to keep SpO₂ >94%. Withholding oxygen because the number reads 95% is the error." }),
      tx("Supine on the stretcher, legs flat", "indicated", "EMR", TX.shock,
        { result: "Slightly less lightheaded lying flat.", note: "Hypotensive — do not sit him upright. Current textbook guidance: supine, no Trendelenburg." }),
      tx("Sit upright in position of comfort", "not-indicated", "EMR", TX.shock,
        { result: "He gets dizzier sitting up.", note: "SBP 86 — keep him flat." }),
      KEEP_WARM(),
      tx("AED on standby / prepared for arrest", "indicated", "EMR", TX.cardiac,
        { result: "Pads staged, AED next to the patient.", note: "Bradycardic, hypotensive MI patients arrest. Be ready." }),
      tx("Early notification — STEMI alert to the receiving facility", "indicated", "EMR", PREARR,
        { result: "ED acknowledges the alert and activates the cath lab.", note: "Pre-Arrival Report SOP lists STEMI alert as a required element when suspected." }),
      PM_ONLY("Acquire 12-lead ECG", ACS),
      PM_ONLY("IV normal saline bolus for hypotension", ACS),
    ],
  },
  "medical-4": {
    complaint: "cardiac", patient: { age: 71, sex: "F" },
    sources: [TX.cardiac, ACS, RMC],
    reviewerFlags: ["Aspirin 324 mg total confirmed (her daily 81 mg does not count). Nitro: assisting with her OWN prescription (SL/spray/ODT) — one more dose permitted under the 1.2 mg maximum."],
    transport: { priority: "unstable", destination: "Closest appropriate emergency department (ACS-capable). No ALS available — transport without delay and treat en route.", cite: ACS },
    criticalAssessments: [{ item: "Blood pressure", label: "SBP 142 — confirms nitroglycerin is still permitted (must recheck after every dose)", cite: ACS }],
    treatments: [
      tx("Aspirin 324 mg chewed (4 × 81 mg)", "indicated", "EMT", ACS,
        { critical: true, result: "She chews the tablets. 'I already took my little one this morning.'", note: "SOP: aspirin 81 mg ×4; if the patient has already taken some, augment to 324 mg total. Her daily 81 mg does not count as treatment for this event." }),
      tx("Nitroglycerin 0.4 mg — assist with her own prescribed SL tablet, spray, or ODT; one additional dose", "indicated", "EMT", ACS,
        { result: "Pain 7/10 → 4/10 after five minutes; BP 124/76.", note: "EMTs assist with the patient's OWN prescribed nitroglycerin (SL, spray, or orally disintegrating tablet). Indications met: cardiac chest pain, SBP 142 (≥90; SOP also MAP >65), prescribed to her, no erectile-dysfunction / pulmonary-hypertension drug in 48 h, no head injury. She has taken 2 doses (0.8 mg); the maximum is 1.2 mg (3 doses), so one more is permitted. Recheck BP before and after; stop if SBP falls below 90." }),
      tx("A fourth dose of nitroglycerin", "contraindicated", "EMT", ACS,
        { result: "Exceeds the protocol maximum.", note: "SOP: repeat every 5 minutes to a maximum of 1.2 mg total (3 doses) — the patient's 2 doses count toward the total." }),
      tx("Oxygen — non-rebreather 12–15 LPM", "not-indicated", "EMR", RMC,
        { result: "SpO₂ already 96% on room air; no change.", note: "None of the oxygen indications are present: no dyspnea (RR 18, unlabored, full sentences), no shock (BP 142/88, cap refill 2 s), SpO₂ 96%. Routine high-flow oxygen in uncomplicated ACS is not recommended (textbook/AHA). Reassess — apply if she becomes short of breath, shows shock signs, or SpO₂ drops below 94%." }),
      tx("Position of comfort (semi-Fowler's), limit exertion", "indicated", "EMR", TX.cardiac,
        { result: "She is comfortable reclined. Do not let her walk to the ambulance.", note: "Reduce myocardial oxygen demand — carry her." }),
      tx("AED on standby", "indicated", "EMR", TX.cardiac,
        { result: "Pads staged.", note: "Unstable angina can progress to arrest without warning." }),
      tx("Early notification to the receiving facility (possible ACS)", "indicated", "EMR", PREARR,
        { result: "ED acknowledges; no ST elevation reported, so no STEMI alert — but ACS-capable bed prepared.", note: "Pre-Arrival Report elements: chief complaint, treatments and response, ETA." }),
      PM_ONLY("Acquire 12-lead ECG", ACS),
    ],
  },
  "medical-5": {
    complaint: "anaphylaxis", patient: { age: 32, sex: "M" },
    sources: [TX.allergic, ANA, RMC],
    reviewerFlags: ["Diphenhydramine is not taught by NEMO — not listed as an option.", "Bees still active: brief treats the scene as partially safe — moving the patient away is expected before extended treatment."],
    transport: { priority: "unstable", destination: "Closest appropriate emergency department — load and go after epinephrine. No ALS available.", cite: ANA },
    criticalAssessments: [{ item: "Identifies if there is an obstruction", label: "Stridor — upper-airway involvement; anaphylaxis is UNSTABLE with airway threat", cite: ANA }],
    treatments: [
      tx("Epinephrine 1 mg/mL — 0.3 mg IM, anterolateral thigh", "indicated", "EMT", ANA,
        { critical: true, result: "Within 3–5 minutes stridor softens, he can speak short phrases, BP recovers toward 108/70.", note: "Region X Allergic Reaction / Anaphylactic Shock — UNSTABLE (SBP <90, airway involvement): epinephrine 0.3 mg IM, may repeat every 5 minutes, no maximum. First-line — antihistamines do not treat airway swelling or shock." }),
      tx("Epinephrine 0.15 mg IM (junior auto-injector dose)", "not-indicated", "EMT", ANA,
        { result: "Partial improvement only.", note: "0.15 mg is the pediatric dose (<30 kg / 66 lb on the NEMO sheet). Adult dose per SOP is 0.3 mg." }),
      tx("Repeat epinephrine 0.3 mg IM after 5 minutes if not improving", "indicated", "EMT", ANA,
        { result: "Reassess at 5 minutes — he is improving, so a second dose can be held; give it if stridor or hypotension return.", note: "SOP: may repeat every 5 minutes with no maximum dose." }),
      O2_NRB({ result: "SpO₂ 91% → 97%. Stridor still audible until epi takes effect." }),
      tx("DuoNeb — albuterol 2.5 mg + ipratropium 0.5 mg nebulizer (after epinephrine)", "indicated", "EMT", ANA,
        { result: "Lower-airway wheeze clears.", note: "SOP anaphylaxis: DuoNeb (may repeat ×1) or albuterol 2.5 mg for bronchospasm — an adjunct given after IM epinephrine, never instead of it." }),
      tx("Move the patient away from the active bees to the ambulance", "indicated", "EMR", TX.allergic,
        { result: "Scene hazard removed; you can work without more stings.", note: "Scene safety for you and the patient. Do not linger where bees are still active." }),
      tx("Scrape the stinger out with a card edge; cold pack to the site", "indicated", "EMR", ANA,
        { result: "Stinger removed.", note: "Textbook: scrape, don't squeeze. Cold pack is listed in the SOP allergic-reaction pathway. Low priority — never before epinephrine." }),
      tx("Supine with legs elevated if his airway tolerates it", "indicated", "EMR", TX.shock,
        { result: "He prefers sitting until the epi works, then lies back as BP improves.", note: "Hypotensive anaphylaxis: supine when the airway allows. If lying flat worsens stridor, position of comfort wins." }),
      BVM_NOT("He is moving air; epinephrine is the airway treatment. If he stops moving air, ventilate with BVM and expect a difficult airway."),
    ],
  },
  "medical-6": {
    complaint: "anaphylaxis", patient: { age: 19, sex: "F" },
    sources: [TX.allergic, ANA, RMC],
    reviewerFlags: ["Oxygen: airway involvement with wheeze (dyspnea) and SpO₂ 94% — indicated.", "Her own 25 mg diphenhydramine 20 minutes ago did not treat the airway involvement — NEMO does not teach diphenhydramine; the teaching point is epinephrine."],
    transport: { priority: "unstable", destination: "Closest appropriate emergency department — load and go after epinephrine (biphasic reactions happen). No ALS available.", cite: ANA },
    criticalAssessments: [{ item: "Lung sounds", label: "Scattered wheeze plus lip swelling = airway involvement → epinephrine branch", cite: ANA }],
    treatments: [
      tx("Epinephrine 0.3 mg IM, anterolateral thigh (her EpiPen or 1 mg/mL drawn up)", "indicated", "EMT", ANA,
        { critical: true, result: "Lip swelling and wheeze improve within minutes; HR settles from 118 to 100.", note: "SOP STABLE WITH AIRWAY INVOLVEMENT branch: epinephrine 0.3 mg IM, may repeat every 5 minutes. Normal blood pressure does NOT rule out anaphylaxis — lip swelling plus wheeze after a known allergen is enough. The unused EpiPen on the desk is a hint, not a distraction." }),
      tx("Oxygen — non-rebreather 10–15 LPM", "indicated", "EMR", RMC,
        { result: "SpO₂ 94% → 98%.", note: "Oxygen is indicated for respiratory distress — wheeze and lip swelling are airway involvement — and SpO₂ 94% is at the SOP >94% line. Give it." }),
      tx("DuoNeb — albuterol 2.5 mg + ipratropium 0.5 mg (after epinephrine)", "indicated", "EMT", ANA,
        { result: "Wheeze resolves.", note: "SOP adjunct for bronchospasm in anaphylaxis, after epinephrine." }),
      tx("More diphenhydramine because the first dose 'didn't work'", "not-indicated", "PM", ANA,
        { result: "Not something you carry or give, and it would not help her airway.", note: "NEMO does not teach or carry diphenhydramine — it is a paramedic-column adjunct on the SOP page. Antihistamines never substitute for epinephrine when the airway is involved." }),
      tx("Watch and wait — Benadryl was given 20 minutes ago", "contraindicated", "EMR", ANA,
        { result: "Her lips keep swelling and the wheeze gets louder.", note: "Delayed epinephrine is a named fatality risk in the SOP PEARLS. Do not wait." }),
      tx("Sit her upright, position of comfort", "indicated", "EMR", TX.allergic,
        { result: "Breathing easier upright.", note: "Normotensive with airway symptoms — upright is appropriate." }),
      tx("Repeat epinephrine 0.3 mg IM after 5 minutes if symptoms persist", "indicated", "EMT", ANA,
        { result: "At 5 minutes she is improving; hold unless symptoms return.", note: "SOP: may repeat every 5 minutes." }),
    ],
  },
  "medical-7": {
    complaint: "neurological", patient: { age: 64, sex: "M" },
    sources: [TX.diabetic, DIAB, AMS, RMC],
    reviewerFlags: ["NEMO decision: glucagon is allowed as an EMT treatment — listed as indicated (non-critical) alongside oral glucose. Oral glucose remains the critical item while he can protect his airway and swallow; D10 IV stays paramedic-only."],
    transport: { priority: "unstable", destination: "Closest appropriate emergency department — treat on scene (oral glucose; glucagon if he cannot safely swallow), then transport; reassess BGL en route. No ALS available.", cite: DIAB },
    criticalAssessments: [{ item: "Blood glucose level", label: "BGL 38 — the diagnosis. Altered mental status → check glucose before anything else.", cite: AMS }],
    treatments: [
      tx("Oral glucose gel 15 g — after confirming he has a gag reflex and can swallow", "indicated", "EMR", DIAB,
        { critical: true, result: "He takes the gel in small amounts with assistance. Over 10–15 minutes he clears — A&O ×4, BGL 78.", note: "Region X Diabetic Emergencies — HYPOGLYCEMIA (AMS, BG <60): oral glucose 15 g, all scopes, ONLY if the patient can tolerate oral intake, has a gag reflex and can protect the airway. He is V on AVPU with intact gag — give it slowly, watch the airway." }),
      tx("Squeeze the whole tube into his mouth while he is still confused and not following commands", "contraindicated", "EMT", DIAB,
        { critical: true, result: "He gags and coughs — aspiration risk.", note: "Oral glucose requires an airway the patient can protect. Small amounts, buccal, with the patient able to swallow. If he cannot, give glucagon instead (NEMO teaches it) — D10 IV is a paramedic order." }),
      tx("Recheck blood glucose 10–15 minutes after glucose", "indicated", "EMR", DIAB,
        { result: "BGL 78 mg/dL.", note: "Reassess after every treatment (SOP). A second dose can be given if still <60 and still able to swallow." }),
      tx("Oxygen — non-rebreather", "not-indicated", "EMR", RMC,
        { result: "SpO₂ 97% on room air — no change.", note: "No oxygen indication: no dyspnea (RR 18, unlabored), not in shock (BP 132/78, cap refill 2 s — the diaphoresis is hypoglycemia, not hypoperfusion), SpO₂ 97%. Oxygen doesn't treat hypoglycemia." }),
      tx("Naloxone 2 mg intranasal", "not-indicated", "EMT", PAIN,
        { result: "No change.", note: "No opioid indication: normal respirations, pupils equal, no paraphernalia. The AMS SOP directs BGL <60 to the Diabetic Emergencies protocol, not the overdose protocol." }),
      tx("Call a stroke alert", "not-indicated", "EMR", AMS,
        { result: "Receiving facility asks for the glucose — 38.", note: "Hypoglycemia mimics stroke. FAST is negative and BGL explains the picture; the SOP AMS protocol checks glucose before stroke pathway. Recheck FAST after glucose normalizes." }),
      tx("Physically restrain him because he is swatting at you", "not-indicated", "EMR", TX.diabetic,
        { result: "He becomes more agitated.", note: "Combativeness is a symptom of hypoglycemia. Treat the cause; use calm, minimal-contact technique and a second provider." }),
      tx("Something to eat once he is fully alert and swallowing normally", "indicated", "EMR", TX.diabetic,
        { result: "He eats crackers; BGL stays up.", note: "Textbook: a complex carbohydrate after the fast sugar helps prevent rebound hypoglycemia. Only when fully alert." }),
      tx("Glucagon 1 mg IM (or 3 mg intranasal) — especially if he cannot safely swallow", "indicated", "EMT", TX.diabetic,
        { result: "Given in the lateral thigh. Over the next 10–20 minutes he becomes more coherent; BGL climbs to the 70s. Expect nausea/vomiting — keep him on his side and suction ready.", note: "NEMO teaches glucagon for hypoglycemia (BGL <60 with AMS) when the patient cannot take oral glucose, or when the airway is marginal — he is confused, combative and only V on AVPU, so glucagon is a reasonable choice alongside or instead of gel. Glucagon works by releasing liver glycogen: onset 10–20 min, and it is less effective in malnourished or alcohol-related hypoglycemia. Follow with carbohydrates once he can swallow. (Region X SOP lists glucagon in the paramedic column; NEMO policy allows it at the EMT level.)" }),
      PM_ONLY("Dextrose 10% IV", DIAB, "IV dextrose is a paramedic-scope treatment. No ALS available on this call — oral glucose and glucagon are your tools."),
    ],
  },
  "medical-8": {
    complaint: "abdominal", patient: { age: 69, sex: "M" },
    sources: [TX.abd, TX.shock, RMC],
    reviewerFlags: ["No Region X protocol is specific to AAA; treatment is Routine Medical Care + shock care (textbook ch. 26/29). Oxygen is indicated for shock regardless of SpO₂ 95% — listed as indicated, critical.", "Nearest vascular-capable center vs. closest ED — brief says vascular-capable; confirm local destination guidance."],
    transport: { priority: "unstable", destination: "Vascular-surgery-capable hospital per the brief — load and go, gentle handling, no walking. No ALS available.", cite: RMC },
    criticalAssessments: [{ item: "Palpate quadrants: unusual masses", label: "Pulsating upper-abdominal mass — the key finding for suspected AAA", cite: TX.abd }],
    treatments: [
      tx("Oxygen — non-rebreather 10–15 LPM", "indicated", "EMR", RMC,
        { critical: true, failCategory: 4, result: "SpO₂ holds 94–95% on NRB; skin stays gray.", note: "Signs of shock (SBP 92, HR 124, cap refill 4 s). High-flow oxygen is part of shock care even with SpO₂ at 95%." }),
      tx("Supine, legs flat, position of comfort — keep him still", "indicated", "EMR", TX.shock,
        { result: "He settles with knees slightly bent.", note: "Hypotensive — flat, no sitting up, no exertion." }),
      KEEP_WARM(),
      tx("Nothing by mouth (NPO)", "indicated", "EMR", TX.abd,
        { result: "Nothing given.", note: "Surgical abdomen — likely going to the OR." }),
      tx("Aspirin 324 mg", "contraindicated", "EMT", ACS,
        { critical: true, result: "Antiplatelet given to a patient who is likely bleeding internally.", note: "Aspirin is an ACS order. This is abdominal pain with a pulsating mass and shock — suspected leaking AAA. Aspirin worsens hemorrhage." }),
      tx("Nitroglycerin 0.4 mg SL", "contraindicated", "EMT", ACS,
        { critical: true, result: "BP crashes.", note: "SBP 92 and no ACS indication. Nitro in hemorrhagic shock can be fatal." }),
      tx("Repeated deep palpation of the pulsating mass", "contraindicated", "EMR", TX.abd,
        { result: "Pain spikes; he goes grayer.", note: "Once you have found a pulsating mass, stop palpating it. Textbook: do not palpate a suspected AAA repeatedly." }),
      tx("Let him walk to the stretcher", "contraindicated", "EMR", TX.shock,
        { result: "He nearly syncopizes standing up.", note: "Two near-syncope episodes already. Carry him — minimal exertion." }),
      tx("Early notification — suspected ruptured AAA", "indicated", "EMR", PREARR,
        { result: "Receiving facility alerts vascular surgery.", note: "Pre-arrival report: chief complaint, vitals trend, working impression." }),
      PM_ONLY("IV access / fluid bolus", RMC),
      PM_ONLY("Fentanyl for pain", PAIN),
    ],
  },
  "trauma-1": {
    patient: { age: 22, sex: "M" },
    sources: [TX.chest, TX.shock, RTC, TRIAGE, SMR],
    reviewerFlags: ["SMR not indicated: isolated penetrating trauma without neurologic deficit does not meet SMR criteria (textbook; Region X SMR protocol agrees). Brief text updated to match."],
    brief: {
      expectedReplace: [["<p><strong>Spinal precautions:</strong> NOT mandatory for isolated GSW without spinal symptoms — current trauma guidelines.</p>", "<p><strong>Spinal motion restriction:</strong> NOT indicated — isolated penetrating trauma with no neurologic deficit does not meet SMR criteria (textbook; Region X SMR protocol). Do not let a backboard delay transport.</p>"]],
      responseReplace: { "Considers spine stabilization": "Not indicated — isolated penetrating trauma with no neurologic deficit does not meet SMR criteria." },
    },
    transport: { priority: "unstable", destination: "Highest-level Trauma Center within 25 minutes — Category I (penetrating torso, SBP ≤90). Trauma alert. No ALS available.", cite: TRIAGE },
    criticalAssessments: [
      { item: "Inspect posterior for DCAP-BTLS", label: "Exit wound on the right flank — only found on the log-roll", cite: RTC },
      { item: "Inspect posterior for bleeding", label: "Active bleeding from the exit wound", cite: RTC },
    ],
    treatments: [
      O2_NRB({ result: "SpO₂ 94% → 98%. He remains pale and lethargic." }),
      tx("Direct pressure to the entry wound", "indicated", "EMR", MSK,
        { result: "Bleeding slows.", note: "Hemorrhage control is a primary-survey priority (Routine Trauma Care)." }),
      tx("Occlusive dressing to the entry wound (right upper abdomen)", "indicated", "EMR", TX.chest,
        { critical: true, result: "Entry wound sealed.", note: "A wound this high on the abdomen may communicate with the chest — occlusive dressing per the textbook and brief." }),
      tx("Log-roll and occlusive dressing to the exit wound (right flank)", "indicated", "EMR", TX.chest,
        { critical: true, result: "Larger exit wound sealed; posterior bleeding controlled with pressure.", note: "Every penetrating wound needs a look at the back. Missing the exit wound is the critical error in this scenario." }),
      tx("Supine on the stretcher", "indicated", "EMR", TX.shock,
        { result: "Positioned supine.", note: "Hemorrhagic shock — flat, no Trendelenburg." }),
      KEEP_WARM(),
      tx("Full spinal motion restriction (collar + backboard)", "not-indicated", "EMR", SMR,
        { result: "Adds minutes on scene with no benefit.", note: "SOP SMR criteria: no dangerous blunt mechanism, no neurologic deficit, reliable patient. Isolated penetrating torso trauma without spinal symptoms does not get immobilized — it gets transported." }),
      tx("Complete a full detailed physical exam on scene before moving", "not-indicated", "EMR", RTC,
        { result: "Clock runs while he keeps bleeding.", note: "Routine Trauma Care: package and transport; detailed exam en route. Scene time for a Category I patient should be minimal." }),
      tx("Probe or pack the abdominal wound", "contraindicated", "EMR", TX.chest,
        { result: "More bleeding.", note: "Never probe a penetrating abdominal wound. Wound packing is for junctional/extremity hemorrhage in the SOP, not the abdomen." }),
      tx("Give him water — he is thirsty", "contraindicated", "EMR", TX.shock,
        { result: "Nothing by mouth for a surgical patient.", note: "Thirst is a shock sign. NPO." }),
      tx("Tourniquet", "not-indicated", "EMR", TQ,
        { result: "Not applicable to torso wounds.", note: "Tourniquets are for extremity hemorrhage." }),
      tx("Trauma alert — Category I — to the receiving Trauma Center", "indicated", "EMR", PREARR,
        { result: "Trauma team activated.", note: "Pre-arrival report element: Trauma I/II alert." }),
    ],
  },
  "trauma-2": {
    patient: { age: 47, sex: "M" },
    sources: [TX.soft, TX.msk, MSK, TQ, CRUSH, RTC],
    reviewerFlags: ["Significant hemorrhage with early shock — oxygen is indicated for shock regardless of SpO₂ 97%; listed as indicated, critical.", "Tetanus >10 years and lisinopril are hand-off details, not field treatments."],
    transport: { priority: "unstable", destination: "Trauma Center with hand-surgery capability (mangled/pulseless extremity = Category I). No ALS available — pain management will be at the ED.", cite: TRIAGE },
    criticalAssessments: [{ item: "Assess each upper extremity for PMS", label: "Absent distal pulse, sensation and motor function — mangled/pulseless extremity", cite: TRIAGE }],
    treatments: [
      tx("Direct pressure to the radial-side arterial bleed", "indicated", "EMR", MSK,
        { result: "Bright red bleeding continues through the gauze.", note: "SOP MSK/Extremity Trauma: expose, direct pressure first." }),
      tx("Pressure dressing", "indicated", "EMR", MSK,
        { result: "Soaks through within a minute — still bleeding.", note: "SOP progression: direct pressure → pressure dressing → tourniquet if ineffective." }),
      tx("Commercial tourniquet 2–3 in proximal to the wound on bare skin, tightened until bleeding stops — record the time, notify medical control", "indicated", "EMR", TQ,
        { critical: true, failCategory: 4, result: "Bleeding stops. Time written on the tourniquet and on his forehead.", note: "SOP Tourniquet Use: indicated for severe extremity hemorrhage not controlled by pressure/pressure dressing. Not over a joint, not covered, time recorded, medical control notified. PEARL: tourniquet before shock develops improves survival." }),
      tx("Loosen the tourniquet every 10–15 minutes to 'let blood flow'", "contraindicated", "EMR", TQ,
        { critical: true, result: "Arterial bleeding resumes.", note: "SOP: once applied, do not loosen. Only the receiving physician removes it." }),
      tx("Cover the tourniquet with a bandage or blanket", "contraindicated", "EMR", TQ,
        { result: "The ED can't see it.", note: "SOP: do not cover the tourniquet; it must stay visible with the time marked." }),
      tx("Place the tourniquet across the wrist joint", "contraindicated", "EMR", TQ,
        { result: "Ineffective compression.", note: "SOP: not over a joint — 2–3 inches proximal to the wound." }),
      tx("Splint the hand/forearm in position of function; sterile dressings over the crush injuries", "indicated", "EMR", MSK,
        { result: "Hand splinted, dressed, secured across the chest.", note: "Stabilize and protect; do not debride or scrub crushed tissue." }),
      tx("Irrigate and debride the crushed tissue", "contraindicated", "EMR", TX.soft,
        { result: "More bleeding and pain; tissue disturbed.", note: "Field debridement is never indicated. Dress and transport." }),
      tx("Oxygen — non-rebreather 10–15 LPM", "indicated", "EMR", RMC,
        { critical: true, failCategory: 4, result: "SpO₂ 97% → 99%.", note: "Oxygen is indicated for SHOCK — significant hemorrhage with tachycardia and pale skin — regardless of SpO₂ 97% (textbook). SOP titrates to >94%. Do not let oxygen delay hemorrhage control: tourniquet first, then the mask." }),
      KEEP_WARM(),
      tx("Elevate the extremity and use pressure points instead of a tourniquet", "not-indicated", "EMR", MSK,
        { result: "Bleeding continues.", note: "Not part of the SOP progression for arterial hemorrhage. Go to the tourniquet." }),
      tx("Early notification — crush injury with tourniquet time", "indicated", "EMR", PREARR,
        { result: "Hand surgery paged.", note: "Include tourniquet time and crush duration (30 s) in the report; SOP Crush Injury notes the hyperkalemia risk the ED will watch." }),
      PM_ONLY("Fentanyl for pain", PAIN),
    ],
  },
  "trauma-3": {
    patient: { age: 34, sex: "M" },
    sources: [TX.multi, TX.msk, TX.chest, SMR, RTC, MSK, TRIAGE],
    reviewerFlags: ["NEMO decision: traction splint may be used once the pelvis has been checked and is stable. Listed as indicated, critical, with the pelvis check as a prerequisite."],
    transport: { priority: "unstable", destination: "Highest-level Trauma Center — Category I (SBP ≤90, ≥ high-risk crash with >12 in intrusion). Trauma alert. No ALS available.", cite: TRIAGE },
    criticalAssessments: [
      { item: "Listen to lung sounds", label: "Diminished left breath sounds with rib crepitus — pneumothorax, watch for tension", cite: RTC },
      { item: "Assess each lower extremity for PMS", label: "Weak distal pulses, diminished sensation below the knees — spinal involvement", cite: SMR },
    ],
    treatments: [
      tx("Full spinal immobilization — collar (already on), backboard, straps, head blocks", "indicated", "EMR", SMR,
        { critical: true, result: "Secured to the board with head blocks; sensation deficit documented before and after moving.", note: "SOP SMR: high-speed MVC with >12 in intrusion is a dangerous mechanism; neurologic deficit is present → FULL IMMOBILIZATION (collar, backboard, spider straps, head blocks)." }),
      O2_NRB({ result: "SpO₂ 93% → 97%. Left breath sounds still diminished." }),
      tx("Traction splint to the right femur — after the pelvis has been checked and is stable", "indicated", "EMR", MSK,
        { critical: true, result: "Pelvis checked first — stable. Traction applied: deformity aligned, pain reduced, distal pulse present after splinting.", note: "Closed mid-shaft femur deformity. Check the pelvis BEFORE traction: the ischial strap loads the pelvis, so a traction splint is contraindicated with a suspected pelvic fracture, hip or knee injury, or an open fracture with bone ends exposed (textbook). Pelvis is stable here, so traction splint it (SOP: stabilize fractures). Check PMS before and after." }),
      tx("Bandage the forehead laceration", "indicated", "EMR", TX.soft,
        { result: "Bleeding controlled with a dressing.", note: "Minor — do after life threats." }),
      KEEP_WARM(),
      tx("Reassess breath sounds, JVD and trachea every 5 minutes for tension pneumothorax", "indicated", "EMR", RTC,
        { result: "Left side remains diminished; trachea midline for now.", note: "Routine Trauma Care: ongoing assessment every 5 minutes. Tension pneumothorax on the SOP is a paramedic decompression — you recognize it and drive." }),
      tx("Remove the C-collar the fire department applied", "contraindicated", "EMR", SMR,
        { result: "Unprotected cervical spine in a patient with neuro deficits.", note: "Dangerous mechanism + neuro deficit = keep it on." }),
      tx("Albuterol nebulizer for the diminished left lung sounds", "not-indicated", "EMT", ASTHMA,
        { result: "No change — this isn't bronchospasm.", note: "Unilateral diminished sounds after rib fractures is a pneumothorax, not asthma. His PRN albuterol history is a distractor." }),
      tx("Occlusive dressing to the chest", "not-indicated", "EMR", RTC,
        { result: "No open chest wound to seal.", note: "Occlusive dressings are for open (sucking) chest wounds. This is a closed pneumothorax." }),
      BVM_NOT("Ventilating adequately. If he tires or SpO₂ falls on NRB, assist ventilations — but be ready for tension pneumothorax to worsen with positive pressure."),
      tx("Trauma alert — Category I", "indicated", "EMR", PREARR,
        { result: "Trauma team activated.", note: "Pre-arrival report element." }),
      PM_ONLY("Needle decompression", S("needle-decompression-chest", 10)),
    ],
  },
  "trauma-4": {
    patient: { age: 8, sex: "F", weightKg: 27 },
    sources: [TX.peds, TX.msk, PRMC, PEDHEAD, SMR, TRIAGE, PEDREF],
    reviewerFlags: ["Closed right femur fracture throughout the scenario (NEMO decision) — splint teaching: pediatric traction splint if the size fits, otherwise a rigid splint secured to the board.", "Compensated pediatric shock — oxygen is indicated for shock regardless of SpO₂ 97%; listed as indicated, critical."],
    brief: {
      sceneReplace: [["Visible femur fracture to the right thigh.", "Obvious deformity and swelling of the right thigh (closed femur fracture — skin intact)."]],
      hiddenReplace: { "Right thigh": "Obvious closed femur fracture — deformity and swelling, skin intact, no open wound. Pulse intact." },
      expectedReplace: [["<p><strong>Splint right femur</strong> — traction splint per protocol/availability.</p>", "<p><strong>Splint the closed right femur fracture</strong> — pediatric traction splint if it fits; otherwise rigid splint secured to the board. Check PMS before and after.</p>"]],
      responseReplace: {
        "Inspect lower extremities for DCAP-BTLS": "R thigh obvious deformity and swelling — closed femur fracture (skin intact). L lower leg abrasion only.",
        "States field impression of patient": "8F pedestrian struck — closed R femur fracture, early (compensated) shock.",
        "Provides accurate verbal report to receiving facility": "8F peds struck ~25mph, BP 96/60, HR 138, closed R femur fx, SMR + splint applied, mom en route.",
      },
    },
    transport: { priority: "unstable", destination: "Pediatric-capable Trauma Center — Category II mechanism (auto vs. pedestrian >20 mph). Trauma alert. No ALS available.", cite: TRIAGE },
    criticalAssessments: [
      { item: "Palpate cervical spine — inline, deformity, tenderness, fracture", label: "Cervical tenderness in a child struck by a car — SMR", cite: PEDHEAD },
      { item: "Assess each lower extremity for PMS", label: "Closed right femur fracture — pulse intact (document before and after splinting)", cite: MSK },
    ],
    treatments: [
      tx("Pediatric C-collar and full spinal motion restriction (pediatric board, pad under the torso)", "indicated", "EMR", SMR,
        { critical: true, result: "Secured; she is calmer once you explain each step.", note: "SOP SMR: auto vs. pedestrian is a dangerous mechanism; cervical tenderness present → full immobilization. Pediatric Head/Spinal: SMR as indicated. Children need torso padding to keep the neck neutral (large occiput)." }),
      tx("Oxygen — non-rebreather 10–15 LPM (pediatric mask)", "indicated", "EMR", PRMC,
        { critical: true, failCategory: 4, result: "SpO₂ 97% → 99%.", note: "Oxygen is indicated for SHOCK: HR 138, pale and diaphoretic in a child = compensated shock until proven otherwise, regardless of SpO₂ 97% (textbook). Pediatric Routine Medical Care titrates to >94%. Children compensate, then crash." }),
      tx("Splint the closed right femur fracture (pediatric traction splint if sized correctly, otherwise rigid splint secured to the board)", "indicated", "EMR", MSK,
        { critical: true, result: "Splinted; distal pulse still present.", note: "Closed mid-shaft femur fracture with a stable pelvis — a traction splint is appropriate if the pediatric size fits; otherwise a rigid splint secured to the board (textbook). Stabilize fractures (SOP MSK Trauma). A femur can bleed a liter or more internally — splinting is hemorrhage control. Check PMS before and after." }),
      tx("Bandage the forehead abrasion and strap bruising", "indicated", "EMR", TX.soft,
        { result: "Dressed.", note: "After life threats and immobilization." }),
      KEEP_WARM(TX.peds),
      tx("Use a length-based tape to confirm weight (≈24–30 kg)", "indicated", "EMR", PRMC,
        { result: "Tape reads in the 24–30 kg range, consistent with the SOP reference chart for 7–9 years.", note: "Pediatric Routine Medical Care: length-based tape for weight and equipment sizing." }),
      tx("Family-centered care — talk to her at eye level, explain everything, have mom meet you at the hospital", "indicated", "EMR", TX.peds,
        { result: "She stops crying when you tell her what you're doing.", note: "Textbook: calm, honest explanations reduce fear and improve assessment in children." }),
      tx("Let her sit up or walk to the ambulance", "contraindicated", "EMR", SMR,
        { result: "Cervical tenderness and a femur fracture — no.", note: "Keep her immobilized." }),
      tx("Trauma alert to the pediatric Trauma Center", "indicated", "EMR", PREARR,
        { result: "Pediatric trauma team activated.", note: "Pre-arrival report includes age and estimated weight." }),
      PM_ONLY("Pediatric pain management (fentanyl)", S("pediatric-pain-management", 48)),
      PM_ONLY("IV / IO fluid bolus 20 mL/kg", PEDSHOCK),
    ],
  },
  "trauma-5": {
    patient: { age: 42, sex: "M" },
    sources: [TX.msk, TX.head, SMR, MSK, TRIAGE, RTC],
    reviewerFlags: ["Fall of 18 ft is under the 20 ft Category II threshold, but an unstable pelvis and paralysis-type deficit are Category I anatomic criteria — listed as Category I.", "Pelvic binder: NEMO carries and teaches it. Cited under SOP MSK 'stabilize fractures' with the textbook for placement. Oxygen indicated for early shock regardless of SpO₂ 96%."],
    transport: { priority: "unstable", destination: "Highest-level Trauma Center — Category I (unstable pelvis, sensory deficit). Trauma alert. No ALS available.", cite: TRIAGE },
    criticalAssessments: [
      { item: "Push pelvic bones together and down — crepitus, instability", label: "Unstable pelvis with crepitus — press once, gently, then never again", cite: TX.msk },
      { item: "Assess each lower extremity for PMS", label: "Diminished sensation below the umbilicus — spinal cord injury", cite: SMR },
    ],
    treatments: [
      tx("Full spinal immobilization — collar, backboard/scoop, straps, head blocks", "indicated", "EMR", SMR,
        { critical: true, result: "Secured with a scoop stretcher to minimize pelvic movement; deficits documented.", note: "SOP SMR: fall from elevation (dangerous mechanism) plus neurologic deficit and spinal tenderness → full immobilization." }),
      tx("Pelvic binder centered over the greater trochanters", "indicated", "EMR", MSK,
        { critical: true, failCategory: 4, result: "Binder applied and tightened; hip hematoma stops expanding.", note: "Unstable pelvis = major internal hemorrhage. NEMO carries and teaches the pelvic binder: center it over the greater trochanters, not the iliac crests, and do not re-check pelvic stability once it is on (textbook). SOP MSK Trauma: stabilize fractures." }),
      tx("Oxygen — non-rebreather 10–15 LPM", "indicated", "EMR", RMC,
        { critical: true, failCategory: 4, result: "SpO₂ 96% → 99%.", note: "Oxygen is indicated for SHOCK — HR 118, unstable pelvis, BP 100/62 is early shock — regardless of SpO₂ 96% (textbook)." }),
      KEEP_WARM(),
      tx("Move him with a scoop stretcher / minimal log-rolling", "indicated", "EMR", TX.lift,
        { result: "One coordinated lift, no twisting.", note: "Every roll of an unstable pelvis can dislodge clot. Scoop is preferred where available." }),
      tx("Re-check pelvic stability by rocking the pelvis again", "contraindicated", "EMR", TX.msk,
        { result: "More crepitus, more pain, more bleeding.", note: "Assess pelvic stability once, gently. Repeated compression is contraindicated." }),
      tx("Traction splint", "not-indicated", "EMR", MSK,
        { result: "No femur fracture, and traction against an unstable pelvis is contraindicated.", note: "Traction splints pull against the pelvis — never with a pelvic fracture." }),
      tx("Let him sit up / stand to see if he can walk", "contraindicated", "EMR", SMR,
        { result: "Spinal tenderness with deficits — absolutely not.", note: "Full SMR." }),
      tx("Trauma alert — Category I", "indicated", "EMR", PREARR,
        { result: "Trauma team activated.", note: "Include the mechanism (18 ft fall, landed on back/buttocks), pelvis, and sensory level." }),
      PM_ONLY("IV access / fluids", RTC),
      PM_ONLY("Fentanyl for pain", PAIN),
    ],
  },
  "trauma-6": {
    patient: { age: 30, sex: "M" },
    sources: [TX.head, HEAD, SMR, TRIAGE, RTC],
    reviewerFlags: ["NEMO decision: his own breathing is adequate (14/min, SpO₂ 96%), so do NOT ventilate for him — BVM assistance listed as not-indicated unless respirations become inadequate; hyperventilation stays a critical contraindicated action.", "Mental status: unresponsive on arrival; he rouses as you work, and by the time a GCS is taken during the secondary assessment it is ~13. Brief text updated to say so."],
    brief: {
      hiddenReplace: { "Mental status": "UNRESPONSIVE on your arrival (unresponsive ~6 min per PD). He begins to rouse as you work — by the time a GCS is taken during the secondary assessment it is ~13: opens eyes to voice (3–4), confused speech (4), obeys / localizes (5–6). Repetitive questioning." },
      responseReplace: { "Determines responsiveness — AVPU": "Unresponsive on arrival (U). Rouses over the next few minutes — GCS ~13 by the time it is scored in the secondary assessment." },
    },
    transport: { priority: "unstable", destination: "Trauma Center with neurosurgery — Category I (GCS <14 with head trauma). Trauma alert. No ALS available — do not delay.", cite: TRIAGE },
    criticalAssessments: [
      { item: "Assess eyes — PEARL", label: "Left pupil 6 mm sluggish, becoming fixed — herniation warning", cite: HEAD },
      { item: "Blood glucose level", label: "BGL 94 — rules out hypoglycemia as the cause of AMS", cite: AMS },
    ],
    treatments: [
      tx("Full spinal immobilization — collar, backboard, straps, head blocks", "indicated", "EMR", SMR,
        { critical: true, result: "Immobilized; airway access maintained by preparing to roll the board if he vomits.", note: "SOP SMR: unconscious / GCS <14 / intoxicated patient after an assault → full immobilization." }),
      O2_NRB({ result: "SpO₂ 96% → 99%. Respirations remain irregular." }),
      tx("Airway monitoring — suction ready, prepared to roll the board for vomiting", "indicated", "EMR", TX.airway,
        { result: "Suction at the head; no vomiting yet.", note: "Head injury + alcohol + AMS = high aspiration risk." }),
      tx("Assist ventilations with a BVM (1 breath every 3–6 seconds)", "not-indicated", "EMT", HEAD,
        { result: "He is breathing 14/min at adequate depth with SpO₂ 96% → 99% on NRB — you do not ventilate for him. You keep the BVM at the head and keep watching the pattern.", note: "His own breathing is adequate, so do NOT ventilate for him — oxygen by NRB and airway monitoring are the treatment. Reassess constantly: if respirations become inadequate (too slow, too shallow, or SpO₂ falling on NRB) ventilate at 1 breath every 3–6 seconds (SOP Head Injury target EtCO₂ 35 mmHg), never faster. Hyperventilation blows off CO₂, constricts cerebral vessels, and worsens outcomes." }),
      tx("Hyperventilate with the BVM (1 breath every 1–2 seconds) to 'reduce brain swelling'", "contraindicated", "EMT", HEAD,
        { critical: true, result: "Cerebral vasoconstriction — you have made the brain injury worse.", note: "Routine hyperventilation is contraindicated (textbook ch. 33; SOP specifies 1 breath / 3–6 s)." }),
      tx("Nasopharyngeal airway", "contraindicated", "EMR", HEAD,
        { result: "Blood returns from the nostril.", note: "SOP PEARL: no NPA with facial injury or suspected basilar skull fracture. Use an OPA only if there is no gag reflex." }),
      tx("Direct pressure and dressing to the left temporal laceration", "indicated", "EMR", TX.soft,
        { result: "Bleeding controlled; hematoma noted.", note: "Scalp bleeds a lot; do not press hard on a possible depressed skull fracture." }),
      tx("Elevate the head of the backboard 15–30° (reverse Trendelenburg) once immobilized", "indicated", "EMR", TX.head,
        { result: "Board tilted head-up, straps snug.", note: "Textbook: head-up positioning with the spine immobilized helps venous drainage; do not bend the neck." }),
      tx("Naloxone 2 mg intranasal", "not-indicated", "EMT", PAIN,
        { result: "No change.", note: "Unequal pupils, adequate rate, ETOH odor, witnessed assault — this is a head injury, not an opioid overdose. Naloxone will not help and wastes scene time." }),
      tx("Oral glucose", "contraindicated", "EMR", DIAB,
        { result: "Cannot protect his airway; BGL is 94.", note: "BGL is normal and he cannot follow commands — aspiration risk with no benefit." }),
      tx("Trauma alert — Category I, suspected intracranial hematoma", "indicated", "EMR", PREARR,
        { result: "Neurosurgery notified.", note: "Report GCS, pupil change over time, and the Cushing's trend (BP up, HR down, irregular respirations)." }),
      PM_ONLY("Advanced airway / capnography-guided ventilation", HEAD),
    ],
  },
  "trauma-7": {
    patient: { age: 28, sex: "M" },
    sources: [TX.chest, RTC, TRIAGE],
    reviewerFlags: ["NEMO decision: a commercial vented chest seal and a three-sided occlusive dressing are the same intervention in practice — listed as one indicated, critical item. A fully sealed four-sided dressing is listed as contraindicated with a note to burp it."],
    transport: { priority: "unstable", destination: "Highest-level Trauma Center — Category I (penetrating torso). Trauma alert. No ALS available — reassess for tension pneumothorax every 5 minutes en route.", cite: TRIAGE },
    criticalAssessments: [
      { item: "Inspect for sucking chest wound on chest", label: "3 cm sucking wound left upper chest — open pneumothorax", cite: RTC },
      { item: "Inspect posterior for DCAP-BTLS", label: "Log-roll: no exit wound — but you have to look", cite: RTC },
    ],
    treatments: [
      O2_NRB({ result: "SpO₂ 89% → 95% once the chest wound is sealed." }),
      tx("Vented chest seal — or occlusive dressing taped on three sides — over the left chest wound", "indicated", "EMR", RTC,
        { critical: true, failCategory: 4, result: "Sucking sound stops; breathing eases. SpO₂ climbing.", note: "SOP Routine Trauma Care: 'If open pneumothorax, apply occlusive dressing and tape on three sides.' The open side lets air escape on exhalation." }),
      tx("Fully occlusive dressing taped on all four sides", "contraindicated", "EMR", RTC,
        { result: "Breathing improves at first — then worsens as pressure builds: JVD, trachea shifting.", note: "A sealed chest converts an open pneumothorax into a tension pneumothorax. If you use a non-vented seal, you must lift a corner ('burp') whenever he worsens. The SOP says three sides." }),
      tx("Log-roll to check for an exit wound or second stab", "indicated", "EMR", RTC,
        { result: "No exit wound; no other wounds on the back.", note: "Every penetrating chest wound gets a posterior check." }),
      tx("Position of comfort — sitting up, or injured side down if lying", "indicated", "EMR", TX.chest,
        { result: "He breathes easier semi-sitting.", note: "BP tolerates it (108/70). Injured side down splints the wound and protects the good lung." }),
      tx("Reassess every 5 minutes for tension pneumothorax — breath sounds, JVD, trachea, BP; burp the seal if he worsens", "indicated", "EMR", RTC,
        { result: "Mild JVD, trachea midline, diminished left — stable for now.", note: "Routine Trauma Care: ongoing assessment every 5 minutes. Tension pneumothorax decompression is a paramedic skill — you recognize it, burp the dressing, and drive." }),
      KEEP_WARM(),
      tx("Full spinal motion restriction", "not-indicated", "EMR", SMR,
        { result: "No benefit, and lying flat on a board makes his breathing worse.", note: "Isolated penetrating trauma without neurologic deficit does not meet SOP SMR criteria." }),
      BVM_NOT("Moving adequate air once the wound is sealed. Positive-pressure ventilation can accelerate a tension pneumothorax — only if truly inadequate."),
      tx("Trauma alert — Category I, open pneumothorax", "indicated", "EMR", PREARR,
        { result: "Trauma team activated.", note: "Pre-arrival report element." }),
      PM_ONLY("Needle decompression", S("needle-decompression-chest", 10)),
    ],
  },
  "trauma-8": {
    patient: { age: 36, sex: "F" },
    sources: [TX.soft, BURN, RTC, TRIAGE],
    reviewerFlags: ["No ALS available — airway burn with hoarseness is the highest-risk element. Early notification and continuous airway watch (ready to ventilate if the airway is compromised) are both listed as indicated, critical.", "TBSA ≈25% (≈23.5% partial-thickness + 2–3% full-thickness) — the two figures in the brief are the same estimate."],
    transport: { priority: "unstable", destination: "Burn center / Trauma Center per SOP triage special considerations (burns) — with inhalation injury, the closest facility able to secure the airway. No ALS available.", cite: TRIAGE },
    criticalAssessments: [
      { item: "Identifies if there is an obstruction", label: "Hoarse voice — SOP PEARL: voice change is a sentinel sign of airway burn", cite: BURN },
      { item: "Inspect face & scalp for DCAP-BTLS", label: "Singed eyebrows and nasal hair — inhalation injury", cite: BURN },
    ],
    treatments: [
      O2_NRB({ result: "SpO₂ 94% → 96%. Voice still hoarse — keep listening for stridor." }),
      tx("Early notification — airway burn, ~25% TBSA — request the receiving facility prepare for airway management", "indicated", "EMR", PREARR,
        { critical: true, result: "ED airway team ready on arrival.", note: "Hoarseness, singed nasal hair and facial burns = inhalation injury; airway swelling can close the airway within minutes to hours (textbook). SOP Burns PEARL: stridor or voice change are sentinel signs. With no ALS, minimizing scene time and early notification are the airway plan." }),
      tx("Airway watch — reassess voice, stridor, and work of breathing at least every 5 minutes; suction and BVM at the head, ready to ventilate if the airway is compromised", "indicated", "EMR", TX.airway,
        { critical: true, failCategory: 5, result: "Voice still hoarse, no stridor yet. You keep listening, keep the BVM within reach, and drive.", note: "An airway burn can go from hoarse to obstructed without warning. Continuous reassessment (SOP: every 5 minutes for an unstable patient) is the treatment you CAN deliver: if stridor, drooling, or falling SpO₂ appear, ventilate with the BVM and notify the ED that the airway is closing. Missing the deterioration is an airway/ABC critical failure." }),
      tx("Stop the burning process — confirm cooling is done, remove hot/greasy clothing not stuck to skin", "indicated", "EMR", BURN,
        { result: "Clothing removed; burns no longer hot to touch.", note: "She already ran cold water. Brief cooling only — no prolonged cooling of a large burn (hypothermia)." }),
      tx("Dry sterile dressings / burn sheet over partial- and full-thickness burns", "indicated", "EMR", BURN,
        { critical: true, result: "Burns covered with dry sterile dressings; hands dressed separately, fingers separated.", note: "SOP Adult Burns: partial/full thickness → dry sterile dressing (all scopes)." }),
      tx("Remove rings, watch, and jewelry from the hands and arms", "indicated", "EMR", TX.soft,
        { result: "Rings off before swelling.", note: "Textbook: swelling makes jewelry a tourniquet." }),
      tx("Estimate TBSA with the Rule of Nines", "indicated", "EMR", BURN,
        { result: "≈25% TBSA — ≈23.5% partial-thickness plus 2–3% full-thickness on the hands.", note: "Rule of Nines (textbook; SOP Burns). ≈25% is the working figure for the report — the partial and full-thickness parts add up to it." }),
      KEEP_WARM(TX.soft),
      tx("Ice or cold packs on the burns", "contraindicated", "EMR", BURN,
        { critical: true, result: "Tissue damage deepens; she starts shivering.", note: "Ice causes further injury and hypothermia. Never on burns." }),
      tx("Ointment, butter, or burn cream", "contraindicated", "EMR", TX.soft,
        { critical: true, result: "The ED will have to scrape it off.", note: "No ointments or creams on burns in the field." }),
      tx("Saline-soaked dressings over ~25% of her body", "contraindicated", "EMR", BURN,
        { result: "She becomes hypothermic en route.", note: "Wet dressings on a large TBSA burn cause hypothermia. SOP: dry sterile dressing." }),
      tx("Break the blisters", "contraindicated", "EMR", TX.soft,
        { result: "Open wounds — infection risk.", note: "Leave blisters intact." }),
      BVM_NOT("Currently ventilating adequately. If stridor develops or she tires, ventilate — and expect the airway to be difficult. This is why early notification matters."),
      PM_ONLY("Fentanyl for pain", PAIN),
      PM_ONLY("Advanced airway", BURN),
    ],
  },
};

// ---------- sheet handling ----------
const TREATMENT_ITEM = /^Treatment:|^If (wheezing|indicated|hypoglycemic|possible|risky|anaphylactic|shock)\b.*→|^Initiates .*oxygen|^Opens\/clears|^Administers proper treatment|^Proper oxygen therapy/;
const isTreatmentSection = (t) => /—\s*Treatment$/.test(t);

function flattenSheet(sheet) {
  const out = [];
  for (const sec of sheet.sections) {
    const items = [];
    for (const it of sec.items) {
      if (typeof it === "string") items.push({ item: it, treatment: TREATMENT_ITEM.test(it) });
      else for (const sub of it.items) items.push({ item: sub, subgroup: it.subgroup, treatment: TREATMENT_ITEM.test(sub) });
    }
    out.push({ title: sec.title, items });
  }
  return out;
}
function flattenComplaints(cs) {
  const out = {};
  for (const [k, c] of Object.entries(cs)) {
    out[k] = { label: c.label, sections: c.sections.map(s => ({ title: s.title, treatmentSection: isTreatmentSection(s.title), items: s.items.map(i => ({ item: i, treatment: TREATMENT_ITEM.test(i) || isTreatmentSection(s.title) })) })) };
  }
  return out;
}

const SHEETS = {
  medical: { label: "Medical", sections: flattenSheet(D.MEDICAL_SHEET), complaints: flattenComplaints(D.MEDICAL_SHEET.complaints) },
  trauma: { label: "Trauma", sections: flattenSheet(D.TRAUMA_SHEET), complaints: {} },
};
const CRITICAL_FAILS = D.CRITICAL_FAILS;

// Legacy itemResponses keys that are treatments (dropped) vs. findings (kept as extras)
const LEGACY_DROP = /^If (wheezing|anaphylactic)\b|^Treatment: .* — (bandage|bandage injury|immobilize if needed)$|^Proper position of comfort$/;

function sheetItemSet(type, complaint) {
  const s = new Set();
  for (const sec of SHEETS[type].sections) for (const it of sec.items) s.add(it.item);
  if (type === "medical") for (const c of Object.values(SHEETS.medical.complaints)) for (const sec of c.sections) for (const it of sec.items) s.add(it.item);
  return s;
}

function parseVitals(b) {
  const initial = [], after = [];
  for (const [label, val] of b.rows) {
    const parts = String(val).split(" → ");
    initial.push([label, parts[0].trim()]);
    after.push([label, (parts[1] || parts[0]).trim()]);
  }
  return { initial, after, afterNote: b.afterNote || "" };
}


// ───────────────────────────── PHASE 2: reasoning mode ─────────────────────────────
// Free-text → sheet-item synonym map. Keys are the EXACT sheet/complaint/extra item
// strings (the generator throws if any item lacks an entry). Values are case-insensitive
// regex fragments; they are emitted as sources and compiled in the browser.
const R = (...xs) => xs.map((x) => (x instanceof RegExp ? x.source : x));
const SKIN = String.raw`\bskin\b`;
const LUNG = String.raw`\blungs?\b|breath sounds|auscultat|listen to (the )?(chest|lungs)|wheez|\brales\b|crackle|rhonchi|stethoscope`;
const PMS_L = String.raw`\bpms\b|\bcms\b|\bcsm\b|pulse.*motor|motor.*sensor|sensation|wiggle (your )?toes|pedal|dorsalis|distal pulse|can you (feel|move) (your )?(legs?|feet|toes)|numb|tingl`;
const PMS_U = String.raw`\bpms\b|\bcms\b|\bcsm\b|pulse.*motor|motor.*sensor|sensation|squeeze my (hands?|fingers)|grip|radial pulse|can you (feel|move) (your )?(arms?|hands?|fingers)|wiggle (your )?fingers|numb|tingl`;
const VITALS = String.raw`\bvitals\b|vital signs|set of vitals`;
const SYN = {
  // ── scene size-up ──
  "Takes or verbalizes appropriate BSI/PPE precautions": R(String.raw`\bbsi\b|\bppe\b|gloves|glasses|goggles|body substance|precaution|mask up`),
  "Determines the scene/situation is safe": R(String.raw`scene (is )?safe|scene safety|\bsafety\b|is it safe|hazard|danger|secure the scene`),
  "Determines the mechanism of injury or nature of illness": R(String.raw`\bmoi\b|\bnoi\b|mechanism|nature of (the )?illness|what happened|how did (this|it|that) happen`),
  "Determines the number of patients": R(String.raw`number of patients|how many (patients|people|victims)|other patients|anyone else (hurt|injured)`),
  "Requests additional help (ALS, PD, FD) if necessary": R(String.raw`\bals\b|paramedic|backup|back-up|additional (help|resources|units)|\bpd\b|\bfd\b|police|fire department|intercept|more (units|help)`),
  // ── general impression ──
  "Patient description (age, sex assigned at birth)": R(String.raw`general impression|patient description|how old|\bage\b|\bsex\b|describe the patient|who (am i|are we) (looking at|treating)`),
  "Determines responsiveness — AVPU": R(String.raw`\bavpu\b|responsive|level of consciousness|\bloc\b|conscious|arous|sternal rub|shoulder (tap|shake)|are you (ok|okay|awake)|can you hear me`),
  "If alert → A&O out of 4 (who/where/when/general)": R(String.raw`a ?& ?o|a&o|alert and oriented|orient|what('s| is) your name|where are you|what day|what happened to you`),
  "If alert → A&O out of 4": R(String.raw`a ?& ?o|a&o|alert and oriented|orient|what('s| is) your name|where are you|what day|what happened to you`),
  "Considers spine stabilization": R(String.raw`spin(e|al) (stab|motion|precaution|immobil)|c[- ]?spine|hold (the )?head|manual stabiliz|\bsmr\b|hold c-?spine|stabilize (the )?(head|neck)`),
  "Determines apparent life threats": R(String.raw`life threat|anything (obviously )?life[- ]threatening|obvious threats|immediate threats`),
  "Determines chief complaint": R(String.raw`chief complaint|\bcc\b|what('s| is) (wrong|going on|bothering)|why did you call|what brings|what seems to be`),
  // ── ABC ──
  "Identifies if there is an obstruction": R(String.raw`\bairway\b|obstruct|patent|patency|can you (talk|speak)|stridor|gurgl|snoring|look in (the|his|her) mouth|open (the )?airway|head[- ]tilt|jaw[- ]thrust`),
  "Tidal volume (adequate chest rise/fall)": R(String.raw`tidal|chest rise|rise and fall|depth of breath|adequate breath|breathing adequate`),
  "Tidal volume": R(String.raw`tidal|chest rise|rise and fall|depth of breath|adequate breath|breathing adequate`),
  "Relative rate (fast, slow, regular)": R(String.raw`respiratory rate|resp rate|\brr\b|count (the )?breath|respirations|breathing (fast|slow|rate)|how fast (is|are) (he|she|they) breathing`),
  "Relative rate": R(String.raw`respiratory rate|resp rate|\brr\b|count (the )?breath|respirations|breathing (fast|slow|rate)|how fast (is|are) (he|she|they) breathing`),
  "Respiratory pattern (regular, irregular)": R(String.raw`respiratory pattern|breathing pattern|regular breathing|irregular breathing|rhythm of breath|cheyne`),
  "Respiratory pattern": R(String.raw`respiratory pattern|breathing pattern|regular breathing|irregular breathing|rhythm of breath|cheyne`),
  "Accessory muscle use": R(String.raw`accessory|retraction|work of breathing|\bwob\b|labored|tripod|nasal flaring|tugging|effort`),
  "SpO₂": R(String.raw`spo2|spo₂|pulse ox|\bsats?\b|oxygen saturation|o2 sat|saturation`),
  "Lung sounds": R(LUNG),
  "Assess/control major bleeding": R(String.raw`bleed|hemorrhag|blood sweep|major bleed|rapid trauma|sweep`),
  "Color": R(SKIN, String.raw`\bcolor\b|\bpale\b|cyano|flush|jaundice`),
  "Temperature": R(SKIN, String.raw`temperature|\bwarm\b|\bcool\b|\bcold\b|\bhot\b`),
  "Moisture": R(SKIN, String.raw`moist|diaphor|sweat|clammy|\bdry\b`),
  "Strength (weak, strong, bounding)": R(String.raw`\bpulse\b|pulse strength|weak pulse|strong pulse|bounding|thready`),
  "Rate (fast, slow, regular)": R(String.raw`\bpulse\b|heart rate|\bhr\b|pulse rate|how fast is (the|his|her) (pulse|heart)`),
  "Regularity (regular, irregular)": R(String.raw`\bpulse\b|regular pulse|irregular|regularity|rhythm`),
  "Equality (symmetrical, asymmetrical)": R(String.raw`\bpulse\b|equal|symmetr|bilateral pulse|both sides|compare (the )?pulses`),
  "Capillary refill": R(String.raw`cap(illary)? refill|\bcrt\b|nail bed|blanch`),
  "Identify if patient is in shock": R(String.raw`\bshock\b|perfus|compensat|hypoperfusion`),
  "Identify patient priority (stable/unstable) and transport decision": R(String.raw`priority|stable|unstable|transport decision|load and go|stay and play|load & go|how (fast|soon) (do we|should we) (go|transport)|sick or not sick`),
  "Patient priority & transport decision": R(String.raw`priority|stable|unstable|transport decision|load and go|stay and play|load & go|how (fast|soon) (do we|should we) (go|transport)|sick or not sick`),
  // ── OPQRST ──
  "Onset": R(String.raw`\bonset\b|when did (it|this|the pain) (start|begin)|sudden|gradual|what were you doing when`),
  "Provocation / palliation": R(String.raw`provo|palliat|make(s)? it (better|worse)|anything help|position help|what makes|worse when|better when`),
  "Quality": R(String.raw`quality|describe (the|your) pain|what does it feel like|\bsharp\b|\bdull\b|\bpressure\b|tearing|crushing|stabbing|aching|burning pain`),
  "Radiation": R(String.raw`radiat|spread|go anywhere|travel|move anywhere|\bjaw\b|down (your|the) arm|into (your|the) (arm|back|shoulder)`),
  "Severity": R(String.raw`severity|\bscale\b|1 ?(to|-) ?10|out of (10|ten)|how bad|rate (the|your) pain|pain score|zero to ten`),
  "Time": R(String.raw`how long|duration|since when|constant|come(s)? and go(es)?|how long ago|when did (it|this) (start|happen)|time of onset`),
  // ── AMPLE ──
  "Allergies": R(String.raw`allerg`),
  "Medications": R(String.raw`medication|\bmeds\b|prescri|what do you take|pills|drugs (do you|does he|does she) take|blood thinner|anticoag|viagra|cialis`),
  "Past pertinent medical history": R(String.raw`history|\bpmh\b|\bhx\b|medical (problems|conditions|issues)|diagnos|ever had this before|health problems|conditions`),
  "Past pertinent history": R(String.raw`history|\bpmh\b|\bhx\b|medical (problems|conditions|issues)|diagnos|ever had this before|health problems|conditions`),
  "Last oral intake": R(String.raw`last (ate|eat|drink|drank|meal|oral|food)|oral intake|eaten|when did you (last )?eat|anything to eat`),
  "Events leading up to present illness": R(String.raw`\bevents?\b|leading up|what were you doing|before (this|it) (started|happened)|what happened (before|today)|led up`),
  "Events leading up": R(String.raw`\bevents?\b|leading up|what were you doing|before (this|it) (started|happened)|what happened (before|today)|led up`),
  // ── vitals / diagnostics ──
  "Blood pressure": R(String.raw`blood pressure|\bbp\b|\bpressure\b|\bcuff\b|systolic|diastolic`, VITALS),
  "Pulse rate and quality": R(String.raw`\bpulse\b|heart rate|\bhr\b|radial|carotid`, VITALS),
  "Ventilatory rate and quality": R(String.raw`respiratory rate|resp rate|\brr\b|respirations|breathing rate|count (the )?breath`, VITALS),
  "Blood glucose level": R(String.raw`glucose|\bbgl\b|\bcbg\b|\bsugar\b|glucometer|finger ?stick|\bd-?stick\b|blood sugar`),
  // ── field impression / reassessment ──
  "States field impression of patient": R(String.raw`field impression|\bimpression\b|working diagnosis|differential|i think (this|it|he|she) (is|has)|what('s| is) (wrong with|going on with) (him|her|them)|my diagnosis`),
  "Determines reassessment frequency & re-evaluates transport decision": R(String.raw`reassess(ment)? (frequency|every|interval)|every (5|15|five|fifteen) min|how often|re-?evaluate transport|reassessment frequency`),
  "Repeats primary assessment": R(String.raw`repeat (the )?primary|primary (survey|assessment) again|re-?do (the )?primary|recheck (the )?abc|abcs again|repeat abc`),
  "Evaluates response to treatments": R(String.raw`response to treatment|is (it|he|she|that) (better|improving|working|helping)|did (it|that) (help|work)|recheck vitals|repeat vitals|reassess vitals|any better|how (do you|are you) feel(ing)? now|feeling better|improv`),
  "Reassesses patient complaints": R(String.raw`reassess (the )?(complaint|pain|chief)|still (hurt|painful|short of breath)|how('s| is) (the|your) (pain|breathing) now|pain now|any change`),
  "Provides accurate verbal report to receiving facility": R(String.raw`radio report|verbal report|\breport\b|call (the )?(hospital|er|ed|receiving)|pre-?arrival|notify (the )?(hospital|er|ed)|call it in|hand ?off`),
  // ── trauma secondary — head ──
  "Inspect face & scalp for DCAP-BTLS": R(String.raw`\bhead\b|\bface\b|scalp|skull|dcap`),
  "Inspect head for bleeding": R(String.raw`head (for )?bleed|scalp bleed|bleeding from (the )?head|blood (in|on) (the )?(hair|scalp|head)`),
  "Inspect for Raccoon Eyes": R(String.raw`raccoon|periorbital|black eyes`),
  "Inspect for Battle's Sign": R(String.raw`battle|behind (the )?ears?|mastoid`),
  "Inspect ears & nose for fluid (CSF, blood)": R(String.raw`\bcsf\b|\bears?\b|\bnose\b|fluid from|drainage|halo test|cerebrospinal`),
  "Inspect mouth (missing teeth, injury, abnormal odors)": R(String.raw`\bmouth\b|teeth|odor|\bsmell\b|tongue|sputum|soot|singe`),
  "Assess eyes — PEARL": R(String.raw`pearl|pupil|\beyes?\b|penlight|perrl`),
  "Palpate facial structures (crepitus, instability, deformity)": R(String.raw`facial (bone|structure)|palpate (the )?face|orbit|zygom|mandible|\bjaw\b|maxill|facial (fracture|instability)`),
  // ── neck ──
  "Inspect neck for DCAP-BTLS": R(String.raw`\bneck\b`),
  "Inspect neck for bleeding": R(String.raw`neck (for )?bleed|bleeding from (the )?neck`),
  "Inspect for JVD": R(String.raw`\bjvd\b|jugular|neck veins?`),
  "Inspect for subcutaneous emphysema on neck": R(String.raw`sub-?q|subcutaneous|emphysema|crepitus (in|on|around) (the )?neck|rice krispies`),
  "Palpate trachea — deviation": R(String.raw`trache|midline|deviat`),
  "Palpate cervical spine — inline, deformity, tenderness, fracture": R(String.raw`c[- ]?spine|cervical|neck (tender|pain)|posterior neck|step[- ]?off|back of (the )?neck`),
  // ── chest ──
  "Inspect chest for DCAP-BTLS": R(String.raw`\bchest\b|thorax|\bribs?\b|torso|dcap`),
  "Inspect chest for bleeding": R(String.raw`chest (for )?bleed|bleeding from (the )?chest`),
  "Inspect for sucking chest wound on chest": R(String.raw`sucking|open chest|bubbl|hole in (the )?chest|penetrating chest|chest wound`),
  "Inspect for subcutaneous emphysema on chest": R(String.raw`sub-?q|subcutaneous|emphysema|crepitus (in|on|around) (the )?chest|rice krispies`),
  "Inspect for paradoxical movement": R(String.raw`paradox|flail|segment|chest (wall )?move`),
  "Assess rate, tidal volume, rhythm, accessory muscle use": R(String.raw`tidal|chest rise|respiratory rate|resp rate|\brr\b|accessory|work of breathing|breathing (rate|effort)|respirations`),
  "Palpate shoulders": R(String.raw`shoulder`),
  "Palpate clavicles": R(String.raw`clavic|collar ?bone`),
  "Palpate sternum": R(String.raw`sternum|sternal|breast ?bone`),
  "Palpate ribs": R(String.raw`\bribs?\b|palpate (the )?chest|chest (wall )?(tender|palpat)|press on (the )?chest`),
  "Listen to lung sounds": R(LUNG),
  // ── abdomen ──
  "Inspect abdomen for DCAP-BTLS": R(String.raw`abdomen|abdom|\bbelly\b|stomach|quadrant|dcap`),
  "Inspect abdomen for bleeding": R(String.raw`abdom(en|inal) (for )?bleed|bleeding from (the )?(abdomen|belly|stomach)|belly (for )?bleed`),
  "Inspect for evisceration": R(String.raw`eviscerat|intestines|bowel (out|showing)|organs (out|showing)`),
  "Inspect for bruising around umbilicus (Cullen's)": R(String.raw`cullen|umbilic|belly ?button|navel`),
  "Inspect for bruising on flanks (Grey-Turner's)": R(String.raw`gr[ae]y|turner|flank`),
  "Palpate all four quadrants — rigidity": R(String.raw`rigid|guard|palpate (the |all |four |all four )*(quadrant|abdomen|belly|stomach)|press on (the |his |her )?(belly|abdomen|stomach)|abdom(en|inal) (tender|soft|palpat)|\bsoft\b|tender`),
  "Palpate quadrants — pulsating masses": R(String.raw`pulsat|pulsing|\baaa\b|aneurysm`),
  "Palpate quadrants — unusual masses": R(String.raw`\bmass|\blump|distend|distension|distention`),
  // ── pelvis ──
  "Inspect pelvis for DCAP-BTLS": R(String.raw`pelvi|\bhips?\b|groin|dcap`),
  "Inspect pelvis for bleeding": R(String.raw`pelvi(s|c) (for )?bleed|bleeding from (the )?(pelvis|groin)|groin (for )?bleed`),
  "If male → inspect for priapism": R(String.raw`priap|genital|erection`),
  "Push pelvic bones together and down — crepitus, instability": R(String.raw`pelvic (stab|compress|rock|spring|instab|palpat)|push .*pelvi|press .*pelvi|compress .*pelvi|pelvis (stable|unstable|tender)|iliac|check (the )?pelvis|palpate (the )?pelvis|pelvis`),
  // ── lower extremities ──
  "Inspect lower extremities for DCAP-BTLS": R(String.raw`\blegs?\b|lower ext|thigh|femur|\bknee|\bshin\b|ankle|\bfoot\b|\bfeet\b|\bcalf\b|dcap`),
  "Inspect lower extremities for bleeding": R(String.raw`(leg|legs|lower extremit(y|ies)|thigh|femur) (for )?bleed|bleeding from (the )?(leg|legs|thigh)`),
  "Assess each lower extremity for PMS": R(PMS_L),
  "Palpate down lower extremities — crepitus, instability, deformity": R(String.raw`palpate (down )?(the )?(legs?|lower|thigh|femur)|(legs?|thigh|femur|lower extremit(y|ies)) (for )?(crepitus|deform|instab|tender|fracture)|feel (down )?(the )?legs?|deformity`),
  // ── upper extremities ──
  "Inspect upper extremities for DCAP-BTLS": R(String.raw`\barms?\b|upper ext|\bhands?\b|wrist|forearm|elbow|finger|dcap`),
  "Inspect upper extremities for bleeding": R(String.raw`(arm|arms|hand|hands|upper extremit(y|ies)|forearm|wrist) (for )?bleed|bleeding from (the )?(arm|arms|hand|wrist)`),
  "Assess each upper extremity for PMS": R(PMS_U),
  "Palpate down upper extremities — crepitus, instability, deformity": R(String.raw`palpate (down )?(the )?(arms?|upper|hands?|forearm)|(arms?|hands?|forearm|wrist|upper extremit(y|ies)) (for )?(crepitus|deform|instab|tender|fracture)|feel (down )?(the )?arms?|deformity`),
  // ── posterior ──
  "Inspect posterior for DCAP-BTLS": R(String.raw`posterior|\bback\b|log ?roll|roll (him|her|them|the patient)|behind|buttock|exit wound|flip|dcap`),
  "Inspect posterior for bleeding": R(String.raw`(back|posterior) (for )?bleed|bleeding from (the )?back|exit wound|log ?roll`),
  "Inspect for sucking chest wound on back": R(String.raw`sucking|open chest|bubbl|hole in (the )?(chest|back)|exit wound|second (wound|hole)`),
  "Inspect for subcutaneous emphysema on back": R(String.raw`sub-?q|subcutaneous|emphysema|crepitus (in|on|around) (the )?back|rice krispies`),
  "Palpate spine for crepitus, deformity, tenderness": R(String.raw`\bspine\b|spinal|vertebra|step[- ]?off|palpate (the )?back|back (tender|pain)|lumbar|thoracic|sacr|down (the|his|her) back`),
  // ── complaint branches: respiratory ──
  "Chest pain": R(String.raw`chest pain|chest (hurt|tight|discomfort)|pain in (your|the) chest`),
  "Weakness": R(String.raw`\bweak|tired|fatigue`),
  "Fever": R(String.raw`fever|temperature|\bhot\b|chills`),
  "Swollen hands or feet": R(String.raw`swollen|swelling|edema|ankles|puffy`),
  "Cough": R(String.raw`cough`),
  "Respiratory infection / symptoms of one?": R(String.raw`infection|\bsick\b|\bcold\b|\bflu\b|pneumonia|congest|bronchitis|covid`),
  "Cough? Productive? What coughing up?": R(String.raw`productive|sputum|phlegm|mucus|coughing up|cough`),
  "More comfortable in any position?": R(String.raw`position|comfortable|sitting|lying|orthopnea|lie down|lay down`),
  "Look: accessory muscle use": R(String.raw`accessory|retraction|work of breathing|\bwob\b|labored|nasal flaring|effort`),
  "Look: tracheal tugging": R(String.raw`tugging|trache`),
  "Look: jugular vein distention (JVD)": R(String.raw`\bjvd\b|jugular|neck veins?`),
  "Look: abnormal positioning": R(String.raw`tripod|posture|positioning|leaning|how (is|are) (he|she|they) (sitting|positioned)`),
  "Listen: breath sounds (grunting, wheezing, rales, stridor)": R(LUNG, String.raw`stridor|grunt`),
  "Feel: tracheal deviation": R(String.raw`trache|midline|deviat`),
  // ── cardiac ──
  "Shortness of breath": R(String.raw`short(ness)? of breath|\bsob\b|dyspnea|trouble breathing|hard to breathe|breathing (ok|okay|alright)|breathless`),
  "Dizziness": R(String.raw`dizz|lighthead|faint|syncop|pass(ed)? out|woozy`),
  "Palpitations": R(String.raw`palpitat|racing|flutter|skipping|heart (pound|race)`),
  "Respiratory infection / symptoms?": R(String.raw`infection|\bsick\b|\bcold\b|\bflu\b|pneumonia|congest|bronchitis|covid`),
  "Does pain change with movement or deep breath?": R(String.raw`deep breath|movement|move|pleuritic|breathe in|reproduc|press on (the|your) chest`),
  "Look: JVD": R(String.raw`\bjvd\b|jugular|neck veins?`),
  "Look: peripheral edema": R(String.raw`edema|swollen|swelling|ankles|pitting|legs? (swell|puff)`),
  "Look: pursed-lip breathing": R(String.raw`pursed|lips? (when|while) breath`),
  "Look: pink frothy sputum": R(String.raw`frothy|pink|sputum|foam`),
  "Listen: breath sounds": R(LUNG),
  // ── neurological ──
  "Headache": R(String.raw`headache|head (hurt|pain)|migraine`),
  "Blurred vision": R(String.raw`vision|blurr|see (ok|okay|double|clearly)|eyesight|double`),
  "Cloudiness or confusion": R(String.raw`confus|cloud|fogg|disorient|clear[- ]headed|thinking (clearly|straight)`),
  "Other noticeable deficits": R(String.raw`deficit|weakness on one side|one[- ]sided|slur|droop|numb|can('t| not) move|trouble (speaking|walking)`),
  "Seeing/hearing things not there?": R(String.raw`hallucinat|seeing things|hearing things|voices|not there`),
  "Want to hurt yourself or others?": R(String.raw`hurt (yourself|himself|herself|others|someone)|suicid|homicid|harm (yourself|others)|self[- ]harm`),
  "Is presentation normal for patient? What is different / when did it begin?": R(String.raw`normal for (him|her|them)|baseline|different (from|than) (usual|normal)|usual self|like this before|acting (normal|different|strange)|last (seen|known) (normal|well)|when did (he|she|they) (start|become)`),
  "Recent drugs or alcohol? When/what/how much?": R(String.raw`drug|alcohol|drink|drunk|\buse\b|substance|opioid|heroin|pills|overdose|\bod\b`),
  "History of diabetes? Recent blood sugars?": R(String.raw`diabet|insulin|blood sugar|glucose|sugar`),
  "Fever?": R(String.raw`fever|temperature|\bhot\b|chills|infection|\bsick\b`),
  "Open wounds?": R(String.raw`wound|\bcut\b|laceration|injur|bleeding|trauma`),
  "Look: pupils (PEARL)": R(String.raw`pearl|pupil|\beyes?\b|penlight|perrl`),
  "Look: drug/alcohol paraphernalia": R(String.raw`paraphernalia|needle|syringe|bottles|pill bottle|drug|alcohol|look around|around the (room|scene|house)`),
  "Look: active seizure": R(String.raw`seiz|convuls|shaking|twitch|postictal|incontinen|tongue bit`),
  "Feel: head injuries": R(String.raw`head injur|\bhead\b|scalp|skull|bump|hematoma|palpate (the )?head|trauma to (the )?head`),
  "Feel: PMS (pulse, motor, sensory)": R(String.raw`\bpms\b|\bcms\b|\bcsm\b|pulse.*motor|motor|sensation|sensory|grip|squeeze my|wiggle|numb|tingl|move (your|his|her) (arms?|legs?|hands?|feet)|strength`),
  "Cincinnati Stroke Scale (FAST)": R(String.raw`cincinnati|stroke (scale|assessment|exam)|\bfast\b|\bbe-?fast\b|smile|arm drift|\bspeech\b|repeat (after me|a (sentence|phrase))|hold (your|both) arms|facial droop|stroke`),
  "Smell: fruity/acetone breath": R(String.raw`fruity|acetone|ketone|\bdka\b|sweet (smell|breath)|breath (smell|odor)`),
  "Smell: alcohol on breath": R(String.raw`alcohol (on|smell)|smell (of |like )?(alcohol|booze)|breath (smell|odor)|\bbooze\b|\betoh\b`),
  // ── anaphylaxis ──
  "Itchiness": R(String.raw`itch|hives|rash|urticaria|welts`),
  "Encountered known allergen?": R(String.raw`allergen|expos|\bsting|\bstung|\bbit(e|ten)\b|\bate\b|\beat|what did you (eat|touch|take)|contact with|come in contact|new (food|medic)|shellfish|shrimp|peanut|\bbee`),
  "Taken anything to treat? (EpiPen, inhaler, Benadryl)": R(String.raw`epi-?pen|benadryl|inhaler|taken anything|take anything|treat|antihistamine|diphenhydramine|used (your|the|an) (epi|inhaler)|carry`),
  "New medications, foods, or cleaning products?": R(String.raw`new (medication|meds|food|product|soap|detergent|cleaning)|changed anything|anything new|cleaning product|new (lotion|cosmetic)`),
  "Look: abnormal positioning (tripod, sniffing)": R(String.raw`tripod|sniffing|posture|positioning|leaning|how (is|are) (he|she|they) (sitting|positioned)`),
  "Look: facial swelling": R(String.raw`swell|\blips?\b|tongue|\bface\b|angioedema|puffy`),
  // ── abdominal ──
  "Vomiting? Describe; coffee-ground emesis or BRB?": R(String.raw`vomit|coffee|emesis|throw(ing|n)? up|puk|nause`),
  "Unusual bowel habits? Describe; dark tarry stool?": R(String.raw`bowel|stool|melena|tarry|\bblack\b|diarrhea|constipat|\bpoop\b|bathroom|hematochezia|bloody stool`),
  "Pain with urination? Unusual odors? Urine appearance?": R(String.raw`urin|\bpee\b|bladder|dysuria|hematuria`),
  "If female: vaginal discharge? Could be pregnant?": R(String.raw`pregnan|period|discharge|\blmp\b|menstrua|vaginal`),
  "Look: discoloration": R(String.raw`discolor|bruis|ecchymo|cullen|grey|gray|turner|flank|color of (the )?(belly|abdomen)`),
  "Look: distention": R(String.raw`distend|distension|distention|bloat|swollen (belly|abdomen)|big belly`),
  "Look: obvious injury": R(String.raw`injur|wound|trauma|scar|dcap|look at (the|his|her) (belly|abdomen|stomach)|expose (the )?(abdomen|belly)`),
  "Look: swelling": R(String.raw`swell|edema|puffy`),
  "Look: visible masses": R(String.raw`\bmass|\blump|bulge|pulsat|visible`),
  "Listen: periodic bowel sounds": R(String.raw`bowel sounds|auscultate (the )?(abdomen|belly)|listen to (the |his |her )?(abdomen|belly|stomach)|stethoscope (on|to) (the )?(belly|abdomen)`),
  "Palpate quadrants: tenderness": R(String.raw`tender|palpat|press (on|down)|push on|feel (the |his |her )?(belly|abdomen|stomach)|quadrant|\bhurt when`),
  "Palpate quadrants: rebound tenderness": R(String.raw`rebound|let go|release|peritoni`),
  "Palpate quadrants: guarding/rigidity": R(String.raw`guard|rigid|\bsoft\b|board[- ]?like|tense|firm`),
  "Palpate quadrants: unusual masses": R(String.raw`\bmass|\blump|pulsat|\baaa\b|aneurysm|bulge`),
  // ── extras ──
  "Chest pain or tightness?": R(String.raw`chest pain|chest (hurt|tight|discomfort)|pain in (your|the) chest|tightness`),
  "Fever, recent illness?": R(String.raw`fever|temperature|chills|\bsick\b|\bcold\b|\bflu\b|illness|infection|pneumonia`),
  "Triggers (allergens, exertion, cold air)": R(String.raw`trigger|allergen|exertion|exercise|cold air|exposure|\bcats?\b|\bdust\b|\bpollen\b|set (it|this) off|what (caused|started)`),
  "Smoking history": R(String.raw`smok|cigarette|vape|tobacco|pack`),
  "Look: tripod position": R(String.raw`tripod|posture|positioning|leaning|how (is|are) (he|she|they) (sitting|positioned)`),
  "Look: cyanosis": R(String.raw`cyano|\bblue\b|dusky|lip color|color of (the )?lips`),
  "Listen: wheezing": R(LUNG),
  "Listen: rales/rhonchi": R(String.raw`\brales\b|rhonchi|crackle|\blungs?\b|breath sounds|auscultat|wet lungs|fluid in (the )?lungs`),
  "Listen: stridor": R(String.raw`stridor|upper airway (sound|noise)|high[- ]pitched|airway (sound|noise)`),
  "Onset / triggering exposure": R(String.raw`\bonset\b|when did (it|this) (start|begin)|sudden|gradual|expos|trigger|\bsting|\bstung|\bate\b|\beat|allergen|what (caused|started|happened)`),
  "Itching, hives, rash": R(String.raw`itch|hives|rash|urticaria|welts|skin (bump|red)`),
  "Throat tightness / trouble swallowing": R(String.raw`throat|swallow|tight(ness)? in (the|your) throat|closing|voice|hoarse|lump in (the|your) throat`),
  "Wheezing / shortness of breath": R(String.raw`wheez|short(ness)? of breath|\bsob\b|dyspnea|trouble breathing|hard to breathe|breathing (ok|okay|alright)|tight chest`),
  "Dizziness / lightheadedness": R(String.raw`dizz|lighthead|faint|syncop|pass(ed)? out|woozy`),
  "Prior reactions / EpiPen use": R(String.raw`prior reaction|before|previous|last time|epi-?pen|carry|history of (allerg|reaction|anaphyl)|anaphyla`),
  "Look: facial/lip/tongue swelling": R(String.raw`swell|\blips?\b|tongue|\bface\b|angioedema|puffy|\bmouth\b`),
  "Look: hives / urticaria": R(String.raw`hives|urticaria|rash|welts|\bskin\b|red (blotch|patch)`),
  "Onset of symptoms (gradual vs sudden)": R(String.raw`\bonset\b|when did (it|this) (start|begin)|sudden|gradual|how (quickly|fast) did|last (seen|known) (normal|well)|when did (he|she|they) (start|become)`),
  "Headache, vision changes": R(String.raw`headache|head (hurt|pain)|vision|blurr|see (ok|okay|double|clearly)|eyesight`),
  "Recent trauma, fall, head injury": R(String.raw`trauma|\bfall|\bfell\b|head injur|hit (his|her|their) head|\binjur|bump`),
  "Recent illness, fever, drug/alcohol use": R(String.raw`illness|\bsick\b|fever|infection|drug|alcohol|drink|drunk|substance|overdose|\bod\b`),
  "Diabetes / insulin / time of last meal": R(String.raw`diabet|insulin|blood sugar|glucose|\bsugar\b|last (ate|eat|meal|oral|food)|eaten|when did (he|she|they) (last )?eat|metformin`),
  "Cincinnati Stroke Scale (Face, Arms, Speech, Time)": R(String.raw`cincinnati|stroke (scale|assessment|exam)|\bfast\b|\bbe-?fast\b|smile|arm drift|\bspeech\b|repeat (after me|a (sentence|phrase))|hold (your|both) arms|stroke`),
  "Look: facial droop": R(String.raw`droop|smile|face (symmetr|even)|facial (symmetr|asymmetr)|one side of (the|his|her) face`),
  "Look: posturing / abnormal movements": R(String.raw`postur|decorticate|decerebrate|abnormal move|seiz|twitch|tremor|shaking`),
  "Assess motor — grip strength bilateral": R(String.raw`grip|squeeze (my|both)|motor|strength|arm drift|hold (your|both) arms|move (your|his|her) (arms?|hands?|legs?)|push against`),
  "Assess sensation": R(String.raw`sensation|sensory|\bfeel (this|that|my)|numb|tingl|can you feel`),
  "Onset of pain (sudden vs gradual)": R(String.raw`\bonset\b|when did (it|this|the pain) (start|begin)|sudden|gradual|come on (fast|slow|quick)`),
  "Nausea, vomiting": R(String.raw`nause|vomit|emesis|throw(ing|n)? up|puk|sick to (your|his|her) stomach`),
  "Last bowel movement, melena, hematochezia": R(String.raw`bowel|stool|melena|tarry|\bblack\b|diarrhea|constipat|\bpoop\b|bathroom|hematochezia|bloody stool`),
  "Hematemesis or coffee-ground emesis": R(String.raw`hematemesis|coffee|vomit(ing|ed)? (up )?blood|blood in (the|his|her|your) vomit|throwing up blood`),
  "Last urination": R(String.raw`urin|\bpee\b|bladder|last (went|used) (to )?(the )?bathroom`),
  "Pregnancy possibility (if applicable)": R(String.raw`pregnan|period|\blmp\b|menstrua`),
  "Look: distension, scars, bruising": R(String.raw`distend|distension|distention|scar|bruis|ecchymo|cullen|grey|gray|turner|flank|look at (the|his|her) (belly|abdomen|stomach)|expose (the )?(abdomen|belly)|discolor`),
  "Look: pulsating masses (AAA)": R(String.raw`pulsat|pulsing|\baaa\b|aneurysm|\bmass|visible`),
  "Palpate: tenderness by quadrant": R(String.raw`tender|palpat|press (on|down)|push on|feel (the |his |her )?(belly|abdomen|stomach)|quadrant|\bhurt when|\bmass|\blump`),
  "Palpate: rigidity, guarding": R(String.raw`guard|rigid|\bsoft\b|board[- ]?like|tense|firm|rebound`),
  "Palpate: pedal pulses bilateral": R(String.raw`pedal|dorsalis|posterior tibial|distal pulse|femoral|pulses? in (the|his|her) (feet|legs)|foot pulse|compare (the )?pulses|\bpms\b`),
};

// Free-text → treatment matcher. Ordered [actionRegex, inputRegex]; the FIRST rule whose
// actionRegex matches the treatment's action string supplies the inputRegex the browser uses
// to recognise the student's typed intervention. Specific rules must precede general ones.
const TX_MATCH = [
  [/Airway watch|Airway monitoring/i, String.raw`airway (watch|monitor|plan)|watch .*airway|suction|monitor (the )?airway|bvm at the head|keep an eye on (the |her |his )?airway`],
  [/Something to eat/i, String.raw`\beat\b|food|sandwich|snack|juice|meal|carb`],
  [/in-line with CPAP/i, String.raw`cpap|positive (airway )?pressure|\bpeep\b|in-?line`],
  [/MDI|inhaler/i, String.raw`inhaler|\bmdi\b|puff`],
  [/nebulizer alone/i, String.raw`albuterol (alone|only)|just albuterol|without|no (atrovent|ipratropium)`],
  [/^Reassess|^Recheck/i, String.raw`reassess|recheck|listen again|repeat|again|re-?evaluat|monitor|watch for`],
  [/^Oxygen/i, String.raw`\bo2\b|oxygen|\bnrb\b|non-?rebreather|cannula|\bnc\b|high[- ]flow|mask`],
  [/^CPAP/i, String.raw`cpap|positive (airway )?pressure|\bpeep\b`],
  [/DuoNeb|albuterol|nebulizer/i, String.raw`\bneb|albuterol|duoneb|atrovent|ipratropium|breathing treatment|bronchodilator`],
  [/aspirin/i, String.raw`aspirin|\basa\b|324`],
  [/fourth dose/i, String.raw`fourth|4th|another nitro|more nitro|one more`],
  [/nitro/i, String.raw`nitro|\bntg\b`],
  [/Epinephrine 0\.15/i, String.raw`0\.15|junior|pediatric (dose|epi)|\bjr\b`],
  [/Repeat epinephrine/i, String.raw`repeat|second (dose|epi)|another (epi|dose)|again|more epi`],
  [/epinephrine|EpiPen/i, String.raw`\bepi\b|epinephrine|epi-?pen|adrenaline|auto-?injector`],
  [/Squeeze the whole tube/i, String.raw`squeeze|whole tube|entire tube|force`],
  [/Dextrose/i, String.raw`d10|d50|dextrose|iv (glucose|sugar)`],
  [/glucose/i, String.raw`oral glucose|glucose|sugar|glutose|\bgel\b`],
  [/glucagon/i, String.raw`glucagon`],
  [/naloxone/i, String.raw`narcan|naloxone`],
  [/Hyperventilate/i, String.raw`hyperventilat|fast breaths`],
  [/Advanced airway/i, String.raw`intubat|advanced airway|\bking\b|i-?gel|supraglottic|endotracheal`],
  [/Nasopharyngeal/i, String.raw`\bnpa\b|nasopharyngeal|nasal (airway|trumpet)`],
  [/bag-valve|BVM|Assist ventilations/i, String.raw`\bbvm\b|\bbag\b|ventilat|breathe for|squeeze`],
  [/Call a stroke alert/i, String.raw`stroke`],
  [/notification|alert/i, String.raw`alert|notif|call (ahead|the (hospital|er|ed|receiving)|it in)|stemi|trauma (alert|center)|radio|activate`],
  [/^Loosen/i, String.raw`loosen|release|let (some )?blood|periodically`],
  [/^Cover the tourniquet/i, String.raw`cover|hide|blanket over|bandage over`],
  [/across the wrist/i, String.raw`wrist|joint`],
  [/Elevate the extremity/i, String.raw`elevat|pressure point|raise (the )?(arm|extremity|hand)`],
  [/tourniquet/i, String.raw`tourniquet|\btq\b|\bcat\b`],
  [/direct pressure/i, String.raw`direct pressure|hold pressure|pressure (on|to|over)|press on`],
  [/pressure dressing/i, String.raw`pressure dressing|bandage|dressing|wrap`],
  [/Fully occlusive/i, String.raw`four|4[- ]sid|all sides|fully occlus`],
  [/Vented chest seal|Occlusive dressing to the chest/i, String.raw`vented|three|3[- ]sid|chest seal|occlusive|seal`],
  [/Occlusive dressing to the entry/i, String.raw`occlusive|seal|entry|abdom|front|belly`],
  [/exit wound/i, String.raw`exit|\bback\b|posterior|flank|log ?roll|second (wound|hole)`],
  [/Remove the C-collar/i, String.raw`remove (the )?collar|collar off`],
  [/Elevate the head/i, String.raw`elevate (the )?head|head (of the )?(board|bed|stretcher)|reverse trendelenburg|30|head up|raise (the )?head`],
  [/spinal|C-collar|backboard/i, String.raw`collar|backboard|long ?board|spinal|\bsmr\b|immobiliz|scoop|head ?block|strap`],
  [/^Splint/i, String.raw`splint|\bsam\b|traction|immobilize (the )?(leg|arm|hand|femur)`],
  [/Traction splint/i, String.raw`traction|hare|sager`],
  [/pelvic binder/i, String.raw`binder|pelvic (binder|wrap|sheet)|sheet|wrap (the )?pelvis`],
  [/scoop/i, String.raw`scoop|minimal (roll|movement)|orthopedic stretcher`],
  [/stinger/i, String.raw`stinger|scrape|remove (the )?sting|credit card|cold pack to the (site|sting)`],
  [/Ice or cold/i, String.raw`\bice\b|cold pack|cool pack|cold compress`],
  [/Ointment|butter/i, String.raw`ointment|butter|cream|lotion|salve|silvadene|neosporin`],
  [/Saline-soaked/i, String.raw`\bwet\b|soak|moist|damp`],
  [/blisters/i, String.raw`blister|\bpop\b`],
  [/Dry sterile|burn sheet/i, String.raw`dry (sterile )?dressing|burn sheet|sterile (sheet|dressing)|cover (the )?burn|dress(ing)? the burn|clean (dry )?sheet`],
  [/Stop the burning/i, String.raw`stop the burn|\bcool|cooling|remove (the )?(clothing|clothes)|expose|water (on|over)`],
  [/rings|jewelry/i, String.raw`\bring|jewel|\bwatch\b|necklace|bracelet`],
  [/Rule of Nines|TBSA/i, String.raw`nines|tbsa|percent|estimate|surface area`],
  [/Watch and wait/i, String.raw`\bwait\b|observe|hold off|watch (and|him|her)|do nothing|see if`],
  [/diphenhydramine/i, String.raw`benadryl|diphenhydramine|antihistamine`],
  [/Lasix|furosemide/i, String.raw`lasix|furosemide|water pill|diuretic`],
  [/Nothing by mouth/i, String.raw`\bnpo\b|nothing by mouth|no (food|water|eating|drinking)`],
  [/Give him water/i, String.raw`water|drink|\bsip`],
  [/\bwalk\b|\bstand\b|sit up\b|get up/i, String.raw`walk|ambulat|\bstand\b|get up|sit up`],
  [/Probe or pack/i, String.raw`probe|\bpack\b|stuff|explore (the )?wound`],
  [/detailed physical exam/i, String.raw`detailed (exam|assessment|physical)|full (exam|secondary) (on scene|before|first)|stay and play|head[- ]to[- ]toe`],
  [/Repeated deep palpation/i, String.raw`palpate .*again|keep (palpating|pressing|feeling)|deep palpat|press .*again`],
  [/Re-check pelvic stability/i, String.raw`\brock|pelvis again|re-?check (the )?pelvis|spring .*again`],
  [/Irrigate|debride/i, String.raw`irrigat|debride|clean .*wound|\bwash|flush|rinse`],
  [/Move the patient away|bees/i, String.raw`move (him|the patient|away|to)|get (him |the patient )?(away|out|into|to the)|away from (the )?bees|into the (ambulance|rig)|relocate`],
  [/length-based/i, String.raw`broselow|length[- ]based|\btape\b|weight|weigh|kilos|\bkg\b`],
  [/Family-centered/i, String.raw`\bmom\b|mother|parent|eye level|family|explain|reassure|calm|talk to (her|him)`],
  [/restrain/i, String.raw`restrain|hold .*down|\btie\b|\bpin\b`],
  [/Bandage/i, String.raw`bandage|dress(ing)? (the )?(forehead|laceration|abrasion|cut|wound)|gauze|cover (the )?(cut|laceration|wound)`],
  [/AED/i, String.raw`\baed\b|defib|\bpads\b`],
  [/12-lead|ECG/i, String.raw`\b12\b|ecg|ekg|monitor|leads`],
  [/\bIV\b|saline|fluid|\bIO\b/i, String.raw`\biv\b|\bio\b|saline|fluid|bolus|\bline\b|drip`],
  [/Fentanyl|pain management/i, String.raw`fentanyl|pain (med|control|management|relief)|morphine|analges|ketamine`],
  [/Needle decompression/i, String.raw`needle|decompress|\bdart\b`],
  [/warm/i, String.raw`warm|blanket|\bheat`],
  [/Supine|legs flat|Lay the patient/i, String.raw`supine|lay .*(down|flat)|lie (down|flat)|\bflat\b|on (his|her|their) back|shock position|trendelenburg|legs (up|elevat)`],
  [/upright|Position of comfort|^Sit /i, String.raw`\bsit|upright|fowler|position of comfort|tripod|lean forward|comfortable`],
];

// Item groups used by the gate rules (exact sheet/complaint/extra strings).
const I = {
  LUNGS: ["Lung sounds", "Listen to lung sounds", "Listen: breath sounds (grunting, wheezing, rales, stridor)", "Listen: breath sounds", "Listen: wheezing", "Listen: rales/rhonchi"],
  AVPU: ["Determines responsiveness — AVPU"],
  BP: ["Blood pressure"],
  BGL: ["Blood glucose level"],
  RR: ["Relative rate (fast, slow, regular)", "Relative rate", "Ventilatory rate and quality", "Assess rate, tidal volume, rhythm, accessory muscle use"],
  TIDAL: ["Tidal volume (adequate chest rise/fall)", "Tidal volume", "Assess rate, tidal volume, rhythm, accessory muscle use", "Ventilatory rate and quality"],
  PUPILS: ["Look: pupils (PEARL)", "Assess eyes — PEARL"],
  PMS_LOWER: ["Assess each lower extremity for PMS", "Palpate down lower extremities — crepitus, instability, deformity", "Inspect lower extremities for DCAP-BTLS"],
  PMS_UPPER: ["Assess each upper extremity for PMS", "Palpate down upper extremities — crepitus, instability, deformity", "Inspect upper extremities for DCAP-BTLS"],
  PELVIS: ["Push pelvic bones together and down — crepitus, instability", "Inspect pelvis for DCAP-BTLS"],
  CHEST: ["Inspect for sucking chest wound on chest", "Inspect chest for DCAP-BTLS", "Inspect chest for bleeding"],
  POSTERIOR: ["Inspect posterior for DCAP-BTLS", "Inspect posterior for bleeding", "Inspect for sucking chest wound on back"],
  ABDOMEN: ["Inspect abdomen for DCAP-BTLS", "Inspect abdomen for bleeding", "Assess/control major bleeding"],
  BLEED: ["Assess/control major bleeding", "Inspect upper extremities for bleeding", "Inspect lower extremities for bleeding", "Inspect head for bleeding"],
  SPINE: ["Considers spine stabilization", "Palpate cervical spine — inline, deformity, tenderness, fracture", "Determines the mechanism of injury or nature of illness"],
  PERFUSION: ["Blood pressure", "Identify if patient is in shock", "Capillary refill", "Color"],
  AIRWAY: ["Identifies if there is an obstruction", "Inspect mouth (missing teeth, injury, abnormal odors)", "Inspect face & scalp for DCAP-BTLS"],
  CINCI: ["Blood glucose level", "Cincinnati Stroke Scale (FAST)", "Cincinnati Stroke Scale (Face, Arms, Speech, Time)"],
};

// GATE_RULES: what a student must have assessed before a treatment is allowed without a
// "proceed anyway" violation. Every matching rule applies; each `any` list is filtered to the
// items that exist in the scenario, and the generator throws if that leaves a list empty.
const GATE_RULES = [
  [/aspirin/i, [{ any: ["Allergies"], why: "Aspirin is withheld for aspirin allergy — ask about allergies before you hand it over.", cite: TX.pharm }]],
  [/nitro/i, [
    { any: I.BP, why: "Nitroglycerin dilates vessels and drops blood pressure. It is contraindicated when the systolic pressure is already low — you need a BP first.", cite: TX.cardiac },
    { any: ["Medications"], why: "You may only assist with the patient's own prescribed nitroglycerin, and it is contraindicated after erectile-dysfunction drugs — the medication list tells you both.", cite: TX.cardiac },
  ]],
  [/^Oxygen/i, [{ any: ["SpO₂", "Accessory muscle use", ...I.RR, ...I.LUNGS, "Identify if patient is in shock", "Color", ...I.TIDAL], why: "Oxygen is given for a reason — hypoxia, respiratory distress, or shock. Look at the breathing or perfusion before you reach for the mask.", cite: TX.vent }]],
  [/DuoNeb|albuterol|nebulizer|MDI|inhaler/i, [{ any: I.LUNGS, why: "A bronchodilator treats bronchospasm. Listen to the lungs first — wheezing says yes; rales (fluid) or silence say something else is going on.", cite: TX.resp }]],
  [/^CPAP|in-line with CPAP/i, [
    { any: I.LUNGS, why: "CPAP is for pulmonary edema or severe bronchospasm with a patient still breathing on their own — the lung sounds tell you which problem you are treating.", cite: TX.resp },
    { any: I.BP, why: "CPAP raises intrathoracic pressure and can drop blood pressure; it is contraindicated in hypotension.", cite: TX.resp },
    { any: I.AVPU, why: "CPAP needs a patient who is awake, breathing on their own, and able to follow commands.", cite: TX.resp },
  ]],
  [/epinephrine|EpiPen/i, [{ any: ["Identifies if there is an obstruction", ...I.LUNGS, ...I.BP, "Look: facial swelling", "Accessory muscle use", "Identify if patient is in shock", "Look: hives / urticaria", "Look: facial/lip/tongue swelling"], why: "Epinephrine is for anaphylaxis — an allergic reaction with airway, breathing, or circulation involvement. Show that involvement (stridor, wheeze, swelling, hypotension) before you give it.", cite: TX.allergic }]],
  [/glucose|Squeeze the whole tube/i, [
    { any: I.BGL, why: "Confirm hypoglycemia with a glucometer before treating it — the same picture can be stroke, overdose, or intoxication.", cite: TX.diabetic },
    { any: I.AVPU, why: "Oral glucose goes only to a patient who is awake enough to swallow and protect the airway.", cite: TX.diabetic },
  ]],
  [/glucagon/i, [{ any: I.BGL, why: "Glucagon is for confirmed hypoglycemia when the patient cannot safely swallow — check the sugar first.", cite: TX.diabetic }]],
  [/naloxone/i, [{ any: [...I.RR, ...I.PUPILS, "Look: drug/alcohol paraphernalia"], why: "Naloxone reverses opioid respiratory depression. Look for the picture — slow shallow breathing, pinpoint pupils, paraphernalia — before you give it.", cite: TX.pharm }]],
  [/Call a stroke alert/i, [{ any: I.CINCI, why: "Hypoglycemia mimics stroke. Check a glucose and run the stroke scale before you activate the stroke team.", cite: TX.diabetic }]],
  [/^(?!Early notif).*(tourniquet|direct pressure|pressure dressing)/i, [{ any: I.BLEED, why: "Find and characterise the bleeding first — where it is, how fast, arterial or venous — then pick the control method.", cite: TX.soft }]],
  [/Traction splint/i, [
    { any: I.PELVIS, why: "A traction splint pulls against the pelvis. Check that the pelvis is stable before you apply traction.", cite: TX.msk },
    { any: I.PMS_LOWER, why: "Assess pulse, motor and sensation in the leg before and after any splint so you know what the splint changed.", cite: TX.msk },
  ]],
  [/pelvic binder/i, [{ any: I.PELVIS, why: "A binder is for a pelvis found unstable or tender on a single gentle compression. Assess the pelvis first — once.", cite: TX.msk }]],
  [/^Splint.*(hand|forearm|\barm\b|wrist|humerus)/i, [{ any: I.PMS_UPPER, why: "Check pulse, motor and sensation distal to the injury before you splint — a baseline you can compare after.", cite: TX.msk }]],
  [/^Splint(?!.*(hand|forearm|\barm\b|wrist|humerus))/i, [{ any: I.PMS_LOWER, why: "Check pulse, motor and sensation distal to the injury before you splint — a baseline you can compare after.", cite: TX.msk }]],
  [/chest seal|Occlusive dressing taped|Fully occlusive|Occlusive dressing to the chest/i, [{ any: I.CHEST, why: "An occlusive dressing goes on an open chest wound you have actually found. Expose and inspect the chest first.", cite: TX.chest }]],
  [/exit wound/i, [{ any: I.POSTERIOR, why: "You cannot dress a wound you have not found. Log-roll and inspect the back for an exit wound.", cite: TX.soft }]],
  [/entry wound/i, [{ any: I.ABDOMEN, why: "Expose and inspect the abdomen before you dress it — know what you are covering.", cite: TX.soft }]],
  [/spinal|C-collar|backboard|\bSMR\b/i, [{ any: I.SPINE, why: "Spinal motion restriction is a decision based on mechanism, neck findings and neurologic status — make the assessment first.", cite: TX.head }]],
  [/^Ventilate|bag-valve|^Hyperventilate|Assist ventilations/i, [{ any: I.TIDAL, why: "Ventilate only when breathing is inadequate — too slow, too shallow, or absent. Assess rate and tidal volume first.", cite: TX.vent }]],
  [/Repeat epinephrine|Something to eat/i, [{ any: ["Evaluates response to treatments"], why: "A repeat dose or follow-up depends on the response to the first treatment — reassess before you act again.", cite: TX.reassess }]],
  [/Lasix|furosemide/i, [{ any: ["Medications"], why: "You need the medication list before you touch any of the patient's own drugs.", cite: TX.pharm }]],
  [/Airway watch|Airway monitoring/i, [{ any: I.AIRWAY, why: "An airway plan starts with an airway assessment — patency, the mouth, the face.", cite: TX.airway }]],
  [/Elevate the head/i, [{ any: [...I.PUPILS, ...I.AVPU], why: "Head elevation is for suspected rising intracranial pressure — the pupils and mental status are what tell you it is there.", cite: TX.head }]],
  [/Needle decompression/i, [{ any: [...I.LUNGS, "Palpate trachea — deviation", "Inspect for JVD"], why: "Tension pneumothorax is a clinical diagnosis — absent breath sounds, JVD, tracheal deviation, falling BP. Assess before anyone decompresses.", cite: TX.chest }]],
  [/^Supine|legs flat|^Lay the patient|legs elevated/i, [{ any: I.PERFUSION, why: "Lying the patient flat is a shock position — it should follow a perfusion assessment, and it is wrong for a patient who needs to sit up to breathe.", cite: TX.shock }]],
];
const GATE_SKIP = /^Reassess|^Recheck/i;

const NEEDS_IMPRESSION = /aspirin|nitro|DuoNeb|albuterol|nebulizer|MDI|CPAP|epinephrine|EpiPen|glucose|glucagon|naloxone|stroke alert|STEMI|traction|binder|diphenhydramine|Lasix|Dextrose|fentanyl|12-lead|\bIV\b|\bIO\b|Something to eat|Watch and wait|Elevate the head|Needle decompression|Advanced airway|Early notification|Trauma alert|Nasopharyngeal|restrain/i;

// Field-impression checkpoint: one correct answer and three distractors, each with the
// scenario findings that rule it in or out. Cite = the scenario's primary textbook chapter.
const IMPRESSIONS = {
  "medical-1": [
    ["Acute asthma exacerbation (bronchospasm)", true, "Known asthmatic with a cat-exposure trigger, sudden onset, diffuse bilateral expiratory wheezing with prolonged expiration, tripod position, no JVD and no rales."],
    ["CHF / acute pulmonary edema", false, "Pulmonary edema gives rales, JVD, orthopnea and a cardiac history, usually in an older patient. She is 24 with asthma, wheezes without rales, no JVD, and a clear trigger."],
    ["Anaphylaxis", false, "No hives, no facial or lip swelling, no stridor, BP 138/86. Cat allergen here is triggering bronchospasm, not a systemic reaction."],
    ["Pneumothorax", false, "Her wheezing is bilateral and symmetric. A pneumothorax gives diminished or absent sounds on one side, typically with sudden sharp pleuritic pain or trauma."],
  ],
  "medical-2": [
    ["CHF / acute pulmonary edema", true, "Woke gasping at 3 AM after skipping his diuretic, coarse rales bilaterally, JVD at 45°, cannot lie flat, BP 178/102, CHF history — fluid backing up into the lungs."],
    ["Asthma / COPD exacerbation", false, "Rales rather than wheezes, JVD and a CHF history point to fluid, not bronchospasm. A nebulizer does nothing for fluid in the alveoli and can worsen the cardiac workload."],
    ["Acute coronary syndrome", false, "He describes only 'a little pressure'; the dominant findings are pulmonary — rales, JVD, orthopnea, missed water pill. ACS can precipitate pulmonary edema, so keep it in mind, but the working impression is the fluid."],
    ["Pneumonia", false, "No fever, no productive cough, sudden onset overnight after a missed dose. Pneumonia is gradual, febrile, with localized sounds."],
  ],
  "medical-3": [
    ["Acute coronary syndrome with cardiogenic shock", true, "Heavy chest pain radiating to the jaw and back with nausea and profuse diaphoresis, plus BP 86/58, pulse 52 and weak, gray skin and 4-second cap refill — the heart is failing as a pump."],
    ["Ruptured abdominal aortic aneurysm", false, "AAA is tearing abdominal or back pain with a pulsating mass and unequal pedal pulses. His pain is chest-centred, heavy, and goes to the jaw."],
    ["Indigestion / GI upset", false, "Heavy pain with jaw radiation, nausea, diaphoresis and shock is cardiac until proven otherwise. Indigestion does not drop the blood pressure to 86/58."],
    ["Pulmonary embolism", false, "Lungs clear and SpO₂ 95% on room air with a slow pulse. PE presents with tachycardia, hypoxia and pleuritic pain."],
  ],
  "medical-4": [
    ["Acute coronary syndrome / unstable angina", true, "Her known angina pattern has changed: pain with minimal exertion, 35 minutes and counting, unrelieved by two of her own nitroglycerin doses, and she stopped her aspirin a week ago. Angina that no longer responds to nitro is ACS until proven otherwise."],
    ["Stable angina", false, "Stable angina resolves with rest and one or two nitro doses within minutes. Thirty-five minutes and two failed doses is not stable."],
    ["Anxiety", false, "Pressure radiating to the left shoulder in a 71-year-old with coronary disease who stopped her aspirin — calling it anxiety misses ACS."],
    ["CHF / pulmonary edema", false, "Lungs clear, no JVD, no peripheral edema, SpO₂ 96%. The complaint is chest pressure, not shortness of breath."],
  ],
  "medical-5": [
    ["Anaphylaxis (bee sting)", true, "Known bee allergy, stung about 8 minutes ago, inspiratory stridor and wheeze (airway and breathing), diffuse hives and facial swelling (skin), BP 84/52 with pulse 132 (circulation). Two or more systems after an allergen is anaphylaxis."],
    ["Local allergic reaction", false, "A local reaction stays at the sting site. Hives everywhere, stridor and a BP of 84/52 mean the reaction is systemic."],
    ["Asthma attack", false, "No asthma history, and asthma does not cause stridor, hives, facial swelling or hypotension."],
    ["Foreign-body airway obstruction", false, "He was stung, not eating. The stridor is from airway swelling caused by anaphylaxis — abdominal thrusts will not help; epinephrine will."],
  ],
  "medical-6": [
    ["Anaphylaxis (shellfish)", true, "Severe shellfish allergy with two prior anaphylactic reactions, probable shrimp in the stir fry, then spreading hives, lip swelling, throat itch, chest tightness with wheezing and abdominal pain. Skin plus respiratory plus GI involvement is anaphylaxis even with a BP of 102/64."],
    ["Mild allergic reaction", false, "Hives alone would be mild. Wheezing, lip swelling and throat tightness are airway and breathing involvement, and it is spreading despite Benadryl."],
    ["Asthma attack", false, "No asthma history, and the wheeze arrived together with hives, lip swelling and a known allergen."],
    ["Food poisoning", false, "Dispatch said 'upset stomach', but food poisoning does not cause hives, lip swelling or wheezing. Abdominal pain and cramping are common in anaphylaxis."],
  ],
  "medical-7": [
    ["Hypoglycemia", true, "Insulin-dependent diabetic with prior lows, insulin last night after little food, now confused, pale and profusely diaphoretic with a glucose of 38."],
    ["Stroke", false, "Slurred speech can fool you, but his face and arm strength are symmetric and his glucose is 38. Hypoglycemia mimics stroke — check the sugar before you call a stroke alert."],
    ["Opioid overdose", false, "Pupils 3 mm and reactive, respirations 18 and adequate, no paraphernalia and no opioid history. Opioid overdose gives pinpoint pupils and slow breathing."],
    ["Alcohol intoxication", false, "No alcohol on the breath, no drinking reported, and a glucometer reading of 38 fully explains the confusion."],
  ],
  "medical-8": [
    ["Ruptured / leaking abdominal aortic aneurysm", true, "Sudden tearing pain through to the back, a pulsating upper-abdominal mass, unequal pedal pulses, near-syncope on standing, and shock (92/56, pulse 124, cap refill 4 s) in a hypertensive 50-pack-year smoker."],
    ["Acute coronary syndrome", false, "The pain is abdominal and back, 'tearing', with a pulsating mass — no chest pressure, no jaw or arm radiation. Aspirin and nitro here would make the bleed worse."],
    ["Kidney stone", false, "Renal colic is flank pain in waves with a normal blood pressure. He has a pulsating mass, rebound tenderness and hypotension."],
    ["GI bleed", false, "No hematemesis, no melena, no bloody stool. The bleeding is from the aorta into the abdomen, not into the gut."],
  ],
  "trauma-1": [
    ["Penetrating abdominal trauma with hemorrhagic shock", true, "Gunshot entry in the right upper quadrant and exit in the right flank — the track crosses the liver — with BP 82/50, pulse 138 and weak, 5-second cap refill, cold diaphoretic skin and lethargy."],
    ["Isolated soft-tissue wound", false, "The wounds barely bleed on the outside, but the vital signs show major bleeding inside. Penetrating abdominal wounds are internal injuries until proven otherwise."],
    ["Spinal injury", false, "No neurologic deficit, motor and sensation intact, and an isolated penetrating wound — spinal motion restriction is not indicated and only delays transport."],
    ["Tension pneumothorax", false, "Lungs clear and equal, trachea midline, no JVD. Both wounds are below the chest."],
  ],
  "trauma-2": [
    ["Crush injury with arterial hemorrhage", true, "Hand and forearm crushed with a bright red, spurting radial-side bleed that direct pressure is not controlling, no pulse or cap refill on the right, and a climbing heart rate — a life- and limb-threatening bleed that needs a tourniquet."],
    ["Simple closed fracture", false, "A closed fracture does not spurt bright red blood. The bleeding is the life threat; the bones come second."],
    ["Compartment syndrome", false, "Compartment syndrome develops over hours after a crush. Right now the problem is active arterial bleeding."],
    ["Decompensated hemorrhagic shock", false, "BP is still 118/76 with pulse 116 — he is compensating. Untreated, this bleed will take him there; stop it now."],
  ],
  "trauma-3": [
    ["Multisystem trauma — blunt chest injury with possible pneumothorax, femur fracture and spinal injury", true, "High-speed MVC, left chest wall bruising with rib crepitus, diminished left breath sounds with SpO₂ 93%, a deformed right femur, sensation and motor diminished below the knees, BP 94/60 and pulse 128."],
    ["Tension pneumothorax right now", false, "Trachea is midline, no JVD, no subcutaneous emphysema, BP 94/60 rather than collapsing. Diminished sounds with rib crepitus is a simple pneumothorax or contusion for now — reassess every 5 minutes because it can become tension."],
    ["Isolated femur fracture", false, "A femur fracture alone does not explain diminished left breath sounds, rib crepitus and neurologic change below the knees."],
    ["Asthma / bronchospasm", false, "Unilateral diminished sounds after a crash is trauma, not bronchospasm. A nebulizer does nothing for a pneumothorax."],
  ],
  "trauma-4": [
    ["Pediatric closed femur fracture with possible spinal injury and compensated shock", true, "Struck at about 25 mph, deformed closed right thigh, posterior cervical tenderness, pulse 138 with BP 96/60 — tachycardia is how a child compensates; the pressure falls late."],
    ["Minor injury — abrasions and a scare", false, "A forehead abrasion and crying can look minor, but the mechanism is a car and her heart rate is 138. Children compensate until they suddenly do not."],
    ["Open femur fracture", false, "The skin over the thigh is intact — a closed fracture. Open versus closed changes the dressing, not the need to splint, immobilize and go."],
    ["Significant head injury", false, "Alert and oriented for age, pupils equal and reactive, only an abrasion on the forehead. The findings are in the thigh, the neck and the heart rate."],
  ],
  "trauma-5": [
    ["Unstable pelvic fracture with spinal injury", true, "Fall from about 18 feet landing on the buttocks and back, pelvis unstable on gentle compression, lumbar tenderness with distal neurologic change, and early shock (pulse 118, pale cool diaphoretic)."],
    ["Lumbar back strain", false, "A muscular strain does not give an unstable pelvis or a pulse of 118 after an 18-foot fall."],
    ["Femur fracture", false, "Both thighs are intact and undeformed. The instability is at the pelvic ring."],
    ["Head injury", false, "No loss of consciousness, alert and oriented x4, pupils equal and reactive. This is axial loading of the pelvis and spine."],
  ],
  "trauma-6": [
    ["Traumatic brain injury with expanding intracranial hematoma / rising ICP", true, "Assaulted, left temporal hematoma and laceration, unresponsive on arrival then rousing to about GCS 13, left pupil 6 mm and sluggish, BP 152/88 with pulse 62 and irregular breathing — an early Cushing's pattern."],
    ["Alcohol intoxication", false, "Alcohol on the breath explains nothing about a dilated sluggish left pupil, a temporal hematoma and irregular respirations. Assume the head injury."],
    ["Hypoglycemia", false, "Glucose is 94. The diabetic mimic was ruled out with the glucometer."],
    ["Simple concussion", false, "A concussion does not produce a unilateral 6 mm sluggish pupil or bradycardia with hypertension. Those are signs of pressure inside the skull."],
  ],
  "trauma-7": [
    ["Open pneumothorax (sucking chest wound)", true, "A 3 cm stab wound to the left upper chest that bubbles on inspiration, diminished left breath sounds, mild subcutaneous emphysema, SpO₂ 89%, respirations 30 and labored."],
    ["Tension pneumothorax", false, "Not yet — trachea midline and BP 108/70. The mild JVD is exactly why you reassess every 5 minutes; if it becomes tension after you seal the wound, burp the seal."],
    ["Cardiac tamponade", false, "Tamponade gives muffled heart tones, JVD and hypotension with clear, equal lungs. His sounds are diminished on the left and the wound bubbles."],
    ["Simple chest laceration", false, "A wound that bubbles with each breath has entered the pleural space. That is an open pneumothorax, not a skin wound."],
  ],
  "trauma-8": [
    ["Burn with inhalation injury (about 25% TBSA)", true, "Flash burn to the face, neck, chest, forearms and hands with a hoarse voice, singed eyebrows and nasal hair, carbonaceous sputum and an upper-airway wheeze — the airway itself is burned and can swell shut."],
    ["Minor kitchen burn", false, "Face and neck burns with a hoarse voice and soot in the sputum are never minor. Airway swelling can close the airway within minutes to hours."],
    ["Anaphylaxis", false, "The hoarseness and wheeze follow thermal injury to the airway, not an allergen. No hives, and the burns explain everything."],
    ["Full-thickness burns — fluid resuscitation is the priority", false, "Fluid resuscitation is an ALS and hospital decision. At the EMT level the priority is the airway, dry dressings, warmth and early notification — do not let TBSA math delay transport."],
  ],
};

// Deterioration clock: fires when the run is still active at `at` seconds and none of the
// treatments in `unless.tx` (indices into the scenario's treatment list) has been performed.
// `unless: []` fires regardless — the lesson is that transport is the treatment.
const DETERIORATION = {
  "medical-1": [
    { at: 300, unless: [1], vitals: { "SpO₂": "84%", "RR": "32, labored, one-word answers", "Skin": "Pale; lips dusky" }, narrative: "She is tiring. One-word answers now, lips dusky. Oxygen alone does not open bronchospastic airways — she needs a bronchodilator.", cite: TX.resp },
    { at: 600, unless: [1], vitals: { "RR": "10, minimal chest rise", "SpO₂": "78%", "Lung sounds": "Nearly silent chest", "Mental status": "Drowsy" }, narrative: "The wheezing has gone quiet — that is not improvement, it is air no longer moving. She is heading for respiratory arrest: bronchodilator, be ready to ventilate, ALS.", cite: TX.resp },
  ],
  "medical-2": [
    { at: 300, unless: [1], vitals: { "SpO₂": "80% on NRB", "RR": "34, gasping", "Lung sounds": "Rales to the apices; pink froth at the lips" }, narrative: "Oxygen alone is not moving fluid out of the alveoli. He is gasping with pink froth at the lips. CPAP splints the alveoli open and pushes the fluid back.", cite: TX.resp },
    { at: 540, unless: [1], vitals: { "Skin": "Gray, cyanotic", "RR": "8, shallow", "Mental status": "Drowsy, barely rousable" }, narrative: "He is exhausted and hypoventilating. CPAP's window has closed — a drowsy patient cannot protect the airway. Assist ventilations with a BVM and get an ALS intercept.", cite: TX.resp },
  ],
  "medical-3": [
    { at: 420, unless: [], vitals: { "BP": "78/44", "HR": "48, weak, irregular", "Skin": "Gray, mottled", "Mental status": "Confused" }, narrative: "Cardiogenic shock is deepening. Nothing on the ambulance reopens a blocked coronary artery — the only fix is a cath lab. If you are still on scene, load and go.", cite: TX.cardiac },
    { at: 660, unless: [], vitals: { "HR": "38", "BP": "64/40", "Mental status": "Barely responds to voice" }, narrative: "Bradycardia and pressure both falling. AED on, keep him supine and warm, transport immediately with an ALS intercept.", cite: TX.cardiac },
  ],
  "medical-4": [
    { at: 480, unless: [], vitals: { "HR": "96, irregular", "Skin": "Pale, diaphoretic", "Mental status": "Anxious" }, narrative: "Pain is climbing back to 8/10 despite nitro, she is now diaphoretic and the pulse has turned irregular. This is ACS evolving — transport with early notification; do not wait for it to settle.", cite: TX.cardiac },
  ],
  "medical-5": [
    { at: 240, unless: [0], vitals: { "BP": "78/40", "SpO₂": "86% on NRB", "RR": "30, marked stridor", "Skin": "Hives spreading; cool, mottled periphery" }, narrative: "His airway is closing. Oxygen and positioning do not reverse anaphylaxis — epinephrine does. 0.3 mg IM, anterolateral thigh, now.", cite: TX.allergic },
    { at: 480, unless: [0], vitals: { "Mental status": "Unresponsive", "BP": "60/palp", "HR": "140 weak, then slowing", "RR": "6, agonal" }, narrative: "Anaphylactic shock with an obstructing airway. Epinephrine, ventilate with a BVM, prepare for arrest, ALS.", cite: TX.allergic },
  ],
  "medical-6": [
    { at: 300, unless: [0], vitals: { "BP": "88/54", "HR": "128", "RR": "28", "SpO₂": "91%", "Lung sounds": "Wheezing louder, some inspiratory stridor" }, narrative: "Diphenhydramine does not stop anaphylaxis. Epinephrine does. Her airway and blood pressure are now involved — 0.3 mg IM.", cite: TX.allergic },
    { at: 540, unless: [0], vitals: { "BP": "70/40", "RR": "32, stridor", "Mental status": "Drowsy" }, narrative: "Anaphylactic shock. Epinephrine now, repeat in 5 minutes if there is no improvement, ALS intercept.", cite: TX.allergic },
  ],
  "medical-7": [
    { at: 360, unless: [0, 8], vitals: { "Mental status": "U — no longer responds to voice", "BGL": "31", "Skin": "Cold, soaked" }, narrative: "He has slipped into unresponsiveness. Oral glucose is now off the table — he cannot protect his airway. Glucagon IM or intranasal, or ALS for IV dextrose; protect the airway; transport.", cite: TX.diabetic },
    { at: 600, unless: [0, 8], vitals: { "Mental status": "Tonic-clonic seizure" }, narrative: "Hypoglycemic seizure. Protect him from injury, manage the airway when it stops, glucagon if you carry it, ALS intercept.", cite: TX.diabetic },
  ],
  "medical-8": [
    { at: 420, unless: [], vitals: { "BP": "78/48", "HR": "138, thready", "Skin": "Mottled, cold", "Cap refill": "5+ s", "Mental status": "Anxious, confused" }, narrative: "The aneurysm is bleeding faster. Nothing at the EMT level stops the bleeding — surgery does. Gentle handling, oxygen, warmth, and the fastest ride to a facility that can operate.", cite: TX.shock },
    { at: 660, unless: [], vitals: { "BP": "60/palp", "Mental status": "Unresponsive" }, narrative: "Decompensated hemorrhagic shock. Airway, oxygen, keep him flat and warm, AED ready, go.", cite: TX.shock },
  ],
  "trauma-1": [
    { at: 420, unless: [], vitals: { "BP": "70/40", "HR": "148, thready", "Mental status": "Confused, then drowsy", "Skin": "Mottled, cold" }, narrative: "Bleeding from the liver continues inside. The only fix is a surgeon. Seven minutes on scene is too long — occlusive dressings on, oxygen, warm, go.", cite: TX.shock },
    { at: 660, unless: [], vitals: { "Mental status": "Unresponsive", "BP": "Unobtainable" }, narrative: "Decompensated hemorrhagic shock. Support ventilations, prepare for arrest, ALS intercept, trauma center.", cite: TX.shock },
  ],
  "trauma-2": [
    { at: 180, unless: [2], vitals: { "HR": "132", "BP": "98/60", "Skin": "Pale, cool, diaphoretic" }, narrative: "Blood is soaking through. Direct pressure is not holding an arterial bleed — that is what the tourniquet is for. 2–3 inches above the wound, not over a joint, tighten until the bleeding stops, note the time.", cite: TX.soft },
    { at: 420, unless: [2], vitals: { "BP": "76/40", "HR": "144, thready", "Mental status": "Drowsy" }, narrative: "Hemorrhagic shock from a bleed you can control. Tourniquet now, then oxygen and warmth.", cite: TX.soft },
  ],
  "trauma-3": [
    { at: 480, unless: [], vitals: { "Lung sounds": "Absent on left; JVD present; trachea deviating right", "BP": "76/50", "HR": "140", "SpO₂": "86% on NRB" }, narrative: "The simple pneumothorax has become a tension pneumothorax — absent left sounds, JVD, trachea shifting. He needs needle decompression (ALS) and a trauma center. If you are still on scene, go.", cite: TX.chest },
  ],
  "trauma-4": [
    { at: 360, unless: [2], vitals: { "HR": "150", "BP": "88/54", "Cap refill": "3 s", "Skin": "Pale, cool; she has gone quiet" }, narrative: "She has gone quiet — that is not calm, it is compensation failing. The femur is bleeding into the thigh; splint it to slow the bleeding and go.", cite: TX.peds },
    { at: 600, unless: [], vitals: { "HR": "160", "BP": "76/48", "Cap refill": "4 s", "Mental status": "Lethargic" }, narrative: "Decompensated shock in a child — the pressure has finally dropped. Oxygen, warmth, pediatric trauma center now.", cite: TX.peds },
  ],
  "trauma-5": [
    { at: 300, unless: [1], vitals: { "BP": "84/52", "HR": "132", "Skin": "Pale, cool, diaphoretic", "Cap refill": "4 s" }, narrative: "An unstable pelvis can bleed enough to be life-threatening, into a space you cannot see. The binder closes the pelvic ring and slows the bleed — centered over the greater trochanters.", cite: TX.msk },
    { at: 600, unless: [1], vitals: { "BP": "70/44", "HR": "144", "Mental status": "Drowsy" }, narrative: "Hemorrhagic shock from the pelvis. Binder, oxygen, warmth, trauma center.", cite: TX.msk },
  ],
  "trauma-6": [
    { at: 360, unless: [], vitals: { "BP": "188/58", "HR": "48", "RR": "8, irregular (Cheyne-Stokes)", "Pupils": "L 7 mm fixed, R 4 mm sluggish", "Mental status": "GCS falling — withdraws from pain only" }, narrative: "Cushing's triad is here — rising pressure, falling pulse, irregular breathing. The hematoma is expanding and he needs a neurosurgeon: airway, ventilatory support only if breathing becomes inadequate, head elevated, go.", cite: TX.head },
    { at: 600, unless: [], vitals: { "Mental status": "Unresponsive, decerebrate posturing", "RR": "10, irregular" }, narrative: "Herniation is underway. Support the airway and ventilations and go — every minute on scene is brain.", cite: TX.head },
  ],
  "trauma-7": [
    { at: 180, unless: [1], vitals: { "SpO₂": "85% on NRB", "RR": "34, labored" }, narrative: "With every breath, air is being pulled in through the hole instead of the trachea. Oxygen cannot fix that. Seal the hole — a vented chest seal or an occlusive dressing taped on three sides.", cite: TX.chest },
    { at: 480, unless: [5], vitals: { "Lung sounds": "Absent left; JVD marked; trachea deviating right", "BP": "78/50", "HR": "140", "SpO₂": "84%" }, narrative: "Tension pneumothorax. If you sealed the wound, burp it — lift a corner to let the trapped air out. Reassessing every 5 minutes is what catches this; needle decompression is ALS. Go.", cite: TX.chest },
  ],
  "trauma-8": [
    { at: 360, unless: [2], vitals: { "RR": "28, stridor", "Lung sounds": "Inspiratory stridor with wheeze", "SpO₂": "90% on NRB", "Mental status": "Anxious; voice now a whisper" }, narrative: "The airway is swelling shut. Hoarseness has become a whisper and stridor is here. She needs a hospital that is ready to intubate — early notification and transport, suction and BVM at the head.", cite: TX.soft },
    { at: 600, unless: [], vitals: { "RR": "32, severe stridor", "SpO₂": "84%", "Mental status": "Panicked, then drowsy" }, narrative: "Impending airway occlusion. Assist ventilations with a BVM if she tires, ALS intercept for an advanced airway, go.", cite: TX.soft },
  ],
};

function phase2Treatment(id, t, known, extrasSet) {
  const rule = TX_MATCH.find(([a]) => a.test(t.action));
  if (!rule) throw new Error(id + " no TX_MATCH rule for treatment: " + t.action);
  const requires = [];
  if (!GATE_SKIP.test(t.action)) {
    for (const [a, reqs] of GATE_RULES) {
      if (!a.test(t.action)) continue;
      for (const r of reqs) {
        const any = r.any.filter((i) => known.has(i) || extrasSet.has(i));
        if (!any.length) throw new Error(id + " gate for '" + t.action + "' has no items in scenario: " + r.any.join(" | "));
        const key = any.join("|");
        if (requires.some((x) => x.any.some((i) => any.includes(i)))) continue;
        requires.push({ any, why: r.why, cite: r.cite });
      }
    }
  }
  return { ...t, match: rule[1], requires, needsImpression: !GATE_SKIP.test(t.action) && !/^Oxygen/i.test(t.action) && NEEDS_IMPRESSION.test(t.action) };
}

function buildPhase2(id, src, ov, treatments, known) {
  const imp = IMPRESSIONS[id];
  if (!imp) throw new Error("no IMPRESSIONS for " + id);
  const options = imp.map(([label, correct, why]) => ({ label, correct, why, cite: ov.sources[0] }));
  if (options.filter((o) => o.correct).length !== 1 || options.length < 3) throw new Error(id + " impression options malformed");
  const rows = new Set(parseVitals(src.brief[2]).initial.map(([l]) => l).concat(["Mental status"]));
  const det = DETERIORATION[id];
  if (!det) throw new Error("no DETERIORATION for " + id);
  let last = 0;
  const deterioration = det.map((e) => {
    if (!(Number.isInteger(e.at) && e.at > last)) throw new Error(id + " deterioration 'at' must be ascending positive: " + e.at);
    last = e.at;
    for (const i of e.unless) {
      if (!treatments[i]) throw new Error(id + " deterioration unless index out of range: " + i);
      if (treatments[i].verdict !== "indicated") throw new Error(id + " deterioration unless points at a non-indicated treatment: " + treatments[i].action);
    }
    for (const r of Object.keys(e.vitals)) if (!rows.has(r)) throw new Error(id + " deterioration vitals row not in initial vitals: " + r);
    if (!e.narrative) throw new Error(id + " deterioration narrative empty");
    return { at: e.at, unless: { tx: e.unless }, vitals: Object.entries(e.vitals), narrative: e.narrative, cite: e.cite };
  });
  return { impression: { options }, deterioration };
}

// Completeness: every non-treatment sheet item, complaint-branch item, and per-scenario extra
// must have a synonym entry, or reasoning mode could never recognise it.
{
  const need = new Set();
  for (const type of ["medical", "trauma"]) {
    for (const sec of SHEETS[type].sections) for (const it of sec.items) if (!it.treatment) need.add(it.item);
    for (const c of Object.values(SHEETS[type].complaints)) for (const sec of c.sections) if (!sec.treatmentSection) for (const it of sec.items) if (!it.treatment) need.add(it.item);
  }
  for (const [id, src] of Object.entries(D.SCENARIOS)) {
    const known = sheetItemSet(id.startsWith("medical") ? "medical" : "trauma", (OVERLAY[id] || {}).complaint);
    for (const k0 of Object.keys(src.itemResponses)) {
      const k = k0.trim();
      if (known.has(k) || LEGACY_DROP.test(k) || TREATMENT_ITEM.test(k)) continue;
      need.add(k);
    }
  }
  const missing = [...need].filter((i) => !SYN[i]);
  if (missing.length) throw new Error("SYN missing entries for: " + missing.map((m) => JSON.stringify(m)).join(", "));
  const extra = Object.keys(SYN).filter((k) => !need.has(k));
  if (extra.length) throw new Error("SYN has entries for unknown items: " + extra.join(", "));
  for (const [k, v] of Object.entries(SYN)) for (const s of v) new RegExp(s, "i");
  for (const [, s] of TX_MATCH) new RegExp(s, "i");
}
const SYN_OUT = SYN;

const scenarios = [];
for (const [id, src] of Object.entries(D.SCENARIOS)) {
  const ov = OVERLAY[id];
  if (!ov) throw new Error("no overlay for " + id);
  const type = id.startsWith("medical") ? "medical" : "trauma";
  const known = sheetItemSet(type, ov.complaint);
  const responses = {}, extras = [];
  // Proctor-facing phrasing in the briefs is rewritten for the student view.
  const studentVoice = (s) => String(s)
    .replace(/\(if checked, don't give points for checking unnecessarily\)\)?/g, "(if checked — not required on this call)")
    .replace(/Student should say, /g, "Expected verbalization: ");
  // Per-scenario brief overrides (NEMO reviewer decisions) — applied to the source
  // text without editing proctor_data.json.
  const bo = ov.brief || {};
  const applyReplace = (html, pairs, what) => {
    let out = html;
    for (const [from, to] of pairs || []) {
      if (!out.includes(from)) throw new Error(id + " " + what + " override text not found: " + from.slice(0, 80));
      out = out.split(from).join(to);
    }
    return out;
  };
  for (const [k0, v0] of Object.entries(src.itemResponses)) {
    const k = k0.trim(); const v = studentVoice((bo.responseReplace || {})[k] != null ? bo.responseReplace[k] : v0);
    if (known.has(k)) { if (!TREATMENT_ITEM.test(k)) responses[k] = v; continue; }
    if (LEGACY_DROP.test(k) || TREATMENT_ITEM.test(k)) continue;
    extras.push({ item: k, text: v });
  }
  const [dispatch, scene, vitals, hidden, expected, pitfalls] = src.brief;
  for (const k of Object.keys(bo.responseReplace || {})) if (!(k in src.itemResponses)) throw new Error(id + " responseReplace key not in itemResponses: " + k);
  const sceneBody = applyReplace(scene.body, bo.sceneReplace, "scene");
  const expectedBody = applyReplace(expected.body, bo.expectedReplace, "expected");
  const hiddenItems = hidden.items.map(([label, text]) => [label, (bo.hiddenReplace || {})[label] != null ? bo.hiddenReplace[label] : text]);
  for (const label of Object.keys(bo.hiddenReplace || {})) if (!hidden.items.some(([l]) => l === label)) throw new Error(id + " hiddenReplace label not found: " + label);
  // validate criticalAssessments reference real sheet items
  for (const ca of ov.criticalAssessments || []) if (!known.has(ca.item)) throw new Error(id + " criticalAssessment not a sheet item: " + ca.item);
  const extrasSet = new Set(extras.map((e) => e.item));
  const treatments = ov.treatments.map((t) => phase2Treatment(id, t, known, extrasSet));
  scenarios.push({
    id, title: src.title, tag: src.tag, type, complaint: ov.complaint || null,
    patient: ov.patient,
    meta: { reviewedBy: null, reviewedOn: null, sources: ov.sources, reviewerFlags: ov.reviewerFlags || [] },
    dispatch: dispatch.body, scene: sceneBody,
    vitals: parseVitals(vitals),
    hidden: hiddenItems,
    responses, extras,
    treatments,
    criticalAssessments: ov.criticalAssessments || [],
    transport: ov.transport,
    expectedTreatmentHtml: expectedBody, pitfallsHtml: pitfalls.body,
    phase2: buildPhase2(id, src, ov, treatments, known),
  });
}

const banner = `// GENERATED by gen_trainer.js — do not hand-edit. Source: NEMO proctor scenario briefs + Emergency Care 14th ed. / Region X SOP overlays (textbook is the primary authority).\n// Contains scenario content only — nothing from the proctor access-controlled page is carried over.\n`;
const j = (o) => JSON.stringify(o, null, 1);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "sheets.js"), banner + `window.TRAINER_SHEETS = ${j(SHEETS)};\nwindow.TRAINER_CRITICAL_FAILS = ${j(CRITICAL_FAILS)};\nwindow.TRAINER_SYNONYMS = ${j(SYN_OUT)};\n`);
fs.writeFileSync(path.join(OUT, "scenarios.js"), banner + `window.PROTOCOL_EDITION = ${j(PROTOCOL_EDITION)};\nwindow.TEXTBOOK_EDITION = ${j(TEXTBOOK_EDITION)};\nwindow.REVIEWERS = ${j(REVIEWERS)};\nwindow.TRAINER_SCENARIOS = ${j(scenarios)};\n`);
console.log("wrote", scenarios.length, "scenarios");
for (const s of scenarios) console.log(s.id, "responses", Object.keys(s.responses).length, "extras", s.extras.length, "treatments", s.treatments.length, "crit", s.treatments.filter(t => t.critical && t.verdict === "indicated").length);

if (process.argv.includes('--map')) for (const s of scenarios) for (const t of s.treatments) console.log(`${s.id} [${t.verdict[0]}${t.critical ? '!' : ''}] ${t.action.slice(0, 70)}  =>  /${t.match.slice(0, 40)}/  gates=${t.requires.map((r) => r.any[0]).join('; ')}${t.needsImpression ? '  [IMP]' : ''}`);
