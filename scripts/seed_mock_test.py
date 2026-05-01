"""
Mock load-test seed script.
Creates 30 companies, 60 HMs, 50 roles, 240 talents for matching test.
All test records use email domain @dnjtest.mock and name prefix [TEST].
"""
import uuid, json, random, time
import urllib.request, urllib.error

PAT = "sbp_6e9760c463d2e5f00944a2f5ef61310dc819be1d"
REF = "sfnrpbsdscikpmbhrzub"
BASE = f"https://api.supabase.com/v1/projects/{REF}/database/query"

def sql(q, label=""):
    data = json.dumps({"query": q}).encode()
    req = urllib.request.Request(BASE, data=data, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {PAT}"
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode()
            parsed = json.loads(body)
            if label:
                print(f"  ✓ {label}: {len(parsed) if isinstance(parsed, list) else parsed}")
            return parsed
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"  ✗ {label or 'SQL'} ERROR {e.code}: {err[:200]}")
        return None
    except Exception as e:
        print(f"  ✗ {label or 'SQL'} EXCEPTION: {e}")
        return None

# ── Industry definitions ──────────────────────────────────────────────────────
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
LIFE_CHARS = ["priority","two_match","neutral","bad"]
POSTCODES  = ["50450","50400","55100","50480","46050","47500","80000","81300","10050","11700","30000","30450"]

random.seed(42)

# ── Pre-generate IDs ──────────────────────────────────────────────────────────
N_COMPANIES = 30
N_HM_USERS  = 60
N_ROLES     = 50
N_TALENTS   = 240

company_ids   = [str(uuid.uuid4()) for _ in range(N_COMPANIES)]
hm_user_ids   = [str(uuid.uuid4()) for _ in range(N_HM_USERS)]
role_ids      = [str(uuid.uuid4()) for _ in range(N_ROLES)]
talent_ids    = [str(uuid.uuid4()) for _ in range(N_TALENTS)]

# ── Compute bcrypt hash ───────────────────────────────────────────────────────
print("Computing bcrypt hash...")
res = sql("SELECT crypt('[TEST]Pwd123!', gen_salt('bf', 10)) AS h;")
HASH = res[0]['h']
print(f"  Hash: {HASH[:20]}...")

# ════════════════════════════════════════════════════════════════════════════════
# PHASE 1: Auth users for HMs (60 users)
# ════════════════════════════════════════════════════════════════════════════════
print("\n── Phase 1: HM auth users ──")
hm_auth_rows = []
for i in range(N_HM_USERS):
    uid = hm_user_ids[i]
    ind_idx = i // 2  # 2 HMs per company
    ind_name = INDUSTRIES[ind_idx][0]
    email = f"hm.{ind_name.lower()}.{i%2+1:02d}@dnjtest.mock"
    hm_auth_rows.append(
        f"('{uid}','authenticated','authenticated','{email}',"
        f"'{HASH}',now(),now(),now(),"
        f"'{{\"provider\":\"email\",\"providers\":[\"email\"]}}'::jsonb,"
        f"'{{\"full_name\":\"[TEST] HM {ind_name} {i%2+1}\"}}'::jsonb,false,false)"
    )

# Split into 2 batches of 30
for batch_num, batch in enumerate([hm_auth_rows[:30], hm_auth_rows[30:]]):
    q = f"""INSERT INTO auth.users
  (id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,last_sign_in_at,
   raw_app_meta_data,raw_user_meta_data,is_sso_user,is_anonymous)
VALUES {','.join(batch)} ON CONFLICT DO NOTHING;"""
    sql(q, f"HM auth batch {batch_num+1}")

# ════════════════════════════════════════════════════════════════════════════════
# PHASE 2: Auth users for talents (240 users)
# ════════════════════════════════════════════════════════════════════════════════
print("\n── Phase 2: Talent auth users ──")
tal_auth_rows = []
for i in range(N_TALENTS):
    uid = talent_ids[i]
    email = f"talent.{i+1:03d}@dnjtest.mock"
    tal_auth_rows.append(
        f"('{uid}','authenticated','authenticated','{email}',"
        f"'{HASH}',now(),now(),now(),"
        f"'{{\"provider\":\"email\",\"providers\":[\"email\"]}}'::jsonb,"
        f"'{{\"full_name\":\"[TEST] Talent {i+1}\"}}'::jsonb,false,false)"
    )

# Split into 4 batches of 60
for batch_num in range(4):
    batch = tal_auth_rows[batch_num*60:(batch_num+1)*60]
    q = f"""INSERT INTO auth.users
  (id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,last_sign_in_at,
   raw_app_meta_data,raw_user_meta_data,is_sso_user,is_anonymous)
VALUES {','.join(batch)} ON CONFLICT DO NOTHING;"""
    sql(q, f"Talent auth batch {batch_num+1}")

# ════════════════════════════════════════════════════════════════════════════════
# PHASE 3: Set profile roles (trigger creates profiles with role='talent')
# ════════════════════════════════════════════════════════════════════════════════
print("\n── Phase 3: Set HM profile roles ──")
hm_uid_list = "','".join(hm_user_ids)
sql(f"UPDATE public.profiles SET role='hiring_manager' WHERE id IN ('{hm_uid_list}');",
    "Set HM roles")

# ════════════════════════════════════════════════════════════════════════════════
# PHASE 4: Companies
# ════════════════════════════════════════════════════════════════════════════════
print("\n── Phase 4: Companies ──")
company_rows = []
for i in range(N_COMPANIES):
    cid = company_ids[i]
    ind_name, _ = INDUSTRIES[i]
    hm_uid = hm_user_ids[i*2]
    email = f"hm.{ind_name.lower()}.01@dnjtest.mock"
    company_rows.append(
        f"('{cid}','[TEST] {ind_name} Sdn Bhd',"
        f"'TEST-SSM-{i+1:04d}','{email}','{hm_uid}','51-200','{ind_name}',false)"
    )

sql(f"""INSERT INTO public.companies
  (id,name,registration_number,primary_hr_email,created_by,size,industry,verified)
VALUES {','.join(company_rows)} ON CONFLICT DO NOTHING;""", "Companies")

# ════════════════════════════════════════════════════════════════════════════════
# PHASE 5: Hiring managers records
# ════════════════════════════════════════════════════════════════════════════════
print("\n── Phase 5: Hiring managers records ──")
hm_record_rows = []
culture_profiles = ["growth","stable","mission","balanced"] * 15
for i in range(N_HM_USERS):
    hm_uid = hm_user_ids[i]
    ind_idx = i // 2
    cid = company_ids[ind_idx]
    ind_name, _ = INDUSTRIES[ind_idx]
    life_char = random.choice(["priority","two_match","neutral"])
    data_src = "survey_verified" if i % 3 == 0 else "ai_inferred"
    # Culture offers: what this company provides
    cp = culture_profiles[i % len(culture_profiles)]
    if cp == "growth":  offers = {"wants_wlb":0.6,"wants_fair_pay":0.7,"wants_growth":0.9,"wants_stability":0.5,"wants_flexibility":0.6,"wants_recognition":0.8,"wants_mission":0.6,"wants_team_culture":0.7}
    elif cp == "stable": offers = {"wants_wlb":0.8,"wants_fair_pay":0.8,"wants_growth":0.5,"wants_stability":0.9,"wants_flexibility":0.5,"wants_recognition":0.6,"wants_mission":0.5,"wants_team_culture":0.7}
    elif cp == "mission": offers = {"wants_wlb":0.7,"wants_fair_pay":0.6,"wants_growth":0.7,"wants_stability":0.6,"wants_flexibility":0.7,"wants_recognition":0.6,"wants_mission":0.9,"wants_team_culture":0.8}
    else: offers = {"wants_wlb":0.7,"wants_fair_pay":0.7,"wants_growth":0.7,"wants_stability":0.7,"wants_flexibility":0.7,"wants_recognition":0.7,"wants_mission":0.7,"wants_team_culture":0.7}

    hm_record_rows.append(
        f"('{hm_uid}','{cid}','[TEST] {ind_name} Manager',"
        f"'{life_char}','{data_src}',"
        f"'{json.dumps(offers)}',1.0)"
    )

sql(f"""INSERT INTO public.hiring_managers
  (profile_id,company_id,job_title,life_chart_character,culture_data_source,culture_offers,hm_quality_factor)
VALUES {','.join(hm_record_rows)} ON CONFLICT DO NOTHING;""", "HM records")

# ════════════════════════════════════════════════════════════════════════════════
# PHASE 6: 50 Roles across 30 companies
# ════════════════════════════════════════════════════════════════════════════════
print("\n── Phase 6: Roles ──")

# Role plan: 50 roles spread across 30 companies
# First 20 companies get 2 roles; remaining 10 get 1 role = 40+10 = 50
role_rows = []
role_meta = []  # [(role_id, ind_idx, traits, scenario)]

role_counter = 0
for ind_idx in range(N_COMPANIES):
    n_roles = 2 if ind_idx < 20 else 1
    ind_name, ind_tags = INDUSTRIES[ind_idx]
    hm_id = hm_user_ids[ind_idx * 2]  # first HM of each company

    for r_num in range(n_roles):
        rid = role_ids[role_counter]
        scenario_type = (role_counter % 5)  # 0=normal, 1=narrow_salary, 2=needs_license, 3=weekend, 4=commission

        # Pick required traits (6-8 from industry)
        n_traits = random.randint(6, 8)
        required_traits = random.sample(ind_tags, min(n_traits, len(ind_tags)))
        traits_pg = "{" + ",".join(required_traits) + "}"

        # Salary based on industry
        salary_scales = {
            "Technology":3000,"Finance":4000,"Healthcare":2800,"Logistics":2200,
            "Hospitality":1800,"Retail":1800,"Manufacturing":2500,"Legal":3500,
            "Education":2200,"Media":2500,"Construction":2800,"FnB":1600,
            "RealEstate":2500,"HR":2500,"Insurance":2800,"Automotive":2200,
            "Agriculture":2000,"Fashion":2200,"Gaming":3000,"Biotech":3200,
            "Telecom":3000,"Architecture":2800,"Energy":3200,"Tourism":1800,
            "Aviation":3500,"Security":1800,"Publishing":2200,"Shipping":2500,
            "NonProfit":2200,"Government":2500
        }
        base = salary_scales.get(ind_name, 2500)
        sal_min = base + (1000 * r_num)
        sal_max = sal_min + 2000 if scenario_type != 1 else sal_min + 500  # scenario 1 = narrow

        experience = random.choice(["junior","mid","senior"])
        work_arr = random.choice(["on_site","hybrid","remote"])
        postcode = random.choice(POSTCODES)
        requires_weekend = (scenario_type == 3)
        requires_license = (scenario_type == 2)
        is_commission   = (scenario_type == 4)
        preset = random.choice(["technical","operations","management","creative","sales",None])
        life_char_for_role = random.choice(["priority","two_match","neutral"])

        role_rows.append(
            f"('{rid}','{hm_id}',"
            f"'[TEST] {ind_name} Role {r_num+1}','{ind_name}',"
            f"'{work_arr}','{experience}',"
            f"{sal_min},{sal_max},"
            f"'{traits_pg}'::text[],"
            f"'active','{postcode}',"
            f"{str(requires_weekend).lower()},{str(requires_license).lower()},"
            f"{str(is_commission).lower()},{str(requires_weekend).lower()},"
            f"false,false,false,false)"
        )
        role_meta.append((rid, ind_idx, required_traits, scenario_type))
        role_counter += 1

# Save role_meta for later use
with open("/tmp/role_meta.json","w") as f:
    json.dump([(r, i, t, s) for r,i,t,s in role_meta], f)

for batch_num in range(5):
    batch = role_rows[batch_num*10:(batch_num+1)*10]
    if not batch: continue
    q = f"""INSERT INTO public.roles
  (id,hiring_manager_id,title,industry,work_arrangement,experience_level,
   salary_min,salary_max,required_traits,status,location_postcode,
   requires_weekend,requires_driving_license,is_commission_based,has_night_shifts,
   requires_travel,requires_own_car,requires_relocation,requires_overtime)
VALUES {','.join(batch)} ON CONFLICT DO NOTHING;"""
    sql(q, f"Roles batch {batch_num+1}")

print(f"\nPhase 1-6 complete. {role_counter} roles created.")
print("Role IDs saved to /tmp/role_meta.json")
with open("/tmp/company_ids.json","w") as f: json.dump(company_ids, f)
with open("/tmp/role_ids.json","w") as f: json.dump(role_ids[:role_counter], f)
with open("/tmp/hm_user_ids.json","w") as f: json.dump(hm_user_ids, f)
with open("/tmp/talent_ids.json","w") as f: json.dump(talent_ids, f)
