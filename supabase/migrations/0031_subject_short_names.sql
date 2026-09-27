-- ---------------------------------------------------------------------------
-- The name students search a subject by, and the official course codes.
--
-- "Mathematics for Data Science I" is the course's name; "Maths 1" is what
-- students type — "iitm bs maths 1 quiz 1 pyq", never the full title. Page
-- titles and headings lead with this name and carry the full one after it.
-- Foundation and Diploma courses go by their short names (Maths 1, Stats 1,
-- PDSA, MAD 1); degree-level and Electronic Systems courses are searched by
-- their full names, so those lead with the name itself. Taken from search
-- suggestion and video-title data, September 2026. Editable in
-- /admin/taxonomy like everything else; NULL falls back to the aliases.
--
-- Course codes are corrected or filled in from study.iitm.ac.in (DS and ES
-- academics pages, September 2026): three Diploma codes were off by one
-- (System Commands, MLT, MLP), and most degree-level and ES courses had none.
-- ---------------------------------------------------------------------------
alter table public.subjects add column if not exists short_name text;

comment on column public.subjects.short_name is
  'What students call the subject in searches ("Maths 1", "PDSA"). Leads page titles; NULL falls back to aliases, then name.';

update public.subjects s
set short_name = coalesce(s.short_name, v.short_name),
    code = coalesce(v.code, s.code)
from (values
  -- Data Science, Foundation
  ('maths-1', 'Maths 1', 'BSMA1001'),
  ('statistics-1', 'Stats 1', 'BSMA1002'),
  ('computational-thinking', 'Computational Thinking (CT)', 'BSCS1001'),
  ('english-1', 'English 1', 'BSHS1001'),
  ('maths-2', 'Maths 2', 'BSMA1003'),
  ('statistics-2', 'Stats 2', 'BSMA1004'),
  ('python', 'Python', 'BSCS1002'),
  ('english-2', 'English 2', 'BSHS1002'),
  -- Diploma in Programming
  ('dbms', 'DBMS', 'BSCS2001'),
  ('pdsa', 'PDSA', 'BSCS2002'),
  ('mad-1', 'MAD 1', 'BSCS2003'),
  ('java', 'Java', 'BSCS2005'),
  ('mad-2', 'MAD 2', 'BSCS2006'),
  ('system-commands', 'System Commands', 'BSSE2001'),
  -- Diploma in Data Science
  ('mlf', 'MLF', 'BSCS2004'),
  ('bdm', 'BDM', 'BSMS2001'),
  ('mlt', 'MLT', 'BSCS2007'),
  ('mlp', 'MLP', 'BSCS2008'),
  ('business-analytics', 'Business Analytics', 'BSMS2002'),
  ('tds', 'Tools in Data Science (TDS)', 'BSSE2002'),
  ('dl-genai', 'Deep Learning and GenAI', 'BSDA2001'),
  -- Degree level: full names lead
  ('software-engineering', 'Software Engineering', 'BSCS3001'),
  ('software-testing', 'Software Testing', 'BSCS3002'),
  ('ai-search', 'AI Search Methods', 'BSCS3003'),
  ('deep-learning', 'Deep Learning', 'BSCS3004'),
  ('spg', 'SPG', 'BSGN3001'),
  ('programming-in-c', 'Programming in C', 'BSCS3005'),
  ('statistical-computing', 'Statistical Computing', 'BSMA3014'),
  ('mathematical-thinking', 'Mathematical Thinking', 'BSMA2001'),
  ('lsm', 'Linear Statistical Models', 'BSMA3012'),
  ('advanced-algorithms', 'Advanced Algorithms', 'BSCS4021'),
  ('operating-systems', 'Operating Systems', 'BSCS4022'),
  ('computer-system-design', 'Computer System Design', 'BSCS3031'),
  ('algorithmic-thinking-bio', 'Algorithmic Thinking in Bioinformatics', 'BSBT4001'),
  ('bbn', 'Big Data and Biological Networks', 'BSBT4002'),
  ('discrete-mathematics', 'Discrete Mathematics', 'BSMA3001'),
  ('ads', 'Algorithms for Data Science', 'BSDA5003'),
  ('design-thinking', 'Design Thinking', 'BSMS4002'),
  ('intro-big-data', 'Intro to Big Data', 'BSDA5001'),
  ('ds-ai-lab', 'Data Science and AI Lab', 'BSDA4001'),
  ('managerial-economics', 'Managerial Economics', 'BSMS3033'),
  ('market-research', 'Market Research', 'BSMS3002'),
  ('corporate-finance', 'Corporate Finance', 'BSMS3034'),
  ('financial-forensics', 'Financial Forensics', 'BSMS4003'),
  ('industry-4', 'Industry 4.0', 'BSMS4001'),
  ('psosm', 'PSOSM', 'BSCS4003'),
  ('game-theory', 'Game Theory', 'BSMS4023'),
  ('speech-technology', 'Speech Technology', 'BSEE4001'),
  ('inlp', 'Intro to NLP', 'BSDA5005'),
  ('rl', 'Reinforcement Learning', 'BSDA5007'),
  ('dl-cv', 'Deep Learning for Computer Vision', 'BSDA5006'),
  ('dlp', 'Deep Learning Practice', 'BSDA5013'),
  ('llm', 'LLM', 'BSDA5004'),
  ('genai-math', 'Mathematical Foundations of Generative AI', null),
  ('dvd', 'Data Visualization Design', 'BSCS4001'),
  ('compiler-design', 'Compiler Design', 'BSCS4032'),
  ('computer-networks', 'Computer Networks', 'BSCS4024'),
  ('psm', 'PSM', null),
  -- Electronic Systems
  ('es-english-1', 'English 1 (ES)', 'HS1101'),
  ('es-math-1', 'Maths for Electronics 1', 'MA1101'),
  ('estc', 'ESTC', 'EE1101'),
  ('es-c-programming', 'Intro to C Programming', 'CS1101'),
  ('es-linux', 'Intro to Linux', 'CS1102'),
  ('digital-systems', 'Digital Systems', 'EE1102'),
  ('eec', 'Electrical and Electronic Circuits', 'EE1103'),
  ('embedded-c', 'Embedded C Programming', 'CS2101'),
  ('signals-systems', 'Signals and Systems', 'EE2101'),
  ('es-python', 'Python (ES)', 'CS1002'),
  ('es-math-2', 'Maths for Electronics 2', 'MA2101'),
  ('aes', 'Analog Electronic Systems', 'EE2102'),
  ('dsd', 'Digital System Design', 'EE2103'),
  ('dsp', 'Digital Signal Processing', 'EE3101'),
  ('sensors', 'Sensors and Applications', 'EE3103'),
  ('computer-organization', 'Computer Organization', 'EE2106'),
  ('etm', 'Electronic Testing and Measurement', 'EE4108'),
  ('control-engineering', 'Control Engineering', 'EE3102'),
  ('eftl', 'Electromagnetic Fields and Transmission Lines', 'EE3104'),
  ('epd', 'Electronic Product Design', 'EE4102'),
  ('fpga', 'Embedded Linux and FPGAs', 'EE4101'),
  ('sdvl', 'System Design with Verilog and VLSI', null)
) as v(slug, short_name, code)
where s.slug = v.slug;

-- The course is "Introduction to Deep Learning and Generative AI" in the
-- current curriculum, not "Deep Learning for Generative AI".
update public.subjects
set name = 'Introduction to Deep Learning and Generative AI'
where slug = 'dl-genai' and name = 'Deep Learning for Generative AI';
