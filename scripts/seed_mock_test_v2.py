"""
DNJ Mock Load Test - Full Seed Script (v2 corrected)
- talents table (not profiles) holds derived_tags, deal_breakers, life_chart etc.
- hiring_managers.id (UUID PK) is what roles.hiring_manager_id references
- life_chart_character uses 'E','W','F','E+','E-','W+','W-','G+','G-'
- matches uses compatibility_score, tag_compatibility, etc.
"""
import sys, uuid, json, random, time, os
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import datetime
RUN_TAG = datetime.datetime.utcnow().strftime("%m%d%H%M")  # unique per run

SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANON_KEY     = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_URL = "https://sfnrpbsdscikpmbhrzub.supabase.co"
AUTH_URL     = f"{SUPABASE_URL}/auth/v1"
REST_URL     = f"{SUPABASE_URL}/rest/v1"
FUNC_URL     = f"{SUPABASE_URL}/functions/v1"
ADMIN_EMAIL  = "diamondandjeweler@gmail.com"
ADMIN_PASS   = "mh3mZOZkqEPr00ooUVVm"

SVC_HDRS = {
    "Content-Type":  "application/json",
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Prefer":        "return=representation",
}

random.seed(42)

# ── Core HTTP ─────────────────────────────────────────────────────────────────

def http(method, url, payload=None, headers=None, timeout=25):
    hdrs = {**SVC_HDRS, **(headers or {})}
    data = json.dumps(payload).encode() if payload is not None else None
    req  = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode()
            return json.loads(body) if body.strip() else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {url[-80:]}: {e.read().decode()[:300]}")

def auth_create_user(email, password="[TEST]Pwd123!", full_name=""):
    try:
        r = http("POST", f"{AUTH_URL}/admin/users", {
            "email": email, "password": password,
            "email_confirm": True, "user_metadata": {"full_name": full_name}
        })
        return r.get("id")
    except RuntimeError as e:
        if "already" in str(e).lower():
            return None  # silently skip duplicates
        print(f"  [!] create_user {email}: {e}")
        return None

def auth_delete_user(uid):
    try:
        http("DELETE", f"{AUTH_URL}/admin/users/{uid}",
             headers={"Prefer": "", "Content-Type": "application/json",
                      "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"})
    except Exception:
        pass

def rest_insert(table, records, label=""):
    if not records:
        return []
    try:
        r = http("POST", f"{REST_URL}/{table}", records)
        lst = r if isinstance(r, list) else [r]
        print(f"  [+] {label or table}: {len(lst)} rows")
        return lst
    except RuntimeError as e:
        print(f"  [!] INSERT {label or table}: {e}")
        return []

def rest_patch_bulk(table, uid_list, updates, label=""):
    if not uid_list:
        return
    filter_val = "(" + ",".join(uid_list) + ")"
    try:
        http("PATCH", f"{REST_URL}/{table}?id=in.{filter_val}", updates,
             headers={"Prefer": "return=minimal"})
        print(f"  [+] PATCH {label or table}: {len(uid_list)} rows")
    except RuntimeError as e:
        print(f"  [!] PATCH {label or table}: {e}")

def rest_delete(table, filter_str):
    try:
        http("DELETE", f"{REST_URL}/{table}?{filter_str}",
             headers={"Prefer": "return=minimal"})
        print(f"  [-] DELETE {table} where {filter_str}")
    except RuntimeError as e:
        print(f"  [!] DELETE {table}: {e}")

def get_admin_jwt():
    try:
        r = http("POST", f"{AUTH_URL}/token?grant_type=password",
                 {"email": ADMIN_EMAIL, "password": ADMIN_PASS},
                 headers={"Content-Type": "application/json", "apikey": SERVICE_KEY})
        tok = r.get("access_token")
        if tok:
            print(f"  [+] admin JWT obtained ({tok[:20]}...)")
        return tok
    except RuntimeError as e:
        print(f"  [!] admin sign-in: {e}")
        return None

def call_match_generate(role_id, jwt):
    try:
        r = http("POST", f"{FUNC_URL}/match-generate",
                 {"role_id": role_id},
                 headers={"Authorization": f"Bearer {jwt}",
                          "apikey": SERVICE_KEY,
                          "Prefer": ""},
                 timeout=45)
        return r
    except RuntimeError as e:
        return {"error": str(e)[-120:]}

# ── Data definitions ──────────────────────────────────────────────────────────

INDUSTRIES = [
  ("Technology",    ["python","javascript","react","nodejs","aws","docker","sql","machine_learning","typescript","agile","devops","kubernetes"]),
  ("Finance",       ["financial_modeling","excel","accounting","audit","risk_management","valuation","taxation","compliance","bloomberg","cfa","ifrs","treasury"]),
  ("Healthcare",    ["clinical_research","patient_care","nursing","medical_coding","pharmacology","ehr_systems","health_safety","triage","anatomy","hipaa","wound_care","infection_control"]),
  ("Logistics",     ["supply_chain","warehouse_management","sap","customs","inventory_control","fleet_management","erp","procurement","forklift","route_planning","cold_chain","3pl"]),
  ("Hospitality",   ["hotel_management","customer_service","food_safety","pos_systems","event_management","housekeeping","revenue_management","front_desk","upselling","complaint_resolution","fidelio","night_audit"]),
  ("Retail",        ["merchandising","pos_systems","inventory_control","customer_service","visual_merchandising","sales","planogram","shrinkage_control","store_operations","vendor_negotiation","retail_math","stock_replenishment"]),
  ("Manufacturing", ["lean_manufacturing","quality_control","autocad","cnc_machining","iso_certification","six_sigma","production_planning","maintenance","welding","process_improvement","5s","kaizen"]),
  ("Legal",         ["contract_drafting","litigation","corporate_law","intellectual_property","compliance","legal_research","arbitration","conveyancing","employment_law","company_secretarial","mergers_acquisitions","court_submissions"]),
  ("Education",     ["curriculum_design","classroom_management","e_learning","assessment_design","student_counseling","lesson_planning","stem","parent_engagement","learning_management","differentiated_instruction","pastoral_care","school_administration"]),
  ("Media",         ["content_creation","social_media","video_editing","copywriting","seo","adobe_suite","journalism","photography","pr","brand_storytelling","analytics","influencer_management"]),
  ("Construction",  ["project_management","autocad","quantity_surveying","bim","site_safety","civil_engineering","structural_design","cost_estimation","ms_project","concrete_works","earthworks","material_procurement"]),
  ("FnB",           ["food_safety","kitchen_management","menu_planning","pos_systems","customer_service","barista","pastry","culinary_arts","stock_control","haccp","dietary_nutrition","catering"]),
  ("RealEstate",    ["property_valuation","negotiation","property_law","market_analysis","crm","customer_service","subsales","project_marketing","rental_management","due_diligence","uhnwi_clients","en_bloc"]),
  ("HR",            ["recruitment","talent_acquisition","hris","payroll","performance_management","onboarding","employee_relations","job_grading","training_development","succession_planning","hr_analytics","employer_branding"]),
  ("Insurance",     ["underwriting","claims_processing","actuarial","risk_assessment","customer_service","regulatory_compliance","life_insurance","motor_insurance","reinsurance","policy_administration","loss_adjusting","bancassurance"]),
  ("Automotive",    ["mechanical_engineering","autocad","quality_control","lean_manufacturing","diagnostics","vehicle_inspection","aftersales","spare_parts","service_advisor","warranty_claims","paint_and_body","workshop_management"]),
  ("Agriculture",   ["crop_management","irrigation","agronomy","gis_mapping","sustainable_farming","pest_control","soil_science","precision_agriculture","palm_oil","yield_analysis","plantation_management","fertilizer_application"]),
  ("Fashion",       ["fashion_design","trend_forecasting","textile_knowledge","adobe_illustrator","visual_merchandising","product_development","sourcing","pattern_making","retail_buying","brand_management","garment_construction","colour_theory"]),
  ("Gaming",        ["unity","unreal_engine","c_sharp","game_design","3d_modeling","level_design","qa_testing","game_monetization","ui_ux","player_engagement","shader_programming","narrative_design"]),
  ("Biotech",       ["molecular_biology","pcr","bioinformatics","cell_culture","regulatory_affairs","clinical_trials","protein_analysis","gmp","laboratory_management","r_and_d","mass_spectrometry","genomics"]),
  ("Telecom",       ["network_engineering","cisco","5g","fiber_optics","noc_operations","rf_engineering","voip","bss_oss","roaming","spectrum_management","optical_transport","ip_routing"]),
  ("Architecture",  ["autocad","revit","bim","urban_planning","project_management","architectural_design","sketchup","space_planning","interior_design","planning_permission","landscape_architecture","facade_design"]),
  ("Energy",        ["solar_energy","electrical_engineering","grid_management","autocad","project_management","renewables","power_systems","hvac","energy_audit","commissioning","substation","tnb_standards"]),
  ("Tourism",       ["tour_guiding","destination_knowledge","customer_service","booking_systems","event_planning","itinerary_design","travel_insurance","visa_processing","group_handling","upselling","fam_trips","destination_marketing"]),
  ("Aviation",      ["flight_operations","air_traffic_management","aircraft_maintenance","safety_management","regulatory_compliance","ground_handling","cabin_crew","load_control","aviation_security","passenger_services","cargo_operations","apron_management"]),
  ("Security",      ["surveillance","access_control","risk_assessment","physical_security","cybersecurity","incident_response","cctv","patrol","crowd_control","emergency_response","guard_management","fire_safety"]),
  ("Publishing",    ["editorial","content_creation","adobe_suite","seo","proofreading","digital_publishing","layout_design","fact_checking","rights_licensing","audience_development","ebook_production","magazine_management"]),
  ("Shipping",      ["logistics","customs_clearance","freight_forwarding","sap","import_export","port_operations","bill_of_lading","incoterms","cargo_handling","vessel_scheduling","dangerous_goods","trade_compliance"]),
  ("NonProfit",     ["fundraising","grant_writing","community_outreach","program_management","volunteer_management","impact_reporting","stakeholder_engagement","donor_relations","advocacy","monitoring_evaluation","capacity_building","social_enterprise"]),
  ("Government",    ["policy_analysis","public_administration","regulatory_compliance","stakeholder_management","report_writing","budgeting","procurement","egovernment","parliamentary_procedures","public_consultation","performance_management","audit_compliance"]),
]

BEHAVIORAL = ["ownership","communication_clarity","emotional_maturity","problem_solving","resilience",
              "results_orientation","professional_attitude","confidence","coachability"]
CULTURE    = ["wants_wlb","wants_fair_pay","wants_growth","wants_stability",
              "wants_flexibility","wants_recognition","wants_mission","wants_team_culture"]
LIFE_CHARS_VALID = ["E","W","F","E+","E-","W+","W-","G+","G-"]
POSTCODES  = ["50450","50400","55100","50480","46050","47500","80000","81300","10050","11700","30000","30450"]

SALARY_BASE = {
    "Technology":3000,"Finance":4000,"Healthcare":2800,"Logistics":2200,
    "Hospitality":1800,"Retail":1800,"Manufacturing":2500,"Legal":3500,
    "Education":2200,"Media":2500,"Construction":2800,"FnB":1600,
    "RealEstate":2500,"HR":2500,"Insurance":2800,"Automotive":2200,
    "Agriculture":2000,"Fashion":2200,"Gaming":3000,"Biotech":3200,
    "Telecom":3000,"Architecture":2800,"Energy":3200,"Tourism":1800,
    "Aviation":3500,"Security":1800,"Publishing":2200,"Shipping":2500,
    "NonProfit":2200,"Government":2500
}

CULTURE_PRESETS = [
    {"wants_wlb":0.6,"wants_fair_pay":0.7,"wants_growth":0.9,"wants_stability":0.5,
     "wants_flexibility":0.6,"wants_recognition":0.8,"wants_mission":0.6,"wants_team_culture":0.7},
    {"wants_wlb":0.8,"wants_fair_pay":0.8,"wants_growth":0.5,"wants_stability":0.9,
     "wants_flexibility":0.5,"wants_recognition":0.6,"wants_mission":0.5,"wants_team_culture":0.7},
    {"wants_wlb":0.7,"wants_fair_pay":0.6,"wants_growth":0.7,"wants_stability":0.6,
     "wants_flexibility":0.7,"wants_recognition":0.6,"wants_mission":0.9,"wants_team_culture":0.8},
    {"wants_wlb":0.7,"wants_fair_pay":0.7,"wants_growth":0.7,"wants_stability":0.7,
     "wants_flexibility":0.7,"wants_recognition":0.7,"wants_mission":0.7,"wants_team_culture":0.7},
]

# ══════════════════════════════════════════════════════════════════════════════
print("=" * 60)
print("DNJ Mock Load Test Seed v2")
print("=" * 60)

# ── Pre-flight: clean up any leftover test data ───────────────────────────────
print("\n[0] Pre-flight cleanup of any leftover test data...")
rest_delete("roles",    "title=like.[TEST]%")
rest_delete("companies","name=like.[TEST]%")

# Paginated listing for test auth users
_leftover_ids = []
for _pg in range(1, 30):
    try:
        _pg_data = http("GET", f"{AUTH_URL}/admin/users?page={_pg}&per_page=50")
        _users   = _pg_data.get("users", []) if isinstance(_pg_data, dict) else (_pg_data if isinstance(_pg_data, list) else [])
        _found   = [u["id"] for u in _users if u.get("email", "").endswith("@dnjtest.mock")]
        _leftover_ids.extend(_found)
        if len(_users) < 50:
            break
    except RuntimeError:
        break
if _leftover_ids:
    with ThreadPoolExecutor(max_workers=20) as _ex:
        list(_ex.map(auth_delete_user, _leftover_ids))
    print(f"  [-] Deleted {len(_leftover_ids)} leftover test users")
else:
    print("  [=] No leftover test users found")

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1 & 2: Create auth users (parallel)
# ══════════════════════════════════════════════════════════════════════════════
print("\n[1] Creating 60 HM auth users...")

hm_emails = []
for i in range(60):
    ind_name = INDUSTRIES[i // 2][0]
    hm_emails.append((f"hm{i:03d}@dnjtest.mock", f"[TEST] HM {ind_name} {i%2+1}"))

def _mk_user(spec):
    email, name = spec
    uid = auth_create_user(email, full_name=name)
    return email, uid

hm_uid_map = {}
with ThreadPoolExecutor(max_workers=15) as ex:
    for email, uid in ex.map(_mk_user, hm_emails):
        if uid:
            hm_uid_map[email] = uid

hm_uids = [hm_uid_map.get(spec[0]) for spec in hm_emails]
print(f"  -> {sum(1 for u in hm_uids if u)}/60 HM users created")

print("\n[2] Creating 240 talent auth users...")

tal_emails = [(f"talent{i:03d}@dnjtest.mock", f"[TEST] Talent {i+1}") for i in range(240)]

tal_uid_map = {}
with ThreadPoolExecutor(max_workers=15) as ex:
    for email, uid in ex.map(_mk_user, tal_emails):
        if uid:
            tal_uid_map[email] = uid

tal_uids = [tal_uid_map.get(spec[0]) for spec in tal_emails]
print(f"  -> {sum(1 for u in tal_uids if u)}/240 talent users created")

print("  Waiting 4s for profile triggers...")
time.sleep(4)

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3: Update profiles (role + onboarding_complete only)
# ══════════════════════════════════════════════════════════════════════════════
print("\n[3] Setting profile roles & onboarding flags...")

valid_hm_uids  = [u for u in hm_uids  if u]
valid_tal_uids = [u for u in tal_uids if u]

rest_patch_bulk("profiles", valid_hm_uids,
                {"role": "hiring_manager", "onboarding_complete": True},
                "HM profiles -> hiring_manager")
rest_patch_bulk("profiles", valid_tal_uids,
                {"role": "talent", "onboarding_complete": True},
                "Talent profiles -> onboarding_complete")

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 4: Insert 30 companies
# ══════════════════════════════════════════════════════════════════════════════
print("\n[4] Inserting 30 companies...")

company_rows = []
company_id_list = []  # index = industry index

for i in range(30):
    ind_name, _ = INDUSTRIES[i]
    hm_uid = hm_uids[i * 2]
    if not hm_uid:
        company_id_list.append(None)
        continue
    cid = str(uuid.uuid4())
    company_id_list.append(cid)
    company_rows.append({
        "id":                  cid,
        "name":                f"[TEST] {ind_name} Sdn Bhd",
        "registration_number": f"TEST-{RUN_TAG}-{i+1:04d}",
        "primary_hr_email":    hm_emails[i * 2][0],
        "created_by":          hm_uid,
        "size":                "51-200",
        "industry":            ind_name,
        "verified":            False,
    })

rest_insert("companies", company_rows, "companies")

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 5: Insert 60 hiring_managers — capture returned .id for roles
# ══════════════════════════════════════════════════════════════════════════════
print("\n[5] Inserting 60 hiring_managers records...")

hm_records = []
for i, uid in enumerate(hm_uids):
    if not uid:
        continue
    ind_idx = i // 2
    cid = company_id_list[ind_idx] if ind_idx < len(company_id_list) else None
    if not cid:
        continue
    ind_name, _ = INDUSTRIES[ind_idx]
    offers = CULTURE_PRESETS[i % 4]
    hm_char = LIFE_CHARS_VALID[i % len(LIFE_CHARS_VALID)]
    hm_records.append({
        "profile_id":           uid,
        "company_id":           cid,
        "job_title":            f"[TEST] {ind_name} Manager",
        "life_chart_character": hm_char,
        "culture_offers":       offers,
        "industry":             ind_name,
    })

inserted_hms = rest_insert("hiring_managers", hm_records, "hiring_managers")

# Build profile_id → hiring_manager.id map
profile_to_hm_id = {}
for row in inserted_hms:
    pid = row.get("profile_id")
    hid = row.get("id")
    if pid and hid:
        profile_to_hm_id[pid] = hid

# Also build ind_idx → hm_record_id (for role assignment)
# Each industry i: HM at hm_uids[i*2] is the primary HM
ind_to_hm_id = {}
for i in range(30):
    uid = hm_uids[i * 2] if (i * 2) < len(hm_uids) else None
    if uid and uid in profile_to_hm_id:
        ind_to_hm_id[i] = profile_to_hm_id[uid]

print(f"  -> {len(profile_to_hm_id)}/60 HM UUIDs captured for role linking")

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 6: Insert 50 roles
# ══════════════════════════════════════════════════════════════════════════════
print("\n[6] Inserting 50 roles...")

role_records = []
role_meta    = []  # (role_id, ind_idx, required_traits, scenario, sal_min, sal_max)

role_counter = 0
for ind_idx in range(30):
    n_roles   = 2 if ind_idx < 20 else 1
    ind_name, ind_tags = INDUSTRIES[ind_idx]
    hm_record_id = ind_to_hm_id.get(ind_idx)
    if not hm_record_id:
        continue

    for r_num in range(n_roles):
        scenario = role_counter % 5   # 0=normal 1=narrow_salary 2=needs_license 3=weekend 4=commission
        n_traits = random.randint(6, 8)
        required_traits = random.sample(ind_tags, min(n_traits, len(ind_tags)))

        base    = SALARY_BASE.get(ind_name, 2500)
        sal_min = base + 1000 * r_num
        sal_max = sal_min + (500 if scenario == 1 else 2000)

        role_id   = str(uuid.uuid4())
        work_arr  = random.choice(["onsite", "hybrid", "remote"])
        exp_level = random.choice(["junior", "mid", "senior"])
        postcode  = random.choice(POSTCODES)

        role_records.append({
            "id":                       role_id,
            "hiring_manager_id":        hm_record_id,
            "title":                    f"[TEST] {ind_name} Role {r_num+1}",
            "status":                   "active",
            "work_arrangement":         work_arr,
            "experience_level":         exp_level,
            "salary_min":               sal_min,
            "salary_max":               sal_max,
            "required_traits":          required_traits,
            "location_postcode":        postcode,
            "requires_weekend":         (scenario == 3),
            "requires_driving_license": (scenario == 2),
            "is_commission_based":      (scenario == 4),
            "has_night_shifts":         False,
            "requires_travel":          False,
            "requires_own_car":         False,
            "requires_relocation":      False,
            "requires_overtime":        False,
        })
        role_meta.append((role_id, ind_idx, required_traits, scenario, sal_min, sal_max))
        role_counter += 1

# Insert in batches of 10 (some columns might not exist — catch per-batch)
inserted_role_ids = set()
for b in range(0, len(role_records), 10):
    batch = role_records[b:b+10]
    ok = rest_insert("roles", batch, f"roles batch {b//10+1}")
    for row in ok:
        rid = row.get("id")
        if rid:
            inserted_role_ids.add(rid)

# Filter role_meta to only successfully inserted roles
role_meta = [m for m in role_meta if m[0] in inserted_role_ids]
print(f"  -> {len(role_meta)}/{role_counter} roles confirmed in DB")

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 7: Seed 240 talent records in the `talents` table
# ══════════════════════════════════════════════════════════════════════════════
print("\n[7] Seeding 240 talent records...")

n_real_roles = len(role_meta)
if n_real_roles == 0:
    print("  [!] No roles were inserted — aborting talent seeding")
    sys.exit(1)

talent_records = []   # rows for INSERT into talents
talent_profile_ids = []  # to map talent.id after insert

for i, uid in enumerate(tal_uids):
    if not uid:
        continue

    group    = min(4, i // 48)       # 5 groups of ~48
    role_idx = i % n_real_roles
    rid, ind_idx, required_traits, scenario, role_sal_min, role_sal_max = role_meta[role_idx]
    ind_name, ind_tags = INDUSTRIES[ind_idx]
    base_sal = SALARY_BASE.get(ind_name, 2500)

    wrong_idx  = (ind_idx + 15) % 30
    wrong_tags = list(INDUSTRIES[wrong_idx][1])

    # Build derived_tags per archetype
    if group == 0:  # A: Strong match
        tags = {t: round(random.uniform(0.75, 0.99), 2) for t in required_traits}
        extras = [t for t in ind_tags if t not in required_traits]
        for t in random.sample(extras, min(3, len(extras))):
            tags[t] = round(random.uniform(0.5, 0.8), 2)
        for t in random.sample(BEHAVIORAL, 5):
            tags[t] = round(random.uniform(0.65, 0.9), 2)
        for t in random.sample(CULTURE, 4):
            tags[t] = round(random.uniform(0.6, 0.9), 2)
        sal_min     = base_sal + random.randint(0, 500)
        sal_max     = sal_min + 2500
        deal_brk    = {}
        life_char   = random.choice(["E", "E+", "W"])
        job_areas   = [ind_name]
        has_license = True

    elif group == 1:  # B: Good tags, salary too high
        hit_count = max(1, int(len(required_traits) * 0.70))
        tags = {t: round(random.uniform(0.65, 0.90), 2)
                for t in random.sample(required_traits, hit_count)}
        for t in random.sample(BEHAVIORAL, 3):
            tags[t] = round(random.uniform(0.5, 0.8), 2)
        sal_min     = role_sal_max + 1500 + random.randint(0, 1000)
        sal_max     = sal_min + 2000
        deal_brk    = {}
        life_char   = random.choice(["E", "W", "F"])
        job_areas   = [ind_name]
        has_license = True

    elif group == 2:  # C: Weak match, 30-50% tags
        hit_count = max(1, int(len(required_traits) * 0.40))
        tags = {t: round(random.uniform(0.30, 0.60), 2)
                for t in random.sample(required_traits, hit_count)}
        adj_tags = list(INDUSTRIES[(ind_idx + 1) % 30][1])
        for t in random.sample(adj_tags, min(3, len(adj_tags))):
            tags[t] = round(random.uniform(0.35, 0.65), 2)
        for t in random.sample(BEHAVIORAL, 2):
            tags[t] = round(random.uniform(0.3, 0.55), 2)
        sal_min     = base_sal + random.randint(-200, 800)
        sal_max     = sal_min + 2000
        deal_brk    = {}
        life_char   = random.choice(["W", "F", "G-"])
        job_areas   = [INDUSTRIES[(ind_idx + 1) % 30][0]]
        has_license = bool(random.randint(0, 1))

    elif group == 3:  # D: Deal-breaker traps — strong tags but blocked
        tags = {t: round(random.uniform(0.72, 0.95), 2) for t in required_traits}
        for t in random.sample(BEHAVIORAL, 4):
            tags[t] = round(random.uniform(0.65, 0.9), 2)
        sal_min   = base_sal + random.randint(0, 500)
        sal_max   = sal_min + 2500
        life_char = random.choice(["E", "W", "E+"])
        job_areas = [ind_name]
        sub_group = i % 4
        if sub_group == 0:
            deal_brk    = {"no_driving_license": True}
            has_license = False
        elif sub_group == 1:
            deal_brk    = {"no_weekend_work": True}
            has_license = True
        elif sub_group == 2:
            deal_brk    = {"no_commission_only": True}
            has_license = True
        else:
            deal_brk    = {"min_salary_hard": role_sal_max + 3000}
            has_license = True

    else:  # E: Wrong field
        tags = {t: round(random.uniform(0.55, 0.90), 2)
                for t in random.sample(wrong_tags, min(7, len(wrong_tags)))}
        for t in random.sample(BEHAVIORAL, 2):
            tags[t] = round(random.uniform(0.35, 0.65), 2)
        sal_min     = base_sal + random.randint(-300, 500)
        sal_max     = sal_min + 2000
        deal_brk    = {}
        life_char   = random.choice(["W-", "G-", "F"])
        job_areas   = [INDUSTRIES[wrong_idx][0]]
        has_license = bool(random.randint(0, 1))

    age         = random.randint(22, 52)
    exp_years   = max(0, age - 22 - random.randint(0, 4))
    emp_prefs   = random.choice([["full_time"], ["full_time", "contract"], ["contract"]])
    postcode    = random.choice(POSTCODES)

    talent_records.append({
        "profile_id":                uid,
        "derived_tags":              tags,
        "deal_breakers":             deal_brk,
        "life_chart_character":      life_char,
        "expected_salary_min":       sal_min,
        "expected_salary_max":       sal_max,
        "employment_type_preferences": emp_prefs,
        "location_postcode":         postcode,
        "location_matters":          False,
        "parsed_resume":             {"job_areas": job_areas, "experience_years": exp_years},
        "is_open_to_offers":         True,
        "privacy_mode":              "public",
        "has_driving_license":       has_license,
        "open_to_new_field":         (group in [1, 2]),
    })

# Batch insert talents 50 at a time
inserted_talents = []
for b in range(0, len(talent_records), 50):
    batch = talent_records[b:b+50]
    rows  = rest_insert("talents", batch, f"talents batch {b//50+1}")
    inserted_talents.extend(rows)

print(f"  -> {len(inserted_talents)}/{len(talent_records)} talent records inserted")

# Map profile_id -> talent.id (the UUID PK needed for matches cleanup)
profile_to_talent_id = {r["profile_id"]: r["id"] for r in inserted_talents if "profile_id" in r and "id" in r}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 8: Get admin JWT, call match-generate for all roles
# ══════════════════════════════════════════════════════════════════════════════
print("\n[8] Calling match-generate for all roles...")

admin_jwt = get_admin_jwt()
match_results = {}
failed_roles  = []

if not admin_jwt:
    print("  [!] No admin JWT — skipping match-generate")
else:
    for role_id, ind_idx, traits, scenario, sal_min, sal_max in role_meta:
        r = call_match_generate(role_id, admin_jwt)
        if "error" in r:
            failed_roles.append((role_id, ind_idx, r["error"]))
        else:
            match_results[role_id] = r
        time.sleep(0.15)

    print(f"  -> {len(match_results)} succeeded, {len(failed_roles)} failed")
    if failed_roles:
        for rid, iidx, err in failed_roles[:3]:
            print(f"     [{INDUSTRIES[iidx][0]}] {rid[:8]}: {err[:80]}")

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 9: Query matches & build report
# ══════════════════════════════════════════════════════════════════════════════
print("\n[9] Analysing match results...")

all_matches = []
for b in range(0, len(role_meta), 10):
    batch_ids = [m[0] for m in role_meta[b:b+10]]
    filter_   = "role_id=in.(" + ",".join(batch_ids) + ")"
    try:
        rows = http("GET",
            f"{REST_URL}/matches?{filter_}&select=role_id,talent_id,compatibility_score,tag_compatibility,status&limit=1000",
            headers={"Prefer": ""})
        if isinstance(rows, list):
            all_matches.extend(rows)
    except RuntimeError as e:
        print(f"  [!] fetch matches: {e}")

print(f"  -> {len(all_matches)} total match rows fetched")

# ── Build report ──────────────────────────────────────────────────────────────

# talent.id -> group (0-4)
talent_id_to_group = {}
for i, uid in enumerate(tal_uids):
    if uid and uid in profile_to_talent_id:
        talent_id_to_group[profile_to_talent_id[uid]] = min(4, i // 48)

# role_id -> match rows
role_match_map = {}
for m in all_matches:
    rid = m.get("role_id")
    if rid:
        role_match_map.setdefault(rid, []).append(m)

SCENARIO_NAMES = ["Normal", "NarrowSalary", "NeedsLicense", "NeedsWeekend", "Commission"]
GROUP_LABELS   = ["A-Strong", "B-Salary", "C-Weak", "D-DealBrk", "E-Wrong"]

scenario_stats = {s: {"roles": 0, "matches": 0, "scores": []} for s in range(5)}
group_scores   = {g: [] for g in range(5)}
group_counts   = {g: 0 for g in range(5)}

role_lines = []
for rid, ind_idx, traits, scenario, sal_min, sal_max in role_meta:
    ind_name = INDUSTRIES[ind_idx][0]
    ms       = role_match_map.get(rid, [])
    scores   = [float(m.get("compatibility_score") or 0) for m in ms]
    avg      = sum(scores) / len(scores) if scores else 0
    top      = max(scores) if scores else 0

    g_cnt = {g: 0 for g in range(5)}
    for m in ms:
        tid = m.get("talent_id")
        g   = talent_id_to_group.get(tid, -1)
        sc  = float(m.get("compatibility_score") or 0)
        if g >= 0:
            g_cnt[g] += 1
            group_scores[g].append(sc)
            group_counts[g] += 1

    ss = scenario_stats[scenario]
    ss["roles"]   += 1
    ss["matches"] += len(ms)
    ss["scores"].extend(scores)

    role_lines.append(
        f"  [{ind_name:14s}][{SCENARIO_NAMES[scenario]:13s}] "
        f"{len(ms):3d} matches | avg {avg:5.1f} | top {top:5.1f} | "
        + " ".join(f"{GROUP_LABELS[g][0]}={g_cnt[g]}" for g in range(5))
    )

print("\n" + "=" * 60)
print("MOCK LOAD TEST REPORT")
print("=" * 60)

print(f"\n--- Entities Seeded ---")
print(f"  Companies      : {len([c for c in company_id_list if c])}/30")
print(f"  HM users       : {sum(1 for u in hm_uids if u)}/60")
print(f"  HM records     : {len(profile_to_hm_id)}/60")
print(f"  Roles (active) : {len(role_meta)}/50")
print(f"  Talent users   : {sum(1 for u in tal_uids if u)}/240")
print(f"  Talent records : {len(inserted_talents)}/240")
print(f"  Total matches  : {len(all_matches)}")

print(f"\n--- Per-Scenario Results ---")
print(f"  {'Scenario':<15} {'Roles':>5} {'Matches':>8} {'AvgScore':>9}")
for s, name in enumerate(SCENARIO_NAMES):
    ss  = scenario_stats[s]
    avg = sum(ss["scores"]) / len(ss["scores"]) if ss["scores"] else 0
    print(f"  {name:<15} {ss['roles']:>5} {ss['matches']:>8} {avg:>9.1f}")

print(f"\n--- Match Score by Talent Group ---")
print(f"  {'Group':<14} {'Matches':>8} {'AvgScore':>9} {'Description'}")
grp_descs = [
    "Should score highest (full tag overlap)",
    "Good tags but salary too high — may be salary-filtered",
    "Partial tags, lower scores expected",
    "Strong tags but deal-breaker should block",
    "Wrong industry — near-zero tag scores",
]
for g in range(5):
    avg = sum(group_scores[g]) / len(group_scores[g]) if group_scores[g] else 0
    print(f"  {GROUP_LABELS[g]:<14} {group_counts[g]:>8} {avg:>9.1f}  {grp_descs[g]}")

print(f"\n--- Per-Role Breakdown ---")
for line in role_lines:
    print(line)

# Verification checks
print(f"\n--- Verification Checks ---")
avg_a = sum(group_scores[0]) / len(group_scores[0]) if group_scores[0] else 0
avg_c = sum(group_scores[2]) / len(group_scores[2]) if group_scores[2] else 0
avg_e = sum(group_scores[4]) / len(group_scores[4]) if group_scores[4] else 0
avg_d = sum(group_scores[3]) / len(group_scores[3]) if group_scores[3] else 0

checks = [
    (avg_a > avg_c, f"Group A avg ({avg_a:.1f}) > Group C avg ({avg_c:.1f}) — strong beats weak"),
    (avg_a > avg_e, f"Group A avg ({avg_a:.1f}) > Group E avg ({avg_e:.1f}) — right field beats wrong"),
    (avg_e < 30,    f"Group E avg ({avg_e:.1f}) < 30 — wrong-industry near-zero"),
]

# Deal-breaker filter checks
license_role_ids  = {m[0] for m in role_meta if m[3] == 2}
weekend_role_ids  = {m[0] for m in role_meta if m[3] == 3}
commssn_role_ids  = {m[0] for m in role_meta if m[3] == 4}

def grp_d_in_roles(role_id_set, sub_grp_tag):
    return sum(1 for m in all_matches
               if m["role_id"] in role_id_set
               and talent_id_to_group.get(m["talent_id"]) == 3)

d_in_license = grp_d_in_roles(license_role_ids, "license")
d_in_weekend = grp_d_in_roles(weekend_role_ids, "weekend")
d_in_commssn = grp_d_in_roles(commssn_role_ids, "commission")

checks += [
    (d_in_license == 0, f"No-license talents excluded from license roles: {d_in_license} found"),
    (d_in_weekend == 0, f"No-weekend talents excluded from weekend roles: {d_in_weekend} found"),
    (d_in_commssn == 0, f"No-commission talents excluded from commission roles: {d_in_commssn} found"),
]

all_pass = True
for ok, msg in checks:
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {msg}")
    if not ok:
        all_pass = False

print(f"\n  Overall: {'ALL CHECKS PASSED' if all_pass else 'SOME CHECKS FAILED — see above'}")

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 10: Flush all test data
# ══════════════════════════════════════════════════════════════════════════════
print("\n\n[10] Flushing all test data...")

# matches are cascade-deleted when roles are deleted
rest_delete("roles",            "title=like.[TEST]%")
rest_delete("talents",          "parsed_resume->>job_areas=neq.[]")  # fallback filter

# Delete by profile_id list for talents
tal_pf_filter = "profile_id=in.(" + ",".join(valid_tal_uids) + ")"
if valid_tal_uids:
    rest_delete("talents", tal_pf_filter)

# Delete hiring_managers by profile_id
hm_pf_filter = "profile_id=in.(" + ",".join(valid_hm_uids) + ")"
if valid_hm_uids:
    rest_delete("hiring_managers", hm_pf_filter)

rest_delete("companies", "name=like.[TEST]%")

# Delete auth users (parallel)
all_test_uids = valid_hm_uids + valid_tal_uids
print(f"  Deleting {len(all_test_uids)} auth users...")
with ThreadPoolExecutor(max_workers=20) as ex:
    list(ex.map(auth_delete_user, all_test_uids))

print(f"\n[=] Mock load test complete.")
