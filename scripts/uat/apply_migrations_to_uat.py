#!/usr/bin/env python3
"""
apply_migrations_to_uat.py — apply all supabase/migrations/*.sql files in order
to a fresh UAT Supabase project via the Management API.

Reads SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF from env. Refuses to run
against production project ID by default.

Usage:
  export SUPABASE_ACCESS_TOKEN="sbp_..."
  export SUPABASE_PROJECT_REF="<UAT-REF>"
  python scripts/uat/apply_migrations_to_uat.py
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

PROD_REF = os.environ.get("PROD_PROJECT_ID", "sfnrpbsdscikpmbhrzub")
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
REF = os.environ.get("SUPABASE_PROJECT_REF", "")

if not TOKEN or not REF:
    print("ERROR: SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF env vars required", file=sys.stderr)
    sys.exit(2)
if REF == PROD_REF:
    print(f"REFUSING to apply migrations to production ({PROD_REF}). Set SUPABASE_PROJECT_REF to the UAT ref.", file=sys.stderr)
    sys.exit(3)

URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "uat-apply/1.0",
}

# Project root migrations dir (resolved relative to this script).
SCRIPT_DIR = Path(__file__).resolve().parent
MIG_DIR = SCRIPT_DIR.parent.parent / "supabase" / "migrations"

if not MIG_DIR.exists():
    print(f"ERROR: migrations dir not found at {MIG_DIR}", file=sys.stderr)
    sys.exit(2)

files = sorted(p for p in MIG_DIR.glob("*.sql"))
print(f"Found {len(files)} migration files. Applying to {REF}...\n")

ok, fail = [], []
for i, p in enumerate(files, 1):
    sql = p.read_text(encoding="utf-8")
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(URL, data=body, headers=HEADERS, method="POST")
    label = f"[{i:>3}/{len(files)}] {p.name}"
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        status = resp.status
        raw = resp.read().decode("utf-8")
        if status >= 400:
            fail.append((p.name, status, raw[:300]))
            print(f"{label}  FAIL {status}: {raw[:200]}")
        else:
            ok.append(p.name)
            print(f"{label}  ok")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        fail.append((p.name, e.code, raw[:300]))
        print(f"{label}  FAIL {e.code}: {raw[:200]}")
    except Exception as e:
        fail.append((p.name, 0, str(e)[:300]))
        print(f"{label}  ERR  {e}")
    time.sleep(0.2)  # gentle pacing

print()
print(f"Applied: {len(ok)}/{len(files)}  Failed: {len(fail)}")
if fail:
    print("\nFailures:")
    for name, code, msg in fail:
        print(f"  {name}  HTTP {code}  {msg[:200]}")
