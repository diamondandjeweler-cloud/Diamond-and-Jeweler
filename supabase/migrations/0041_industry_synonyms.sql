-- ============================================================
-- BoLe Platform — Industry synonyms (background-match taxonomy)
--
-- Maps free-text aliases (lowercase) to canonical industry buckets.
-- match-generate normalises talent.parsed_resume.job_areas + role.title +
-- role.industry through this table to decide whether the talent's
-- background overlaps the role.
--
-- Seed is a Malaysia-leaning curated list. Admin can extend at runtime.
-- ============================================================

create table if not exists public.industry_synonyms (
  alias     text primary key,
  canonical text not null
);

create index if not exists idx_synonyms_canonical on public.industry_synonyms(canonical);

-- Pass 1: each canonical maps to itself so a role.industry that already
-- holds the canonical word resolves cleanly.
insert into public.industry_synonyms (alias, canonical) values
  ('finance','finance'), ('engineering_software','engineering_software'),
  ('engineering_civil','engineering_civil'), ('engineering_mechanical','engineering_mechanical'),
  ('engineering_electrical','engineering_electrical'), ('marketing','marketing'),
  ('sales','sales'), ('food_beverage','food_beverage'), ('retail','retail'),
  ('healthcare','healthcare'), ('hospitality','hospitality'), ('it_infra','it_infra'),
  ('data','data'), ('design','design'), ('legal','legal'), ('hr','hr'),
  ('operations','operations'), ('logistics','operations'), ('education','education'),
  ('research','research'), ('admin','admin'), ('customer_service','customer_service'),
  ('manufacturing','manufacturing'), ('construction','construction'),
  ('real_estate','real_estate'), ('media','media'), ('content','content'),
  ('jewellery','jewellery'), ('beauty','beauty'), ('automotive','automotive'),
  ('agriculture','agriculture'), ('security','security'), ('insurance','insurance'),
  ('consulting','consulting'), ('product','product'), ('quality','quality')
on conflict (alias) do nothing;

-- Pass 2: aliases.
insert into public.industry_synonyms (alias, canonical) values
  -- finance / accounting
  ('accounting','finance'),('accountant','finance'),('audit','finance'),('auditor','finance'),
  ('tax','finance'),('taxation','finance'),('bookkeeping','finance'),('treasury','finance'),
  ('corporate finance','finance'),('financial controller','finance'),('payroll','finance'),
  ('acca','finance'),('cpa','finance'),('cfa','finance'),('finance manager','finance'),
  ('credit','finance'),('banking','finance'),('teller','finance'),('analyst finance','finance'),
  -- engineering_software
  ('software','engineering_software'),('software engineer','engineering_software'),
  ('developer','engineering_software'),('programmer','engineering_software'),
  ('web developer','engineering_software'),('backend','engineering_software'),
  ('frontend','engineering_software'),('full stack','engineering_software'),
  ('fullstack','engineering_software'),('devops','engineering_software'),
  ('mobile developer','engineering_software'),('ios developer','engineering_software'),
  ('android developer','engineering_software'),('site reliability','engineering_software'),
  ('platform engineer','engineering_software'),('qa engineer','engineering_software'),
  -- engineering_civil
  ('civil','engineering_civil'),('civil engineer','engineering_civil'),
  ('structural','engineering_civil'),('structural engineer','engineering_civil'),
  ('site engineer','engineering_civil'),('project engineer','engineering_civil'),
  -- engineering_mechanical / electrical
  ('mechanical','engineering_mechanical'),('mechanical engineer','engineering_mechanical'),
  ('electrical','engineering_electrical'),('electrical engineer','engineering_electrical'),
  ('m&e','engineering_mechanical'),('mep','engineering_mechanical'),
  -- marketing / content / media
  ('brand','marketing'),('branding','marketing'),('digital marketing','marketing'),
  ('performance marketing','marketing'),('seo','marketing'),('sem','marketing'),
  ('ppc','marketing'),('growth','marketing'),('crm','marketing'),
  ('marketing manager','marketing'),('marketing executive','marketing'),
  ('copywriter','content'),('writer','content'),('editor','content'),('blogger','content'),
  ('social media','marketing'),('influencer','content'),('public relations','media'),
  ('pr','media'),('journalist','media'),('photographer','media'),('videographer','media'),
  -- sales / business development
  ('sales executive','sales'),('account executive','sales'),('account manager','sales'),
  ('bd','sales'),('business development','sales'),('lead gen','sales'),
  ('sales manager','sales'),('inside sales','sales'),('field sales','sales'),
  ('telesales','sales'),('telemarketing','sales'),
  -- food & beverage
  ('f&b','food_beverage'),('fnb','food_beverage'),('kitchen','food_beverage'),
  ('chef','food_beverage'),('sous chef','food_beverage'),('cook','food_beverage'),
  ('barista','food_beverage'),('server','food_beverage'),('waiter','food_beverage'),
  ('waitress','food_beverage'),('bartender','food_beverage'),('runner','food_beverage'),
  ('captain','food_beverage'),('restaurant manager','food_beverage'),
  ('cafe','food_beverage'),('bakery','food_beverage'),('baker','food_beverage'),
  -- retail
  ('sales associate','retail'),('cashier','retail'),('store manager','retail'),
  ('shop assistant','retail'),('merchandiser','retail'),('promoter','retail'),
  ('boutique','retail'),
  -- healthcare
  ('nurse','healthcare'),('staff nurse','healthcare'),('medical','healthcare'),
  ('doctor','healthcare'),('pharmacist','healthcare'),('lab technician','healthcare'),
  ('paramedic','healthcare'),('dental','healthcare'),('dentist','healthcare'),
  ('physiotherapist','healthcare'),('clinic','healthcare'),
  -- hospitality
  ('hotel','hospitality'),('concierge','hospitality'),('front desk','hospitality'),
  ('housekeeping','hospitality'),('reception','hospitality'),
  -- IT infra / support
  ('it support','it_infra'),('helpdesk','it_infra'),('sysadmin','it_infra'),
  ('network engineer','it_infra'),('infrastructure','it_infra'),
  ('cybersecurity','it_infra'),('security engineer','it_infra'),
  -- data
  ('data analyst','data'),('data scientist','data'),('data engineer','data'),
  ('bi','data'),('business intelligence','data'),('analytics','data'),
  ('etl','data'),('machine learning','data'),('ml engineer','data'),
  -- design
  ('designer','design'),('graphic design','design'),('graphic designer','design'),
  ('ui','design'),('ui designer','design'),('ux','design'),('ux designer','design'),
  ('product design','design'),('creative','design'),('illustrator','design'),
  -- legal / compliance
  ('lawyer','legal'),('paralegal','legal'),('compliance','legal'),
  ('legal counsel','legal'),('contract','legal'),('legal executive','legal'),
  -- hr / recruitment
  ('human resources','hr'),('talent acquisition','hr'),('recruiter','hr'),
  ('people ops','hr'),('hr manager','hr'),('hr executive','hr'),
  -- operations / logistics / supply chain
  ('ops','operations'),('logistics','operations'),('supply chain','operations'),
  ('warehouse','operations'),('inventory','operations'),('procurement','operations'),
  ('purchasing','operations'),('shipping','operations'),('dispatch','operations'),
  -- education
  ('teacher','education'),('tutor','education'),('lecturer','education'),
  ('instructor','education'),('trainer','education'),
  -- research
  ('researcher','research'),('research assistant','research'),('r&d','research'),
  -- admin / executive support
  ('admin assistant','admin'),('admin executive','admin'),('administrative','admin'),
  ('secretary','admin'),('personal assistant','admin'),('pa','admin'),
  ('executive assistant','admin'),('receptionist','admin'),('clerk','admin'),
  -- customer service
  ('cs','customer_service'),('call centre','customer_service'),('call center','customer_service'),
  ('contact centre','customer_service'),('customer support','customer_service'),
  -- manufacturing / production / quality
  ('production','manufacturing'),('factory','manufacturing'),('assembly','manufacturing'),
  ('operator','manufacturing'),('quality assurance','quality'),('qa','quality'),
  ('quality control','quality'),('qc','quality'),
  -- construction
  ('foreman','construction'),('site supervisor','construction'),('project manager construction','construction'),
  -- real estate / property
  ('property','real_estate'),('property agent','real_estate'),('real estate agent','real_estate'),
  ('estate negotiator','real_estate'),('valuer','real_estate'),
  -- jewellery / beauty / fashion
  ('jewelry','jewellery'),('jeweller','jewellery'),('jeweler','jewellery'),
  ('goldsmith','jewellery'),('gemologist','jewellery'),
  ('hairstylist','beauty'),('makeup artist','beauty'),('nail technician','beauty'),
  ('beautician','beauty'),('spa','beauty'),
  -- automotive
  ('mechanic','automotive'),('auto technician','automotive'),('motor','automotive'),
  ('automobile','automotive'),
  -- agriculture
  ('farming','agriculture'),('plantation','agriculture'),('agronomist','agriculture'),
  -- security
  ('guard','security'),('security guard','security'),('bouncer','security'),
  -- insurance
  ('insurance agent','insurance'),('underwriter','insurance'),('claims','insurance'),
  -- consulting
  ('consultant','consulting'),('management consultant','consulting'),('strategy','consulting'),
  -- product
  ('product manager','product'),('product owner','product')
on conflict (alias) do nothing;
