-- =============================================================================
-- 0007_teacher_role.sql — add the teacher role
--
-- Alone in its own migration on purpose: Postgres will not let a new enum value
-- be USED in the same transaction that adds it, so every policy and function
-- that mentions 'teacher' lives in 0008.
--
-- The four roles, and what separates them:
--
--   student      practises papers, owns their attempts
--   teacher      authors solutions and uploads solution video, for any
--                question — but does not touch the taxonomy or import papers
--   contributor  imports and edits papers and questions
--   admin        everything, including roles
-- =============================================================================

alter type user_role add value if not exists 'teacher' after 'student';
