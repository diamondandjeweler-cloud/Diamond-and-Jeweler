# DNJ Outreach Engine — Setup Guide

## Step 1: Create the Google Sheet

Go to Google Drive → New → Google Sheets. Name it **"DNJ Outreach"**.

Create 3 tabs (sheets) at the bottom:

---

### Tab 1: "Leads"

Column headers in Row 1 (exact spelling):

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Email | First Name | Company | Status | Emails Sent | Thread ID | Last Sent | Next Send | Notes |

To add leads: paste your Excel data starting from Row 2.
To add more leads later: just paste more rows at the bottom — the script picks them up automatically.

---

### Tab 2: "Templates"

Column A = label, Column B = value. Set it up exactly like this:

| A | B |
|---|---|
| Subject | (your subject line — same for all 3 emails) |
| Email 1 | (your first cold email body) |
| Email 2 | (your first follow-up, sent 4 days later) |
| Email 3 | (your second follow-up, sent 5 days later) |

**Merge tags you can use inside any email body:**
- `{{firstName}}` → replaced with the person's first name
- `{{company}}` → replaced with their company name

**Example Email 1:**
```
Hi {{firstName}},

I came across {{company}} and thought you might be a great fit for DNJ — 
a curated recruitment platform that matches companies with quality talent 
using a unique compatibility approach.

Would you be open to a quick 10-minute chat?

Best,
Kean
Diamond and Jeweler
```

---

### Tab 3: "Settings"

Column A = setting name, Column B = value:

| A | B |
|---|---|
| Daily Limit | 99 |
| Paused | false |
| From Name | Diamond and Jeweler |
| Follow Up 1 Days | 4 |
| Follow Up 2 Days | 5 |
| Cold After Days | 7 |

To **pause** sending: change `Paused` to `true`.  
To **resume**: change it back to `false`.

---

## Step 2: Add the Apps Script Code

1. In your Google Sheet → click **Extensions** → **Apps Script**
2. Delete any existing code in the editor
3. Open the file `outreach_engine.gs` (in this folder)
4. Copy ALL the code and paste it into the Apps Script editor
5. Click **Save** (floppy disk icon or Ctrl+S)

---

## Step 3: Authorize Gmail Access (one time only)

1. In Apps Script, select function `setupTriggers` from the dropdown
2. Click **Run**
3. Google will ask for permission — click **Review permissions**
4. Choose your `diamondandjeweler@gmail.com` account
5. Click **Allow**

This gives the script permission to send email as your Gmail account.

---

## Step 4: Activate (one-time)

Still in Apps Script, run `setupTriggers` (if it didn't run in Step 3 — just click Run again).

You will see in the logs:
```
All triggers active. Engine is running.
```

That's it. The engine now runs automatically:
- Every 1 hour → sends up to 99 emails/day
- Every 30 minutes → checks for replies and marks them
- Every day at 3am → marks no-reply sequences as cold

---

## Day-to-Day Usage

| Action | How |
|---|---|
| Add new leads | Paste rows into the Leads sheet (Status column leave blank or type "new") |
| Pause sending | Change Settings → Paused → `true` |
| Resume sending | Change Settings → Paused → `false` |
| Edit email templates | Edit Templates sheet directly |
| See who replied | Filter Leads sheet by Status = "replied" |
| See who is cold | Filter Leads sheet by Status = "cold" |
| Check logs | Apps Script → Executions (left sidebar) |

---

## Status Reference

| Status | Meaning |
|---|---|
| new (or blank) | Not emailed yet |
| sent1 | Email 1 sent, waiting for follow-up date |
| sent2 | Email 2 sent, waiting for follow-up date |
| sent3 | All 3 emails sent, waiting to see if reply comes |
| replied | Replied — will never receive another email |
| cold | No reply after all 3 emails — sequence ended |
| unsubscribed | Manually marked — excluded forever |

---

## Gmail Sending Limits

Free Gmail (`@gmail.com`): **100 emails/day**  
That is why the Daily Limit in Settings is set to 99 (1 email of headroom).

If you upgrade to Google Workspace: limit increases to 2,000/day.

---

## Troubleshooting

**"Templates sheet not found"** → Make sure the tab is named exactly `Templates` (capital T).

**Emails not sending** → Check Apps Script → Executions for error details.

**Thread ID blank** → Normal for first email. Script searches Sent folder to find it.

**Script stopped working** → Go to Apps Script → Triggers (clock icon) → confirm 3 triggers exist. If not, run `setupTriggers` again.
