-- ---------------------------------------------------------------------------
-- Counting published questions per set without reading the questions.
--
-- published_set_counts() (0009) is read by every catalogue page when its
-- cache is cold, and by every worker of a production build at once. Its
-- count scanned the whole questions table — cheap when the table is in
-- memory, several seconds when it is not, which is where the anonymous
-- statement timeout cut it off. This index holds exactly what the count
-- needs, so it is answered from the index alone.
-- ---------------------------------------------------------------------------
create index if not exists questions_published_set_idx
  on public.questions (set_id) include (id)
  where status = 'published';
