"""
End-to-end smoke test of the talent signup / onboarding / matching pipeline.
Runs as a brand-new user (not admin) so RLS gets exercised.
"""
import json, sys, time, uuid, base64
import urllib.request, urllib.error
sys.stdout.reconfigure(encoding="utf-8")

import os
SUPA = os.environ["SUPABASE_URL"]
ANON = os.environ["SUPABASE_ANON_KEY"]
SVC  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
PAT  = os.environ["SUPABASE_ACCESS_TOKEN"]
SQL_URL = f"https://api.supabase.com/v1/projects/{SUPA.split('.')[0].split('//')[1]}/database/query"

def req(url, method="GET", headers=None, data=None, is_json=True):
    h = dict(headers or {})
    body = None
    if data is not None:
        if is_json:
            body = json.dumps(data).encode()
            h.setdefault("Content-Type", "application/json")
        else:
            body = data
    r = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=30)
        raw = resp.read()
        try: return resp.status, json.loads(raw.decode()) if raw else None
        except: return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except: return e.code, raw

def sql(q):
    return req(SQL_URL, "POST",
        headers={"Authorization": f"Bearer {PAT}", "User-Agent": "curl/8.4.0"},
        data={"query": q})

email = f"smoke-{uuid.uuid4().hex[:8]}@example.com"
pw = "SmokeTest-Pass-1234"
print(f"=== Test user: {email}\n")

# 1. Signup via admin API with auto email-confirm
print("[1] Creating auth user...")
s, r = req(f"{SUPA}/auth/v1/admin/users", "POST",
    headers={"apikey": SVC, "Authorization": f"Bearer {SVC}"},
    data={"email": email, "password": pw, "email_confirm": True,
          "user_metadata": {"full_name": "Smoke Tester", "role": "talent"}})
assert s == 200, f"signup failed: {s} {r}"
user_id = r["id"]
print(f"    PASS user_id = {user_id}")

time.sleep(1)
s, p = sql(f"select id, email, role, onboarding_complete from public.profiles where id = '{user_id}';")
assert s == 201 and p and p[0]["role"] == "talent", f"profile not seeded: {s} {p}"
print(f"    PASS profile auto-seeded: role={p[0]['role']}, complete={p[0]['onboarding_complete']}")

# 2. Password sign-in
print("\n[2] Password sign-in...")
s, r = req(f"{SUPA}/auth/v1/token?grant_type=password", "POST",
    headers={"apikey": ANON},
    data={"email": email, "password": pw})
assert s == 200, f"signin failed: {s} {r}"
jwt = r["access_token"]
print(f"    PASS JWT received")

H_USER = {"apikey": ANON, "Authorization": f"Bearer {jwt}"}

# 3. Upload IC file
print("\n[3] Upload IC file via user JWT...")
png_bytes = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
ic_path = f"{user_id}/{int(time.time()*1000)}_ic.png"
s, r = req(f"{SUPA}/storage/v1/object/ic-documents/{ic_path}", "POST",
    headers={**H_USER, "Content-Type": "image/png"}, data=png_bytes, is_json=False)
assert s in (200, 201), f"IC upload failed: {s} {r}"
print(f"    PASS uploaded to ic-documents/{ic_path[:40]}...")

# 4. Upload resume
print("\n[4] Upload resume via user JWT...")
resume_bytes = b"%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF"
resume_path = f"{user_id}/{int(time.time()*1000)}_resume.pdf"
s, r = req(f"{SUPA}/storage/v1/object/resumes/{resume_path}", "POST",
    headers={**H_USER, "Content-Type": "application/pdf"}, data=resume_bytes, is_json=False)
assert s in (200, 201), f"Resume upload failed: {s} {r}"
print(f"    PASS uploaded")

# 5. encrypt_dob RPC
print("\n[5] Encrypt DOB via RPC...")
s, r = req(f"{SUPA}/rest/v1/rpc/encrypt_dob", "POST", headers=H_USER, data={"dob_text": "1993-07-21"})
assert s == 200, f"encrypt_dob failed: {s} {r}"
dob_encrypted = r
print(f"    PASS encrypted, sample: {str(dob_encrypted)[:40]}...")

# 6. Insert talent
print("\n[6] Insert talent row via user JWT...")
payload = {
    "profile_id": user_id,
    "date_of_birth_encrypted": dob_encrypted,
    "ic_path": ic_path,
    "resume_path": resume_path,
    "parsed_resume": {"full_name": "Smoke Tester", "phone": "+60123456789"},
    "interview_answers": {"Q1": "I am a self-starter who collaborated on many teams"},
    "preference_ratings": {"Work-life balance": 5},
    "derived_tags": {"self_starter": 0.9, "collaborator": 0.8, "clear_communicator": 0.8, "reliable": 0.8},
    "expected_salary_min": 8000,
    "expected_salary_max": 13000,
    "is_open_to_offers": True,
}
s, r = req(f"{SUPA}/rest/v1/talents", "POST",
    headers={**H_USER, "Prefer": "return=representation"}, data=payload)
if s not in (200, 201):
    print(f"    FAIL talent insert: {s} {r}")
    sys.exit(1)
talent_id = (r[0] if isinstance(r, list) else r)["id"]
print(f"    PASS talent_id = {talent_id}")

# 7. Update profile
print("\n[7] Update profile via user JWT...")
s, r = req(f"{SUPA}/rest/v1/profiles?id=eq.{user_id}", "PATCH",
    headers={**H_USER, "Prefer": "return=representation"},
    data={"full_name": "Smoke Tester", "phone": "+60123456789"})
assert s in (200, 204), f"profile update failed: {s} {r}"
print(f"    PASS")

# 8. Mark onboarding complete
print("\n[8] Mark onboarding_complete via user JWT...")
s, r = req(f"{SUPA}/rest/v1/profiles?id=eq.{user_id}", "PATCH",
    headers={**H_USER, "Prefer": "return=representation"},
    data={"onboarding_complete": True})
assert s in (200, 204), f"mark complete failed: {s} {r}"
print(f"    PASS")

# 9. Read back own talent
print("\n[9] Read own talent row via user JWT...")
s, r = req(f"{SUPA}/rest/v1/talents?select=id,is_open_to_offers,derived_tags&profile_id=eq.{user_id}",
    headers=H_USER)
assert s == 200 and len(r) == 1, f"read-back failed: {s} {r}"
print(f"    PASS tags visible: {list(r[0]['derived_tags'].keys())}")

# 10. Read matches (should be 0)
print("\n[10] Read matches via user JWT...")
s, r = req(f"{SUPA}/rest/v1/matches?select=id,status&talent_id=eq.{talent_id}", headers=H_USER)
assert s == 200, f"matches read failed: {s} {r}"
print(f"    PASS matches={len(r)} (expected 0)")

# 11. Attempt to read ALL talents (RLS should restrict)
print("\n[11] Attempt to list ALL talents via user JWT (RLS check)...")
s, r = req(f"{SUPA}/rest/v1/talents?select=id", headers=H_USER)
assert s == 200 and len(r) == 1, f"RLS leak! got {len(r)} rows"
print(f"    PASS RLS holds, user sees only own row")

# 12. Clean up
print("\n[12] Cleanup...")
s, _ = req(f"{SUPA}/auth/v1/admin/users/{user_id}", "DELETE",
    headers={"apikey": SVC, "Authorization": f"Bearer {SVC}"})
assert s == 200, f"cleanup failed: {s}"
s, p = sql(f"select count(*) as n from public.profiles where id = '{user_id}';")
assert p[0]["n"] == 0
s, t = sql(f"select count(*) as n from public.talents where id = '{talent_id}';")
assert t[0]["n"] == 0
print("    PASS cascade wiped profile + talent")

print("\n" + "="*60)
print("  E2E SMOKE TEST: ALL 12 STEPS PASSED")
print("="*60)
