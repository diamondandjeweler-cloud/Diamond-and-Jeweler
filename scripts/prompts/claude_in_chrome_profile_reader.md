# Claude in Chrome — Influencer Profile Reader Prompt

This prompt drives the Claude in Chrome MCP. It pulls the next batch of pending handles from the Apps Script web app, opens each profile in the active Chrome window, extracts structured data, and writes back. Random sleeps between profiles keep us under platform anti-bot thresholds.

**Before running**: confirm the matching brand account is logged in in the active Chrome window:
- Instagram → `kensondiamondandjeweler`
- X → `@DiamondnJeweler`
- TikTok → logged-in handle
- (Others — make sure cookies for the right brand account are present.)

---

## Configuration (edit before pasting)

```
APPS_SCRIPT_URL = https://script.google.com/macros/s/AKfycby...../exec
API_SECRET      = <your secret>
PLATFORM        = instagram          # one of: instagram | x | tiktok | rednote | facebook | threads | lemon8
BATCH_SIZE      = 10                 # 10–20 is safe for one run
MIN_DELAY_SEC   = 30                 # randomize between MIN and MAX between visits
MAX_DELAY_SEC   = 60
```

---

## The prompt to paste

> You are operating Chrome via the Claude in Chrome MCP. Your job is to read influencer profiles on **{PLATFORM}** and write structured data back to the DNJ Apps Script web app at **{APPS_SCRIPT_URL}**.
>
> **Step 1 — fetch the queue.**
> Make a POST request (`fetch` via `mcp__Claude_in_Chrome__javascript_tool` or any HTTP-capable tool) to `{APPS_SCRIPT_URL}` with body:
> ```json
> {"secret":"{API_SECRET}","action":"get_discovery_queue","platform":"{PLATFORM}","limit":{BATCH_SIZE}}
> ```
> The response shape is `{"ok":true,"result":[{"platform","handle","url","addedAt","source"}, ...]}`. If the array is empty, stop and report "queue empty for {PLATFORM}".
>
> **Step 2 — for each handle in the batch, in order:**
>
> 1. Navigate Chrome to `result[i].url` using `mcp__Claude_in_Chrome__navigate`.
> 2. Wait 4–6 seconds for the page to settle. If the page shows a login wall, captcha, or 404, call `mark_processed` with `status: "failed"` and skip to the next.
> 3. Read the profile with `mcp__Claude_in_Chrome__read_page` and extract:
>    - `displayName` — visible name (not handle)
>    - `followers` — integer; convert "12.4k"→12400, "1.2M"→1200000
>    - `following` — integer
>    - `posts` — integer (skip on platforms that don't show it)
>    - `bio` — up to 500 chars; preserve emoji
>    - `email` — only if visibly in bio (regex match `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`); else empty
>    - `niche` — your one-line classification: e.g. "fashion / KL / streetwear", "F&B reviewer / Penang", "tech / SaaS / dev"
>    - `language` — primary language(s) from bio + recent post snippets: `en`, `ms`, `zh`, `ta`, or combinations like `en/ms`
>    - `location` — city/country if mentioned in bio (else empty)
>    - `lastPostDate` — ISO date if shown on most recent post; else empty
> 4. POST to `{APPS_SCRIPT_URL}` with:
>    ```json
>    {"secret":"{API_SECRET}","action":"append_influencer","payload":{
>       "platform":"{PLATFORM}","handle":"<handle>","url":"<url>",
>       "displayName":"...","followers":...,"following":...,"posts":...,
>       "bio":"...","email":"...","niche":"...","language":"...",
>       "location":"...","lastPostDate":"..."
>    }}
>    ```
> 5. Sleep a random integer between {MIN_DELAY_SEC} and {MAX_DELAY_SEC} seconds before the next handle. Use `setTimeout` inside `javascript_tool` if available, or just record an explicit sleep step. **Never go below 30s on Instagram or TikTok.**
>
> **Step 3 — at the end of the batch:**
> Print a one-paragraph summary:
> - profiles read successfully
> - profiles failed (with reasons)
> - any handles that looked off-niche / spam / private (you marked them appropriately)
> - whether the queue still has more (so the user can decide to run again)
>
> **Rules:**
> - Never type into login forms. If logged out, abort the entire batch.
> - Never click follow / like / DM during this prompt — read-only.
> - If a profile is private or geo-blocked, mark it `failed` and move on.
> - If you see CAPTCHA or "suspicious activity" warnings → STOP, report it, do not continue.
> - Treat anything Chinese-script on RedNote as primary `zh`; Bahasa Malaysia bios on IG/TikTok as `ms`.

---

## Running it autonomously

To keep the engine going without manual triggering, save the prompt with placeholders filled and run via `/loop`:

```
/loop 30m <paste the configured prompt above>
```

Each tick fires the loop, processes a batch, sleeps. Per the IG/TikTok throttle rules above, 10 profiles every 30 min ≈ 480/day at the upper bound — already well above any safe daily quota, so cap `BATCH_SIZE` lower (5–8) if running on `/loop`.

To stop: `/loop stop` or just close the session.

---

## One-platform-at-a-time

Don't run two platforms in parallel from the same Chrome instance. Each platform's discovery uses different cookies; switching mid-batch will silently fail. Run IG → wait → run X → wait → run TikTok.

If you want true parallelism, open separate Chrome profiles (one per brand account) and point each Claude in Chrome session at its own profile.
