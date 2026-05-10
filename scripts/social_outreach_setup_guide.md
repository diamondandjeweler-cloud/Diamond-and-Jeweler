# DNJ Social Outreach Engine — Setup Guide

End-to-end pipeline for discovering influencers across **Instagram, X, TikTok, RedNote, Facebook, Threads, Lemon8** and DM-ing them under the right brand account, all driven by one Google Sheet + Apps Script web app.

The flow:

```
UI.Vision search macro          Claude in Chrome             Sheet "Influencers"
(per platform, per keyword)     (profile reader)             (one row per IG/X/etc account)
        │                              │                              │
        ▼                              ▼                              ▼
 POST add_handles_to_queue   POST get_discovery_queue          DM macro/Claude reads
                             then POST append_influencer       getDMQueue → sends → logs
```

---

## Step 1 — Create the Google Sheet

1. Google Drive → **New** → **Google Sheets**
2. Name it **"DNJ Social Outreach"**
3. Leave the default Sheet1; the script will create the rest.

---

## Step 2 — Paste the Apps Script

1. In your Sheet → **Extensions** → **Apps Script**
2. Delete any default code in `Code.gs`
3. Open `scripts/social_discovery_engine.gs` from this repo, copy ALL of it, paste into the editor
4. **Save** (floppy disk or Ctrl+S). Project name: "DNJ Social Discovery Engine".

---

## Step 3 — One-time setup calls

Still in Apps Script:

1. From the function dropdown pick **`setupSheet`** → **Run**. Authorize when prompted.
   - This creates 5 tabs: `Influencers`, `Discovery Queue`, `Settings`, `Templates`, `Send Log` and seeds default settings.
2. Generate a long random secret (any 24+ char string — `openssl rand -hex 24` or just mash the keyboard).
3. In the editor type a temporary line at the bottom:
   ```js
   function _initSecret() { setApiSecret('PASTE-YOUR-SECRET-HERE'); }
   ```
   Save. Run `_initSecret`. Confirm in Logs: `API_SECRET set. Length: 48`.
   Then delete the `_initSecret` function — secret is now stored in Script Properties, not in code.
4. From the function dropdown pick **`setupTriggers`** → **Run**. This installs the daily 9am report trigger.

---

## Step 4 — Deploy as Web App

1. Top right → **Deploy** → **New deployment**
2. Type: **Web app**
3. Description: "v1"
4. Execute as: **Me (your-email)**
5. Who has access: **Anyone with the link** (UI.Vision and Chrome MCP both call without auth headers, so we rely on the secret in the body)
6. Click **Deploy** → copy the **Web app URL**. It looks like:
   `https://script.google.com/macros/s/AKfycby...../exec`

Save this URL — you'll need it in Step 5 and Step 6. Sanity check by visiting it in a browser; you should see:
```json
{"ok":true,"service":"DNJ Social Discovery Engine","version":1}
```

---

## Step 5 — Configure UI.Vision macros

Each platform has a search macro under `scripts/macros/`:

| File | What it does |
|---|---|
| `ig_keyword_search.json` | Instagram keyword/hashtag search → POST handles to queue |
| `x_keyword_search.json` | X (Twitter) people search → POST handles |
| `tiktok_keyword_search.json` | TikTok user search → POST handles |
| `rednote_keyword_search.json` | RedNote (Xiaohongshu) — **stub, login first** |
| `facebook_keyword_search.json` | Facebook people search — **stub** |
| `threads_keyword_search.json` | Threads search — **stub** |
| `lemon8_keyword_search.json` | Lemon8 search — **stub** |

To use:

1. Open UI.Vision RPA in Chrome. Make sure the matching account is **logged in** in your normal Chrome window:
   - IG: `kensondiamondandjeweler`
   - X: `@DiamondnJeweler`
   - TikTok: (logged in)
2. UI.Vision sidebar → **Storage Manager** → set two project-wide variables:
   - `APPS_SCRIPT_URL` = the web app URL from Step 4
   - `API_SECRET` = the secret you set in Step 3
3. **File** → **Open Macro** → pick e.g. `ig_keyword_search.json`
4. In the macro top, edit the `keyword` variable to your search term (e.g. `malaysia recruitment`, `kl fashion`, `johor food`).
5. **Play Macro**. UI.Vision will:
   - Open the search URL
   - Scroll to load more results
   - Extract handles via DOM selectors
   - POST them to your Apps Script web app via `XHTTP`
   - Log how many were added vs deduplicated

After running you'll see new rows in the **Discovery Queue** tab with `Status = pending`.

**Throttle**: don't run the same macro back-to-back for one account. Spread runs over the day, ~2–3 keywords per session per platform.

---

## Step 6 — Profile reading via Claude in Chrome

The handles in **Discovery Queue** still need their bios, follower counts, etc. read from each profile page. Claude in Chrome MCP does this with judgement (skipping junk profiles, parsing bilingual bios, finding contact emails).

1. Open a normal Chrome where the matching account is logged in.
2. In Claude Code, open the prompt at `scripts/prompts/claude_in_chrome_profile_reader.md`.
3. Edit the `APPS_SCRIPT_URL`, `API_SECRET`, and `PLATFORM` placeholders at the top.
4. Paste the prompt to Claude — it will:
   - Call `get_discovery_queue` to pick up the next batch
   - For each handle: open the profile, extract structured data, POST `append_influencer`
   - Sleep a randomized 30–60s between profiles
   - Stop when the queue is empty or the daily quota is hit

Run it once per platform per session, or schedule via `/loop 30m <prompt>` for autonomous discovery.

---

## Step 7 — Sending DMs (later)

Once `Influencers` has rows with `Status = discovered`, you'll need either:

- **A UI.Vision DM macro per platform** that calls `get_dm_queue` and types DMs into the chat UI, or
- **Claude in Chrome** with a sender prompt that does the same with judgement

DM templates live in the `Templates` tab — one row per `(platform, template_id)` combo. Use `{{firstName}}`, `{{niche}}`, `{{handle}}` merge tags.

This step is **not built yet**; ship discovery first, validate the data, then build the sender.

---

## Day-to-day usage

| Action | How |
|---|---|
| Run discovery for a platform | Open UI.Vision, set keyword, play `<platform>_keyword_search.json` |
| Process pending profiles | Run the Claude in Chrome reader prompt for a platform |
| Pause a platform | `Settings` tab → `Discovery Paused <Platform>` → `true` |
| Adjust follower filter | `Settings` → `Min Followers` / `Max Followers` |
| Adjust daily DM cap | `Settings` → `Daily DM Limit <Platform>` |
| Add new keyword | Just run the macro again with a new keyword |
| Manually mark replied | Edit the row's `Status` to `replied` |
| Drop a junk lead | Edit `Status` to `unqualified` or `ignored` |
| See daily counts | Apps Script → run `dailyReport` (also runs auto at 9am) |

---

## Settings reference

| Setting | Default | Purpose |
|---|---|---|
| Min Followers | 1000 | Anyone below auto-marked `unqualified` |
| Max Followers | 500000 | Anyone above auto-marked `unqualified` (mega-influencers ignore cold DMs) |
| Profile Read Min/Max Delay Seconds | 30 / 60 | Random sleep range between profile visits |
| Discovery Paused IG/X/... | false | Per-platform kill switch |
| Daily DM Limit IG | 50 | IG limits DMs hard; 50 is safe |
| Daily DM Limit X | 100 | X is more permissive |
| Daily DM Limit TikTok | 30 | TikTok DMs are most restricted |
| From Account IG | kensondiamondandjeweler | Display only — must be logged in via Chrome cookies |

---

## Status reference (Influencers tab)

| Status | Meaning |
|---|---|
| `discovered` | Profile read, qualifies, ready for DM |
| `dm_sent` | First DM sent, no reply yet |
| `replied` | They replied — pause sequence, go to manual |
| `ignored` | No reply after 3 DMs — sequence ended |
| `unqualified` | Failed follower / niche filter |

---

## Status reference (Discovery Queue tab)

| Status | Meaning |
|---|---|
| `pending` | Handle from search macro, not yet read |
| `processed` | Profile read, row created in Influencers |
| `failed` | Reader couldn't load (private/banned/404) |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `unauthorized` from web app | Wrong `API_SECRET` in macro variable or prompt |
| `API_SECRET not configured` | Re-run `setApiSecret(...)` in Apps Script editor |
| Macro extracts 0 handles | IG/X DOM changed; open DevTools, update the selector inside the `executeScript_Sandbox` step |
| Web app returns HTML instead of JSON | Re-deploy. Make sure Access = "Anyone with the link" |
| Same handles dedup every run | Working as intended — `addHandlesToQueue` checks both Queue and Influencers tabs |
| Profile reader logs out account | Throttle is too aggressive; raise `Profile Read Min Delay Seconds` to 60+ |
| Triggers stopped firing | Apps Script → Triggers (clock icon) → confirm `dailyReport` exists; if not run `setupTriggers` |

---

## Account assignment

| Platform | Outreach account |
|---|---|
| Instagram | `kensondiamondandjeweler` |
| X (Twitter) | `@DiamondnJeweler` |
| TikTok | (logged-in handle TBD) |
| RedNote | not yet logged in |
| Facebook / Threads / Lemon8 | TBD |

UI.Vision and Claude in Chrome use whatever cookies are present in your Chrome — there is no password storage. Before running discovery or DM macros: **ensure the matching account is the active one in Chrome.**
