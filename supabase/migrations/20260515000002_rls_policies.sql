-- =====================================================================
-- Row-Level Security policies
-- Enforces the role matrix at the database level.
-- =====================================================================

-- Enable RLS on every table that holds app data
alter table profiles enable row level security;
alter table programs enable row level security;
alter table program_plos enable row level security;
alter table courses enable row level security;
alter table course_offerings enable row level security;
alter table course_plo_assignments enable row level security;
alter table role_assignments enable row level security;
alter table uploads enable row level security;
alter table ai_reports enable row level security;
alter table assessments enable row level security;
alter table implementation_reviews enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;

-- =====================================================================
-- profiles
-- =====================================================================

-- Anyone authenticated can read profiles (needed to display names);
-- only the owner can update their own profile.
create policy profiles_select_authenticated on profiles
  for select to authenticated using (true);

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all on profiles
  for all to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

-- =====================================================================
-- programs
-- =====================================================================

-- Read: everyone authenticated (needed for navigation; sensitive program
-- data is on child tables which apply tighter rules).
create policy programs_select on programs
  for select to authenticated using (true);

create policy programs_admin_write on programs
  for all to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

create policy programs_director_update on programs
  for update to authenticated
  using (current_user_directs_program(id))
  with check (current_user_directs_program(id));

-- =====================================================================
-- program_plos
-- =====================================================================

create policy program_plos_select on program_plos
  for select to authenticated using (true);

create policy program_plos_admin_write on program_plos
  for all to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

create policy program_plos_director_write on program_plos
  for all to authenticated
  using (current_user_directs_program(program_id))
  with check (current_user_directs_program(program_id));

-- =====================================================================
-- courses
-- =====================================================================

create policy courses_select on courses
  for select to authenticated using (true);

create policy courses_admin_write on courses
  for all to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

create policy courses_director_write on courses
  for all to authenticated
  using (current_user_directs_program(program_id))
  with check (current_user_directs_program(program_id));

-- =====================================================================
-- course_offerings
-- =====================================================================

-- Visibility:
--   admin: all
--   program director: offerings in their program
--   assessor: offerings in programs they assess
--   lecturer: only their own offerings
create policy offerings_select on course_offerings
  for select to authenticated using (
    current_user_is_admin()
    or current_user_directs_program(offering_program(id))
    or current_user_assesses_program(offering_program(id))
    or lecturer_id = auth.uid()
  );

create policy offerings_admin_write on course_offerings
  for all to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

create policy offerings_director_write on course_offerings
  for all to authenticated
  using (current_user_directs_program(offering_program(id)))
  with check (current_user_directs_program(offering_program(id)));

-- Lecturer may update status when transitioning their own offering through
-- document/AI states. (Tighter state-machine enforcement is done in app layer.)
create policy offerings_lecturer_update on course_offerings
  for update to authenticated
  using (lecturer_id = auth.uid())
  with check (lecturer_id = auth.uid());

-- =====================================================================
-- course_plo_assignments
-- =====================================================================

create policy plo_assignments_select on course_plo_assignments
  for select to authenticated using (
    current_user_is_admin()
    or current_user_directs_program(offering_program(offering_id))
    or current_user_assesses_program(offering_program(offering_id))
    or current_user_lectures_offering(offering_id)
  );

create policy plo_assignments_admin_director_write on course_plo_assignments
  for all to authenticated
  using (
    current_user_is_admin()
    or current_user_directs_program(offering_program(offering_id))
  )
  with check (
    current_user_is_admin()
    or current_user_directs_program(offering_program(offering_id))
  );

-- =====================================================================
-- role_assignments
-- =====================================================================

-- Users can see their own assignments; admin/director can see all in scope.
create policy role_assignments_select_self on role_assignments
  for select to authenticated using (user_id = auth.uid());

create policy role_assignments_admin_all on role_assignments
  for all to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

create policy role_assignments_director_program on role_assignments
  for all to authenticated
  using (program_id is not null and current_user_directs_program(program_id))
  with check (program_id is not null and current_user_directs_program(program_id));

-- =====================================================================
-- uploads
-- =====================================================================

create policy uploads_select on uploads
  for select to authenticated using (
    current_user_is_admin()
    or current_user_directs_program(offering_program(offering_id))
    or current_user_assesses_program(offering_program(offering_id))
    or current_user_lectures_offering(offering_id)
  );

-- Only the assigned lecturer (or admin) can insert files for an offering.
create policy uploads_lecturer_insert on uploads
  for insert to authenticated
  with check (
    current_user_is_admin()
    or current_user_lectures_offering(offering_id)
  );

create policy uploads_lecturer_update on uploads
  for update to authenticated
  using (
    current_user_is_admin()
    or current_user_lectures_offering(offering_id)
  );

-- =====================================================================
-- ai_reports
-- =====================================================================

create policy ai_reports_select on ai_reports
  for select to authenticated using (
    current_user_is_admin()
    or current_user_directs_program(offering_program(offering_id))
    or current_user_assesses_program(offering_program(offering_id))
    or current_user_lectures_offering(offering_id)
  );

-- AI reports are created by the lecturer's action (server-side service role
-- usually bypasses RLS, but we still allow lecturer-initiated rows).
create policy ai_reports_lecturer_insert on ai_reports
  for insert to authenticated
  with check (
    current_user_is_admin()
    or current_user_lectures_offering(offering_id)
  );

-- =====================================================================
-- assessments
-- =====================================================================

create policy assessments_select on assessments
  for select to authenticated using (
    current_user_is_admin()
    or current_user_directs_program(offering_program(offering_id))
    or current_user_assesses_program(offering_program(offering_id))
    or current_user_lectures_offering(offering_id)
  );

-- Only an assessor of the program may create/update; once locked, no further
-- updates (enforced in app layer via is_locked check; we also block here).
create policy assessments_assessor_write on assessments
  for insert to authenticated
  with check (
    current_user_assesses_program(offering_program(offering_id))
    and assessor_id = auth.uid()
  );

create policy assessments_assessor_update on assessments
  for update to authenticated
  using (
    assessor_id = auth.uid()
    and is_locked = false
  )
  with check (
    assessor_id = auth.uid()
  );

-- =====================================================================
-- implementation_reviews
-- =====================================================================

create policy impl_reviews_select on implementation_reviews
  for select to authenticated using (
    current_user_is_admin()
    or current_user_directs_program(offering_program(new_offering_id))
    or current_user_assesses_program(offering_program(new_offering_id))
    or current_user_lectures_offering(new_offering_id)
  );

create policy impl_reviews_assessor_write on implementation_reviews
  for insert to authenticated
  with check (
    current_user_assesses_program(offering_program(new_offering_id))
    and reviewer_id = auth.uid()
  );

-- =====================================================================
-- notifications
-- =====================================================================

create policy notifications_select_self on notifications
  for select to authenticated using (recipient_id = auth.uid());

create policy notifications_update_self on notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- =====================================================================
-- audit_log
-- =====================================================================

-- Audit log is read-only for everyone via the API. Only admin can read.
create policy audit_log_admin_select on audit_log
  for select to authenticated using (current_user_is_admin());

-- No insert/update/delete policies → only the trigger (which runs as
-- security definer) can write to it. App code cannot tamper with audit rows.

-- =====================================================================
-- Profile auto-creation on first sign-in
-- =====================================================================

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name_th, name_en)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
