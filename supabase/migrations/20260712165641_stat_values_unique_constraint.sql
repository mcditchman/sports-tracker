-- Partial unique indexes can't be targeted by PostgREST upserts (42P10).
-- Replace with a single NULLS NOT DISTINCT unique constraint.
drop index stat_values_team_unique;
drop index stat_values_player_unique;

alter table stat_values
  add constraint stat_values_subject_unique
  unique nulls not distinct (match_id, stat_type_id, team_id, player_id);
