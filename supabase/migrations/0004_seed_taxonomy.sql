-- =============================================================================
-- 0004_seed_taxonomy.sql — starting taxonomy
--
-- This is a starting point, not a source of truth. IIT Madras revises its
-- curriculum every few terms, and course codes and level placement move. Every
-- row here is editable at /admin/taxonomy without a deploy, which is the whole
-- point of the design — verify against the current curriculum and correct in
-- the UI rather than editing this file.
--
-- Subject names and aliases were taken from a live audit of the course picker
-- on quizpractice.space, so the aliases match the spellings that actually
-- appear on circulating question papers.
--
-- Safe to re-run: every insert is on conflict do nothing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Programs (branches)
-- ---------------------------------------------------------------------------
insert into public.programs (slug, name, short_name, description, accent, sort_order) values
  ('ds',  'BS in Data Science and Applications', 'Data Science',
   'The original and largest IITM BS program. Foundation through BS, covering programming, statistics, machine learning and business applications.',
   '#33447a', 1),
  ('es',  'BS in Electronic Systems', 'Electronic Systems',
   'Electronics, embedded programming, digital systems and control engineering, with in-person labs and hardware kits.',
   '#2f6b4e', 2),
  ('mds', 'BS in Management and Data Science', 'Management',
   'Management fundamentals combined with the data science core.',
   '#8a5a2b', 3),
  ('ast', 'BS in Aeronautics and Space Technology', 'Aeronautics',
   'The newest IITM BS branch. No practice site currently covers it.',
   '#6b3f6b', 4)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Levels (exit points). Data Science splits the diploma into two streams,
-- which students take independently or together.
-- ---------------------------------------------------------------------------
insert into public.levels (program_id, slug, name, code, credits, sort_order)
select p.id, v.slug, v.name, v.code, v.credits, v.sort_order
from (values
  ('ds',  'foundation',            'Foundation Level',              'FN',   32::int, 1::int),
  ('ds',  'diploma-programming',   'Diploma in Programming',        'DP',   27,      2),
  ('ds',  'diploma-data-science',  'Diploma in Data Science',       'DDS',  27,      3),
  ('ds',  'bsc',                   'BSc Degree Level',              'BSC',  28,      4),
  ('ds',  'bs',                    'BS Degree Level',               'BS',   28,      5),
  ('es',  'foundation',            'Foundation Level',              'FN',   44,      1),
  ('es',  'diploma',               'Diploma Level',                 'DIP',  42,      2),
  ('es',  'bs',                    'BS Degree Level',               'BS',   56,      3),
  ('mds', 'foundation',            'Foundation Level',              'FN',   null,    1),
  ('mds', 'diploma',               'Diploma Level',                 'DIP',  null,    2),
  ('mds', 'bs',                    'BS Degree Level',               'BS',   null,    3),
  ('ast', 'foundation',            'Foundation Level',              'FN',   null,    1),
  ('ast', 'diploma',               'Diploma Level',                 'DIP',  null,    2),
  ('ast', 'bs',                    'BS Degree Level',               'BS',   null,    3)
) as v(program_slug, slug, name, code, credits, sort_order)
join public.programs p on p.slug = v.program_slug
on conflict (program_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Exam types
-- ---------------------------------------------------------------------------
insert into public.exam_types (slug, name, description, default_duration_minutes, sort_order) values
  ('quiz-1',    'Quiz 1',        'First in-person quiz of the term.',                    120, 1),
  ('quiz-2',    'Quiz 2',        'Second in-person quiz of the term.',                   120, 2),
  ('end-term',  'End Term',      'End of term examination.',                             180, 3),
  ('oppe',      'OPPE',          'Online Proctored Programming Exam.',                    90, 4),
  ('gaa',       'Graded Assignment', 'Weekly graded assignment released with course content.', 60, 5),
  ('qualifier', 'Qualifier',     'Entry qualifier examination.',                         120, 6),
  ('project',   'Project',       'Project component viva or submission.',                null, 7)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Subjects
-- ---------------------------------------------------------------------------
insert into public.subjects (level_id, slug, name, code, aliases, has_programming, sort_order)
select l.id, v.slug, v.name, v.code, v.aliases, v.has_programming, v.sort_order
from (values
  -- ---- Data Science : Foundation -----------------------------------------
  ('ds','foundation','maths-1','Mathematics for Data Science I','BSMA1001'::text,
     array['Maths1','Maths 1','Math 1','Mathematics 1'], false, 1::int),
  ('ds','foundation','statistics-1','Statistics for Data Science I','BSMA1002',
     array['Statistics1','Stats 1','Stats1'], false, 2),
  ('ds','foundation','computational-thinking','Computational Thinking','BSCS1001',
     array['CT'], false, 3),
  ('ds','foundation','english-1','English I','BSHS1001',
     array['English1','Eng 1'], false, 4),
  ('ds','foundation','maths-2','Mathematics for Data Science II','BSMA1003',
     array['Maths2','Maths 2','Math 2'], false, 5),
  ('ds','foundation','statistics-2','Statistics for Data Science II','BSMA1004',
     array['Statistics2','Stats 2','Stats2'], false, 6),
  ('ds','foundation','python','Programming in Python','BSCS1002',
     array['Intro to python','Intro to Python','Python'], true, 7),
  ('ds','foundation','english-2','English II','BSHS1002',
     array['English2','Eng 2'], false, 8),

  -- ---- Data Science : Diploma in Programming ------------------------------
  ('ds','diploma-programming','dbms','Database Management Systems','BSCS2001',
     array['DBMS','Database Management Systems'], true, 1),
  ('ds','diploma-programming','pdsa','Programming, Data Structures and Algorithms using Python','BSCS2002',
     array['PDSA'], true, 2),
  ('ds','diploma-programming','mad-1','Modern Application Development I','BSCS2003',
     array['AppDev1','MAD1','MAD I','Modern Application Development I'], true, 3),
  ('ds','diploma-programming','java','Programming Concepts using Java','BSCS2005',
     array['Java'], true, 4),
  ('ds','diploma-programming','mad-2','Modern Application Development II','BSCS2006',
     array['AppDev2','MAD2','MAD II','Modern Application Development Ii'], true, 5),
  ('ds','diploma-programming','system-commands','System Commands','BSCS2007',
     array['System Commands','Intro to Linux','Intro to the Linux Shell'], true, 6),

  -- ---- Data Science : Diploma in Data Science -----------------------------
  ('ds','diploma-data-science','mlf','Machine Learning Foundations','BSCS2004',
     array['MLF'], false, 1),
  ('ds','diploma-data-science','bdm','Business Data Management','BSMS2001',
     array['BDM'], false, 2),
  ('ds','diploma-data-science','mlt','Machine Learning Techniques','BSCS2008',
     array['MLT'], false, 3),
  ('ds','diploma-data-science','mlp','Machine Learning Practice','BSCS2009',
     array['MLP'], true, 4),
  ('ds','diploma-data-science','business-analytics','Business Analytics','BSMS2002',
     array['Business Analytics','BA'], false, 5),
  ('ds','diploma-data-science','tds','Tools in Data Science','BSSE2002',
     array['TDS','Tools in Data Science'], true, 6),

  -- ---- Data Science : BSc / BS degree level -------------------------------
  ('ds','bsc','software-engineering','Software Engineering',null,
     array['Sw Engg','Software Engineering'], false, 1),
  ('ds','bsc','software-testing','Software Testing',null,
     array['Sw Testing'], true, 2),
  ('ds','bsc','ai-search','AI: Search Methods for Problem Solving',null,
     array['Ai: Search Methods For Problem Solving','AI Search'], false, 3),
  ('ds','bsc','deep-learning','Deep Learning',null,
     array['Deep Learning','DL'], true, 4),
  ('ds','bsc','spg','Strategies for Professional Growth',null,
     array['SPG'], false, 5),
  ('ds','bsc','programming-in-c','Programming in C',null,
     array['Programming in C','C Programming'], true, 6),
  ('ds','bsc','statistical-computing','Statistical Computing',null,
     array['Statistical Computing','Stat Computing'], true, 7),
  ('ds','bsc','mathematical-thinking','Mathematical Thinking',null,
     array['Mathematical Thinking'], false, 8),
  ('ds','bsc','lsm','Linear Statistical Models',null,
     array['LSM'], false, 9),
  ('ds','bsc','advanced-algorithms','Advanced Algorithms',null,
     array['Advanced Algorithms'], false, 10),
  ('ds','bsc','operating-systems','Operating Systems',null,
     array['OS','Operating Systems'], false, 11),
  ('ds','bsc','computer-system-design','Computer System Design',null,
     array['CSD','Computer System Design'], false, 12),
  ('ds','bsc','algorithmic-thinking-bio','Algorithmic Thinking in Bioinformatics',null,
     array['Algorithmic Thinking in Bio','Algorithmic Thinking','Algo Thinking'], true, 13),
  ('ds','bsc','bbn','Big Data and Biological Networks',null,
     array['BBN','BDBN'], false, 14),
  ('ds','bsc','discrete-mathematics','Discrete Mathematics',null,
     array['Discrete Mathematics'], false, 15),
  ('ds','bs','managerial-economics','Managerial Economics',null,
     array['Managerial Economics'], false, 16),
  ('ds','bs','market-research','Market Research',null,
     array['Market Research'], false, 17),
  ('ds','bs','corporate-finance','Corporate Finance',null,
     array['Corporate Finance'], false, 18),
  ('ds','bs','financial-forensics','Financial Forensics',null,
     array['Financial Forensics'], false, 19),
  ('ds','bs','industry-4','Industry 4.0',null,
     array['Industry 4.0'], false, 20),
  ('ds','bs','psosm','Privacy and Security in Online Social Media',null,
     array['PSOSM'], false, 21),
  ('ds','bs','game-theory','Game Theory and Strategy',null,
     array['Game Theory and Strategy'], false, 22),
  ('ds','bs','speech-technology','Speech Technology',null,
     array['Speech Tech','Speech Technology'], false, 23),
  ('ds','bs','inlp','Introduction to Natural Language Processing',null,
     array['i-NLP','iNLP'], true, 24),
  ('ds','bs','rl','Reinforcement Learning',null,
     array['RL'], true, 25),
  ('ds','bs','dl-cv','Deep Learning for Computer Vision',null,
     array['DL(CV)','DLCV'], true, 26),
  ('ds','bs','dlp','Deep Learning Practice',null,
     array['DLP'], true, 27),
  ('ds','bs','llm','Large Language Models',null,
     array['LLM'], true, 28),
  ('ds','bs','genai-math','Mathematical Foundations of Generative AI',null,
     array['Mathematical Foundations of Generative AI'], false, 29),
  ('ds','bs','dl-genai','Deep Learning for Generative AI',null,
     array['DLGenAI'], true, 30),
  ('ds','bs','dvd','Data Visualization Design',null,
     array['DVD'], true, 31),
  ('ds','bs','compiler-design','Compiler Design',null,
     array['Compiler Design'], true, 32),
  ('ds','bs','computer-networks','Computer Networks',null,
     array['Computer Networks'], false, 33),
  ('ds','bs','psm','Programming in Statistical Methods',null,
     array['PSM'], false, 34),

  -- ---- Electronic Systems : Foundation ------------------------------------
  ('es','foundation','es-math-1','Mathematics for Electronics I',null,
     array['Math for Electronics I'], false, 1),
  ('es','foundation','estc','Electronic Systems Thinking and Circuits',null,
     array['ESTC'], false, 2),
  ('es','foundation','es-linux','Introduction to Linux and Programming',null,
     array['Intro to Linux'], true, 3),
  ('es','foundation','digital-systems','Digital Systems',null,
     array['Digital Systems'], false, 4),
  ('es','foundation','eec','Electrical and Electronic Circuits',null,
     array['EEC'], false, 5),
  ('es','foundation','es-math-2','Mathematics for Electronics II',null,
     array['Math for Electronics II'], false, 6),
  ('es','foundation','embedded-c','Embedded C Programming',null,
     array['Embedded C Programming'], true, 7),
  ('es','foundation','signals-systems','Signals and Systems',null,
     array['Signals and Systems'], false, 8),
  ('es','foundation','es-python','Python Programming',null,
     array['Python programming -ES'], true, 9),
  ('es','foundation','es-english-1','English I',null,
     array['ES English1'], false, 10),

  -- ---- Electronic Systems : Diploma ---------------------------------------
  ('es','diploma','dsd','Digital System Design',null,
     array['DSD'], true, 1),
  ('es','diploma','sensors','Sensors and Applications',null,
     array['Sensors and Application'], false, 2),
  ('es','diploma','control-engineering','Control Engineering',null,
     array['Control Engineering'], false, 3),
  ('es','diploma','dsp','Digital Signal Processing',null,
     array['DSP'], false, 4),
  ('es','diploma','aes','Analog Electronic Systems',null,
     array['AES'], false, 5),
  ('es','diploma','epd','Electronic Product Design',null,
     array['EPD'], false, 6),
  ('es','diploma','computer-organization','Computer Organization',null,
     array['Computer Organization'], false, 7),

  -- ---- Electronic Systems : BS degree -------------------------------------
  ('es','bs','etm','Electronics for Test and Measurement',null,
     array['ETM'], false, 1),
  ('es','bs','eftl','Electromagnetic Fields and Transmission Lines',null,
     array['EFTL'], false, 2),
  ('es','bs','sdvl','System Design with Verilog and VLSI',null,
     array['SDVL'], true, 3),
  ('es','bs','fpga','FPGA Design',null,
     array['FPGA'], true, 4),
  ('es','bs','es-computer-system-design','Computer System Design',null,
     array['Computer System Design'], false, 5)
) as v(program_slug, level_slug, slug, name, code, aliases, has_programming, sort_order)
join public.programs p on p.slug = v.program_slug
join public.levels   l on l.program_id = p.id and l.slug = v.level_slug
on conflict (slug) do nothing;
