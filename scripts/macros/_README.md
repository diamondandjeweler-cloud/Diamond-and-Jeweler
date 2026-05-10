# UI.Vision Macros — DNJ Social Discovery

Each `<platform>_keyword_search.json` is a UI.Vision RPA macro that:

1. Opens the platform's people/account search for a keyword
2. Scrolls N times to load more results
3. Extracts handle / user IDs via DOM heuristics
4. POSTs the collected handles to the DNJ Apps Script web app
   (which deduplicates against existing rows in `Influencers` and `Discovery Queue`)

## Working today (handles ready)

- `ig_keyword_search.json` — Instagram (account: `kensondiamondandjeweler`)
- `x_keyword_search.json` — X / Twitter (account: `@DiamondnJeweler`)
- `tiktok_keyword_search.json` — TikTok (account: logged in, handle TBD)

## Stub macros (login required first, selectors need tuning)

- `rednote_keyword_search.json` — Xiaohongshu / 小红书
- `facebook_keyword_search.json` — Facebook
- `threads_keyword_search.json` — Threads (auth via IG)
- `lemon8_keyword_search.json` — Lemon8

For the stubs: log in once in Chrome, run the macro in DevTools-open mode, copy the actual handle/user-ID URL pattern into the `executeScript_Sandbox` extractor. The shape is the same; only the regex changes.

## Required UI.Vision project variables

Set these once via **Storage Manager** (sidebar → Storage), scope = "Project":

| Var | Value |
|---|---|
| `APPS_SCRIPT_URL` | the deployed Web App URL from Apps Script |
| `API_SECRET` | the secret you set via `setApiSecret(...)` |

## Editing per run

Open the macro, change the top `store` for `keyword` (and optionally `scrollCount`), save, play.

## Selector maintenance

Social platforms rotate their CSS classes constantly. Don't rely on `class=` selectors — every macro here uses `href` patterns or `role` attributes only, which are far more stable. If extraction returns 0 handles after a working run:

1. Open DevTools on the search page
2. Right-click a profile link → **Inspect**
3. Note the new `href` shape — usually still `/{handle}` or `/@{handle}` but may have query params now
4. Update the regex inside the relevant `executeScript_Sandbox` step

## Throttle reminder

Per `social_outreach_setup_guide.md`:

- IG / TikTok: 1 keyword per session, max 2 sessions/day per account
- X: more permissive, 3–5 keywords/day OK
- Stubs (RedNote/FB/Threads/Lemon8): start cautious — 1 keyword/day until baseline is established

The Apps Script side has its own daily DM limits in `Settings`, but the **search-side** throttle is on you — there's no quota baked into the macros themselves.
