-- Decouple "pull ad data" from "run analysis".
--
-- A pulled-but-not-yet-analyzed snapshot is now an analytics_diagnoses row with
-- metrics set and diagnosis NULL. On connect we PULL the founder's Meta ad data
-- but do NOT auto-analyze it — the founder reviews the numbers and approves, and
-- only then does the CMO diagnosis run (filling diagnosis in place). So diagnosis
-- must be nullable.
alter table analytics_diagnoses alter column diagnosis drop not null;
