#!/usr/bin/env python3
"""
seed_uat.py — Generate realistic synthetic data for UAT load testing.

WARNING: this script writes large volumes of synthetic data.
NEVER run against production. The script REFUSES to run if SUPABASE_URL contains
the production project id (`sfnrpbsdscikpmbhrzub` by default).

Defaults: 10,000 talents + 2,000 roles, batched 200 rows + 2-second delay
between batches to avoid bursting the database.

Usage:
  export SUPABASE_URL="https://<UAT-PROJECT>.supabase.co"
  export SUPABASE_SERVICE_ROLE_KEY="<UAT service-role key>"
  python scripts/uat/seed_uat.py --talents 10000 --roles 2000

Optional:
  --batch-size 200       # rows per insert
  --delay 2.0            # seconds between batches
  --skip-talents         # only seed roles
  --skip-roles           # only seed talents
  --dry-run              # print first 3 rows of each kind, no DB writes

Required Python deps:
  pip install supabase faker python-dotenv
"""
import argparse
import os
import random
import sys
import time
import uuid
from datetime import datetime, timezone

try:
    from supabase import create_client
    from faker import Faker
except ImportError:
    print("ERROR: pip install supabase faker python-dotenv", file=sys.stderr)
    sys.exit(2)

PROD_PROJECT_ID = os.environ.get("PROD_PROJECT_ID", "sfnrpbsdscikpmbhrzub")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Reasonable seed for reproducibility — change to randomise across runs.
random.seed(42)
fake = Faker()
Faker.seed(42)

SKILLS = [
    "Python", "JavaScript", "TypeScript", "React", "Node.js", "Go", "Rust", "Java",
    "Kubernetes", "Docker", "AWS", "GCP", "Azure", "PostgreSQL", "MySQL", "Redis",
    "GraphQL", "REST APIs", "CI/CD", "Terraform", "Linux", "Git", "Agile", "Scrum",
    "Sales", "Marketing", "SEO", "Content writing", "Customer success", "Operations",
    "Project management", "Data analysis", "Excel", "Power BI", "Tableau", "SQL",
    "Machine learning", "Deep learning", "NLP", "Computer vision", "Statistics",
]
LOCATIONS = ["Kuala Lumpur", "Selangor", "Penang", "Johor Bahru", "Sabah", "Sarawak",
             "Melaka", "Putrajaya", "Cyberjaya", "Ipoh", "Kuching"]
INDUSTRIES = ["Tech", "Finance", "Retail", "Healthcare", "Education", "Manufacturing",
              "Logistics", "F&B", "Hospitality", "Construction", "Media"]
TITLES_TECH = ["Software Engineer", "Senior Software Engineer", "Tech Lead",
               "DevOps Engineer", "Data Engineer", "ML Engineer", "Product Manager",
               "QA Engineer", "Mobile Engineer", "Frontend Engineer", "Backend Engineer"]
TITLES_BIZ  = ["Sales Executive", "Marketing Manager", "HR Business Partner",
               "Account Manager", "Customer Success Manager", "Operations Lead",
               "Finance Analyst", "Business Development Manager", "Brand Manager"]


def assert_uat_only() -> None:
    if not SUPABASE_URL or not SERVICE_KEY:
        print("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars", file=sys.stderr)
        sys.exit(2)
    if PROD_PROJECT_ID and PROD_PROJECT_ID in SUPABASE_URL:
        print(
            f"REFUSING to seed against production project ({PROD_PROJECT_ID}). "
            f"Use a UAT project URL. Override PROD_PROJECT_ID env if your prod ID differs.",
            file=sys.stderr,
        )
        sys.exit(3)


def gen_talent() -> dict:
    name = fake.name()
    email = f"loadtest+talent_{uuid.uuid4().hex[:8]}@example.com"
    skills = random.sample(SKILLS, k=random.randint(4, 10))
    yrs = random.randint(0, 20)
    return {
        "id": str(uuid.uuid4()),
        "email": email,
        "full_name": f"AI Generated {name}",
        "phone": fake.phone_number(),
        "location": random.choice(LOCATIONS),
        "skills": skills,
        "years_experience": yrs,
        "expected_salary_rm": random.randint(2500, 25000),
        "summary": fake.paragraph(nb_sentences=4),
        "resume_text": " ".join(fake.paragraphs(nb=3)),
        "is_test_data": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def gen_role() -> dict:
    title = random.choice(TITLES_TECH + TITLES_BIZ)
    return {
        "id": str(uuid.uuid4()),
        "title": f"AI Generated Test Role: {title}",
        "company_name": f"AI Generated {fake.company()}",
        "industry": random.choice(INDUSTRIES),
        "location": random.choice(LOCATIONS),
        "min_salary_rm": random.randint(2500, 12000),
        "max_salary_rm": random.randint(12000, 30000),
        "required_skills": random.sample(SKILLS, k=random.randint(3, 7)),
        "description": fake.paragraph(nb_sentences=6),
        "status": "active",
        "is_test_data": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def insert_batched(client, table: str, rows: list[dict], batch_size: int, delay: float) -> int:
    total = 0
    n = len(rows)
    for i in range(0, n, batch_size):
        chunk = rows[i:i + batch_size]
        try:
            client.table(table).insert(chunk).execute()
            total += len(chunk)
            print(f"  {table}: {total}/{n} inserted", flush=True)
        except Exception as e:
            print(f"  ERROR inserting batch {i}-{i+len(chunk)}: {e}", file=sys.stderr)
            print("  continuing — failed batch will be missing from UAT data", file=sys.stderr)
        time.sleep(delay)
    return total


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed UAT Supabase with synthetic talent/role data")
    ap.add_argument("--talents", type=int, default=10_000, help="number of talents to generate")
    ap.add_argument("--roles",   type=int, default=2_000,  help="number of roles to generate")
    ap.add_argument("--batch-size", type=int, default=200)
    ap.add_argument("--delay",   type=float, default=2.0, help="seconds between batches")
    ap.add_argument("--skip-talents", action="store_true")
    ap.add_argument("--skip-roles",   action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.dry_run:
        assert_uat_only()

    print(f"Target: {SUPABASE_URL or '(dry-run)'}")
    print(f"Plan: {args.talents} talents + {args.roles} roles, batch {args.batch_size}, delay {args.delay}s")

    if args.dry_run:
        print("\nDRY RUN — sample rows:")
        print("\nTalent example:")
        print(gen_talent())
        print("\nRole example:")
        print(gen_role())
        return

    client = create_client(SUPABASE_URL, SERVICE_KEY)

    if not args.skip_talents:
        print(f"\nGenerating {args.talents} talents...")
        talents = [gen_talent() for _ in range(args.talents)]
        print("Inserting...")
        n = insert_batched(client, "talents", talents, args.batch_size, args.delay)
        print(f"Talents inserted: {n}/{args.talents}")

    if not args.skip_roles:
        print(f"\nGenerating {args.roles} roles...")
        roles = [gen_role() for _ in range(args.roles)]
        print("Inserting...")
        n = insert_batched(client, "roles", roles, args.batch_size, args.delay)
        print(f"Roles inserted: {n}/{args.roles}")

    print("\nDone. Synthetic data has `is_test_data = true` for cleanup.")


if __name__ == "__main__":
    main()
