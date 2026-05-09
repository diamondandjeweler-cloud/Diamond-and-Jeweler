# DNJ Outreach — Go-Live Procedure

End-to-end checklist to start sending emails. ~10 minutes once the templates / leads / settings are loaded.

---

## What you have ready

| File | Purpose |
|---|---|
| `scripts/outreach_engine.gs` | Apps Script engine (paste into your Sheet's Apps Script editor) |
| `company_hiring_scraper/data/leads_for_paste.csv` | **879 deduped leads** ready to paste into your `Leads` tab |
| `company_hiring_scraper/data/all_malaysia_contacts.csv` | Full master (24K+ rows) — backup for later expansion |

Lead breakdown:
- 797 HR (companies)
- 82 University (career services / placement offices)
- Sorted by: Type → Priority → Domain (highest-fit first)
- Already deduped to 1 email per company domain

---

## Steps (do in order)

### 1️⃣ Update the Apps Script (~2 min)

1. Open your Google Sheet → **Extensions → Apps Script**
2. Open `outreach_engine.gs` in the editor (or create it if first time)
3. Replace the entire contents with the file at:
   `C:\Users\DC\Desktop\Diamond and Jeweler\scripts\outreach_engine.gs`
4. Click **Save** (Ctrl+S)

### 2️⃣ Run `applyPilotSettings()` (~30 sec)

In the Apps Script editor:
1. Function dropdown → select **`applyPilotSettings`**
2. Click **Run** (▶)
3. First time only: approve the Google permissions prompt
4. Wait for the green toast on your Sheet:
   > *DNJ: Pilot settings applied. Daily limit: 25. Triggers active.*

This sets:
- Daily Limit: **25** (safe domain warm-up)
- Follow Up 1: 4 days, Follow Up 2: 5 days, Cold: 7 days
- Triggers: `sendOutreach` hourly, `checkReplies` every 30 min, `markCold` daily 3am

### 3️⃣ Run `writeAllTemplates_v2()` (~30 sec)

1. Function dropdown → select **`writeAllTemplates_v2`**
2. Click **Run** (▶)
3. Wait for toast:
   > *DNJ: Templates synced — N updated, M added.*

This writes 10 entries into your `Templates` tab:
HR Subject + 3 emails, University Subject + 3 emails, Auto Reply Call + Email.

### 4️⃣ Paste the leads (~1 min)

1. Open your Sheet → click the **`Leads`** tab
2. Click cell **A2** (row below the header)
3. Open `company_hiring_scraper/data/leads_for_paste.csv` in Excel/Numbers
4. Select **everything except the header row** (A2:J880)
5. **Copy → paste into A2** of the `Leads` tab
   - Or simpler: in Sheets, **File → Import → Upload `leads_for_paste.csv` → "Append to current sheet"**
6. Confirm row count: should be **879 lead rows + 1 header**

### 5️⃣ Pilot test before live ramp (~5 min) — STRONGLY RECOMMENDED

Before letting the engine loose on 879 real targets:

1. In the `Leads` tab, **add 2-3 test rows at the top** (after the header):
   ```
   your-personal-email@gmail.com   | Kean | Test Co A | hr         |  |  |  |  |  |
   your-other-test@yourdomain.com  | Kean | Test Uni  | university |  |  |  |  |  |
   ```
2. Pause the engine: in Apps Script run **`pauseOutreach`**
3. Manually move those test rows above all the real leads (so they get sent first)
4. Resume: run **`resumeOutreach`**
5. Wait for the next hourly `sendOutreach` trigger (or click Run on `sendOutreach` once)
6. Check your test inboxes — verify rendering, formatting, links, unsubscribe footer
7. If anything looks wrong, run `pauseOutreach`, fix templates, re-run `writeAllTemplates_v2`, resume.
8. Once you're happy, the engine continues with the real 879 at 25/day.

---

## After go-live — what to monitor

### Daily (first week)
- **`Leads` tab**: Status column — count `sent1` rows growing as expected (~25/day)
- **`Call List` tab**: any rows here = someone replied with a phone number → call them
- **Apps Script logs**: View → Executions — watch for "Failed → " errors, especially auth/quota errors
- **Your Gmail Sent folder**: confirm emails actually leaving
- **Bounce notices**: if you start seeing 5%+ hard bounces, run `pauseOutreach` and we investigate

### Pause anytime
- Run `pauseOutreach` — engine skips next sends but doesn't lose state. Run `resumeOutreach` to continue.

### Adjusting daily cap
- Open `Settings` tab, change `Daily Limit` to whatever number, save. Engine reads it on next run.
- Recommended ramp: 25/day week 1 → 50/day week 2 → 100/day week 3 → 200+ when warm.

### Stopping the entire campaign
- Run `pauseOutreach` AND delete triggers via Apps Script → Triggers → Delete each.

---

## Emergency stop

If something goes wrong (wrong template sent, mass bounces, complaint):

1. **Apps Script editor** → run `pauseOutreach` (stops sends immediately)
2. **Triggers panel** → delete the `sendOutreach` trigger (paranoid double-stop)
3. Investigate via the Apps Script Executions log
4. Fix → run `writeAllTemplates_v2` if templates need an update
5. Run `resumeOutreach` and re-create triggers via `applyPilotSettings`

---

## What still requires your one-time setup outside this script

1. **PDPA-compliant unsubscribe handling** — ✅ DONE in script.
   `checkReplies()` now detects opt-out language ("unsubscribe", "stop emailing",
   "remove me", "not interested", "opt out", etc.), sets the lead's Status to
   `unsubscribed`, sends a polite confirmation auto-reply, and adds the email
   to a global suppression set so it can never be re-sent — even if the same
   address appears in a future Leads-tab paste.

2. **SPF / DKIM / DMARC** on `diamondandjeweler.com`: if you're sending from `diamondandjeweler@gmail.com` (a `@gmail.com` address), Google handles auth automatically. If later you want to send from `kean@diamondandjeweler.com`, you'll need DNS records — separate setup.

3. **Reply-to mailbox monitoring**: the engine relies on `Session.getActiveUser().getEmail()` (the Apps Script account). Make sure you actually check that mailbox daily, since real replies need human responses.

---

## Numbers you'll have after week 1 (at 25/day)

- ~175 emails sent (25 × 7)
- Expected reply rate: 3-8% → **5-14 replies**
- Of those replies: 30-50% are positive → **2-7 actual hot leads**

Good first week if you bag 3+ "send me your candidates" replies.

---

## Need help?

The cleanest way to recover from any mistake is `pauseOutreach`, fix in the script editor, then resume. The engine is idempotent — re-running won't duplicate sends because the per-row `Status` column is the source of truth.
