-- 0113_skill_taxonomy_seed.sql
--
-- Seed ~150 common Malaysian-market skills across categories. Curated rather
-- than scraped: ensures clean slugs the matcher can rely on. Aliases let
-- free-text input from talents/HMs resolve to the canonical slug.
--
-- Categories:
--   digital, finance, creative, sales, ops, hospitality, trade, industrial,
--   automotive, logistics, clinical, beauty, education_skill, security,
--   agri, soft, language

insert into public.skill_taxonomy (slug, display_en, display_ms, display_zh, category, aliases) values
  -- ── Digital / Office ────────────────────────────────────────────────────
  ('ms_excel',          'Microsoft Excel',        'Microsoft Excel',        'Microsoft Excel',     'digital', array['excel','spreadsheets']),
  ('excel_pivot_tables','Excel Pivot Tables',     'Jadual Pangsi Excel',    'Excel 数据透视表',     'digital', array['pivot tables','pivots']),
  ('ms_word',           'Microsoft Word',         'Microsoft Word',         'Microsoft Word',      'digital', array['word','word processing']),
  ('ms_powerpoint',     'Microsoft PowerPoint',   'Microsoft PowerPoint',   'Microsoft PowerPoint','digital', array['powerpoint','slides','ppt']),
  ('google_sheets',     'Google Sheets',          'Google Sheets',          'Google 表格',         'digital', array['gsheets','spreadsheets']),
  ('google_docs',       'Google Docs',            'Google Docs',            'Google 文档',         'digital', array['gdocs']),
  ('email_management',  'Email Management',       'Pengurusan E-mel',       '电邮管理',            'digital', array['outlook','gmail']),
  ('data_entry',        'Data Entry',             'Kemasukan Data',         '数据录入',            'digital', array['typing','data input']),
  ('sql',               'SQL',                    'SQL',                    'SQL',                 'digital', array['mysql','postgres','sqlite','db query']),
  ('python',            'Python',                 'Python',                 'Python',              'digital', array['python3','py']),
  ('javascript',        'JavaScript',             'JavaScript',             'JavaScript',          'digital', array['js','es6','typescript']),
  ('react',             'React',                  'React',                  'React',               'digital', array['reactjs','react.js']),
  ('html_css',          'HTML & CSS',             'HTML & CSS',             'HTML 与 CSS',         'digital', array['html','css','frontend']),
  ('wordpress',         'WordPress',              'WordPress',              'WordPress',           'digital', array['wp','wordpress admin']),
  ('shopify',           'Shopify',                'Shopify',                'Shopify',             'digital', array['ecom','shopify admin']),
  ('seo',               'SEO',                    'SEO',                    '搜索引擎优化',         'digital', array['search engine optimization','google seo']),
  ('google_ads',        'Google Ads',             'Google Ads',             'Google 广告',         'digital', array['adwords','sem']),
  ('facebook_ads',      'Facebook & Meta Ads',    'Iklan Facebook & Meta',  'Facebook 广告',       'digital', array['meta ads','fb ads']),
  ('tiktok_content',    'TikTok Content Creation','Penciptaan Kandungan TikTok','TikTok 内容创作', 'digital', array['tiktok','short video']),
  ('canva',             'Canva',                  'Canva',                  'Canva',               'creative',array['canva design']),
  ('figma',             'Figma',                  'Figma',                  'Figma',               'creative',array['figma design']),
  ('photoshop',         'Adobe Photoshop',        'Adobe Photoshop',        'Adobe Photoshop',     'creative',array['ps','photoshop']),
  ('illustrator',       'Adobe Illustrator',      'Adobe Illustrator',      'Adobe Illustrator',   'creative',array['ai','illustrator']),
  ('autocad',           'AutoCAD',                'AutoCAD',                'AutoCAD',             'creative',array['cad','autocad 2d']),
  ('sketchup',          'SketchUp',               'SketchUp',               'SketchUp',            'creative',array['sketchup 3d']),
  ('video_editing',     'Video Editing',          'Penyuntingan Video',     '视频剪辑',            'creative',array['premiere','final cut','capcut','davinci']),
  ('copywriting',       'Copywriting',            'Penulisan Salinan',      '文案撰写',            'creative',array['copy','copywriter']),

  -- ── Finance / Accounting ───────────────────────────────────────────────
  ('basic_accounting',  'Basic Accounting',       'Perakaunan Asas',        '基础会计',            'finance', array['accounting','bookkeeping']),
  ('mygst_sst',         'GST / SST Submission',   'Penyerahan GST / SST',   'GST / SST 申报',      'finance', array['gst','sst','tax submission']),
  ('autocount',         'AutoCount',              'AutoCount',              'AutoCount',           'finance', array['autocount accounting']),
  ('sql_accounting',    'SQL Accounting',         'SQL Accounting',         'SQL Accounting',      'finance', array['sql account']),
  ('xero',              'Xero',                   'Xero',                   'Xero',                'finance', array['xero accounting']),
  ('quickbooks',        'QuickBooks',             'QuickBooks',             'QuickBooks',          'finance', array['quickbook','qb']),
  ('mfrs_compliance',   'MFRS Compliance',        'Pematuhan MFRS',         'MFRS 合规',           'finance', array['mfrs','frs','malaysia frs']),
  ('payroll',           'Payroll Processing',     'Pemprosesan Gaji',       '薪资处理',            'finance', array['payroll','salary processing','epf socso']),
  ('audit_support',     'Audit Support',          'Sokongan Audit',         '审计支持',            'finance', array['audit prep','audit assistant']),
  ('acca_part_qual',    'ACCA Part-Qualified',    'ACCA Separa Bertauliah', 'ACCA 半专业',         'finance', array['acca','acca f1-f9']),
  ('cpa',               'CPA',                    'CPA',                    '注册会计师',          'finance', array['cpa malaysia','mia']),
  ('cash_handling',     'Cash Handling',          'Pengendalian Wang Tunai','现金处理',             'finance', array['cash management','till handling']),

  -- ── Sales / Customer ───────────────────────────────────────────────────
  ('customer_service',  'Customer Service',       'Khidmat Pelanggan',      '客户服务',            'sales',   array['cs','customer support']),
  ('telesales',         'Telesales',              'Jualan Telefon',         '电话销售',            'sales',   array['cold calling','outbound calls']),
  ('field_sales',       'Field Sales',            'Jualan Lapangan',        '外勤销售',            'sales',   array['outdoor sales','d2d']),
  ('b2b_sales',         'B2B Sales',              'Jualan B2B',             'B2B 销售',            'sales',   array['business to business sales']),
  ('retail_sales',      'Retail Sales',           'Jualan Runcit',          '零售销售',            'sales',   array['retail floor','shop sales']),
  ('crm_software',      'CRM Software',           'Perisian CRM',           'CRM 软件',            'sales',   array['salesforce','hubspot','zoho']),
  ('upselling',         'Upselling & Cross-selling','Jualan Tambah & Silang','增值与交叉销售',     'sales',   array['upsell','cross sell']),
  ('negotiation',       'Negotiation',            'Perundingan',            '谈判',                'sales',   array['deal negotiation']),

  -- ── Ops / Admin ────────────────────────────────────────────────────────
  ('inventory_mgmt',    'Inventory Management',   'Pengurusan Inventori',   '库存管理',            'ops',     array['stock management','inventory']),
  ('procurement',       'Procurement / Purchasing','Perolehan',             '采购',                'ops',     array['purchasing','vendor management']),
  ('admin_clerical',    'Admin & Clerical',       'Pentadbiran',            '行政文书',            'ops',     array['admin','clerk','administrative']),
  ('scheduling',        'Scheduling',             'Penjadualan',            '排班',                'ops',     array['shift scheduling','roster']),
  ('whatsapp_business', 'WhatsApp Business',      'WhatsApp Business',      'WhatsApp Business',   'ops',     array['wa biz','wa business']),
  ('project_coordination','Project Coordination', 'Penyelarasan Projek',    '项目协调',            'ops',     array['project assistant','pmo']),
  ('ms_office',         'MS Office Suite',        'Suite MS Office',        'MS Office 套件',      'ops',     array['microsoft office']),

  -- ── Hospitality / F&B ──────────────────────────────────────────────────
  ('barista',           'Barista',                'Barista',                '咖啡师',              'hospitality', array['coffee maker','espresso maker']),
  ('latte_art',         'Latte Art',              'Seni Latte',             '拉花艺术',            'hospitality', array['latte','coffee art']),
  ('food_handling',     'Food Handling Certified','Pengendalian Makanan',   '食品处理认证',         'hospitality', array['food handler','tukang masak certified']),
  ('halal_handling',    'Halal Food Handling',    'Pengendalian Halal',     '清真食品处理',         'hospitality', array['halal','halal certified']),
  ('cooking',           'Cooking',                'Memasak',                '烹饪',                'hospitality', array['cook','chef cooking']),
  ('baking',            'Baking & Pastry',        'Membuat Roti & Pastri',  '烘焙糕点',            'hospitality', array['baker','pastry chef']),
  ('bartending',        'Bartending',             'Bartender',              '调酒',                'hospitality', array['bartender','mixologist']),
  ('waiting_tables',    'Waiting Tables / Service','Pelayanan Meja',        '餐桌服务',            'hospitality', array['waiter','waitress','server']),
  ('pos_systems',       'POS Systems',            'Sistem POS',             'POS 系统',            'hospitality', array['pos','point of sale','cashier system']),
  ('housekeeping',      'Housekeeping',           'Pembersihan',            '客房清洁',            'hospitality', array['hotel cleaning','room attendant']),
  ('front_desk',        'Front Desk / Reception', 'Meja Depan',             '前台接待',            'hospitality', array['reception','receptionist','concierge']),

  -- ── Trade / Construction ───────────────────────────────────────────────
  ('welding',           'Welding',                'Kimpalan',               '焊接',                'trade',   array['mig welding','tig welding','arc welding']),
  ('carpentry',         'Carpentry',              'Pertukangan Kayu',       '木工',                'trade',   array['woodwork','tukang kayu']),
  ('plumbing',          'Plumbing',               'Paip',                   '管道工',              'trade',   array['plumber','paip kerja']),
  ('electrical_wiring', 'Electrical Wiring',      'Pendawaian Elektrik',    '电气布线',            'trade',   array['electrician','wiring','elektrikal']),
  ('aircon_servicing',  'Air-Cond Servicing',     'Servis Penyaman Udara',  '空调维修',            'trade',   array['aircon','hvac','penghawa dingin']),
  ('painting',          'Painting (Building)',    'Mengecat Bangunan',      '油漆工',              'trade',   array['painter','building paint']),
  ('tiling',            'Tiling',                 'Memasang Jubin',         '瓷砖工',              'trade',   array['tiler','tile installer']),
  ('cm_gi_card',        'CIDB Green Card',        'Kad Hijau CIDB',         'CIDB 绿卡',           'trade',   array['cidb','green card']),

  -- ── Industrial / Manufacturing ─────────────────────────────────────────
  ('cnc_operation',     'CNC Machine Operation',  'Operasi Mesin CNC',      'CNC 机床操作',        'industrial', array['cnc','cnc machinist']),
  ('quality_inspection','Quality Inspection (QC)','Pemeriksaan Kualiti',    '质检',                'industrial', array['qc','qa inspection']),
  ('iso_9001',          'ISO 9001 Standards',     'Piawaian ISO 9001',      'ISO 9001 标准',       'industrial', array['iso 9001','quality system']),
  ('forklift_license',  'Forklift License',       'Lesen Forklift',         '叉车驾驶执照',         'industrial', array['forklift','lesen forklift dosh']),
  ('machine_operation', 'Machine Operation',      'Operasi Mesin',          '机械操作',            'industrial', array['operator','machine operator']),
  ('packing_packaging', 'Packing & Packaging',    'Membungkus',             '包装',                'industrial', array['packer','warehouse packer']),
  ('soldering',         'Soldering',              'Pematerian',             '焊接电子',            'industrial', array['solder','pcb soldering']),

  -- ── Automotive ─────────────────────────────────────────────────────────
  ('car_mechanic',      'Car Mechanic',           'Mekanik Kereta',         '汽车机修',            'automotive', array['mechanic','automotive technician']),
  ('motorcycle_repair', 'Motorcycle Repair',      'Pembaikan Motosikal',    '摩托车维修',           'automotive', array['motor mechanic']),
  ('auto_painting',     'Automotive Painting',    'Mengecat Kereta',        '汽车喷漆',            'automotive', array['spray paint','car paint']),
  ('tire_servicing',    'Tire Servicing',         'Servis Tayar',           '轮胎维修',            'automotive', array['tyre','tayar']),

  -- ── Logistics / Transport ──────────────────────────────────────────────
  ('warehouse_ops',     'Warehouse Operations',   'Operasi Gudang',         '仓库运营',            'logistics', array['warehouse','gudang']),
  ('logistics_coord',   'Logistics Coordination', 'Penyelarasan Logistik',  '物流协调',            'logistics', array['shipping coordination','logistics planner']),
  ('driving_lorry',     'Lorry Driving (E License)','Memandu Lori (Lesen E)','货车驾驶 (E 执照)','logistics', array['lori','class e']),
  ('driving_car',       'Car Driving (D License)','Memandu Kereta (Lesen D)','汽车驾驶 (D 执照)','logistics', array['drive car','lesen d']),
  ('dispatch_rider',    'Dispatch Rider',         'Penghantar Motosikal',   '快递骑手',            'logistics', array['delivery rider','grab','foodpanda']),
  ('freight_documentation','Freight Documentation','Dokumentasi Kargo',     '货运文件',            'logistics', array['shipping docs','bill of lading']),

  -- ── Clinical / Care ────────────────────────────────────────────────────
  ('first_aid_cpr',     'First Aid & CPR',        'Bantuan Cemas & CPR',    '急救与心肺复苏',       'clinical', array['first aid','cpr','bls']),
  ('phlebotomy',        'Phlebotomy',             'Mengambil Darah',        '抽血技术',            'clinical', array['blood draw']),
  ('elderly_care',      'Elderly Care',           'Penjagaan Warga Emas',   '老年护理',            'clinical', array['caregiver','aged care']),
  ('childcare',         'Childcare',              'Penjagaan Kanak-Kanak',  '儿童看护',            'clinical', array['nanny','babysitter','taska']),
  ('nursing_registered','Registered Nurse',       'Jururawat Berdaftar',    '注册护士',            'clinical', array['rn','registered nurse mma']),
  ('pharmacy_assistant','Pharmacy Assistant',     'Pembantu Farmasi',       '药房助理',            'clinical', array['pharm asst']),
  ('dental_assistant',  'Dental Assistant',       'Pembantu Pergigian',     '牙科助理',            'clinical', array['dental nurse']),

  -- ── Beauty / Wellness ─────────────────────────────────────────────────
  ('hair_styling',      'Hair Styling',           'Penggayaan Rambut',      '美发造型',            'beauty', array['hairdresser','salon']),
  ('nail_art',          'Nail Art',               'Seni Kuku',              '美甲',                'beauty', array['manicure','pedicure']),
  ('makeup_artistry',   'Makeup Artistry',        'Seni Mekap',             '化妆',                'beauty', array['mua','makeup artist']),
  ('massage_therapy',   'Massage Therapy',        'Terapi Urutan',          '按摩',                'beauty', array['masseur','urut']),

  -- ── Education / Teaching ──────────────────────────────────────────────
  ('teaching_primary',  'Primary School Teaching','Pengajaran Rendah',      '小学教学',            'education_skill', array['cikgu primary','primary teacher']),
  ('teaching_secondary','Secondary School Teaching','Pengajaran Menengah', '中学教学',             'education_skill', array['cikgu secondary']),
  ('tuition_math',      'Math Tutoring',          'Tutor Matematik',        '数学补习',            'education_skill', array['math tuition','add math tuition']),
  ('tuition_english',   'English Tutoring',       'Tutor Bahasa Inggeris',  '英语补习',            'education_skill', array['english tuition']),
  ('curriculum_design', 'Curriculum Design',      'Reka Bentuk Kurikulum',  '课程设计',            'education_skill', array['lesson planning']),

  -- ── Security ──────────────────────────────────────────────────────────
  ('security_guard',    'Security Guard',         'Pengawal Keselamatan',   '保安',                'security', array['guard','pgk certified']),
  ('cctv_monitoring',   'CCTV Monitoring',        'Pemantauan CCTV',        'CCTV 监控',           'security', array['surveillance','cctv operator']),

  -- ── Agriculture ───────────────────────────────────────────────────────
  ('palm_oil_estate',   'Palm Oil Estate Work',   'Kerja Ladang Sawit',     '油棕园工作',          'agri', array['ladang sawit','palm estate']),
  ('horticulture',      'Horticulture',           'Hortikultur',            '园艺',                'agri', array['gardening','landscaping']),
  ('animal_husbandry',  'Animal Husbandry',       'Penternakan',            '畜牧',                'agri', array['livestock','farming animals']),

  -- ── Soft / Behavioural (separate from required_traits but useful) ─────
  ('public_speaking',   'Public Speaking',        'Berucap Awam',           '公开演讲',            'soft', array['presentation','speaking']),
  ('event_coordination','Event Coordination',     'Penyelarasan Acara',     '活动协调',            'soft', array['event planning','event management']),
  ('team_leadership',   'Team Leadership',        'Kepimpinan Pasukan',     '团队领导',            'soft', array['lead team','team lead']),
  ('conflict_resolution','Conflict Resolution',   'Penyelesaian Konflik',   '冲突解决',            'soft', array['mediation']),

  -- ── Languages (skill form, complements languages_proficiency) ─────────
  ('translation_bm_en', 'Translation BM ↔ English','Terjemahan BM ↔ Inggeris','马来语-英语翻译',   'language', array['translator bm en','translation']),
  ('translation_zh_en', 'Translation Chinese ↔ English','Terjemahan Cina ↔ Inggeris','中英翻译',  'language', array['mandarin translation']),
  ('interpretation',    'Interpretation',         'Interpretasi',           '口译',                'language', array['interpreter','live interpretation'])
on conflict (slug) do update set
  display_en  = excluded.display_en,
  display_ms  = excluded.display_ms,
  display_zh  = excluded.display_zh,
  category    = excluded.category,
  aliases     = excluded.aliases;
