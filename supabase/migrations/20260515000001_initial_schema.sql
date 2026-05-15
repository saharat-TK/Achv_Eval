-- =====================================================================
-- Course Evaluation & Monitoring System — Initial Schema
-- Target: Supabase Postgres 15+
-- =====================================================================

-- ----- Extensions ----------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----- Enumerated types ----------------------------------------------
create type program_level as enum ('undergraduate', 'master', 'doctoral');
create type plo_schema as enum ('4_domain', '6_domain_tqf');
create type plo_domain as enum (
  'ethics',
  'knowledge',
  'intellectual',
  'interpersonal',
  'numerical_comm_it',
  'psychomotor',
  'character',
  'skill'
);
create type course_type as enum (
  'theory',
  'theory_practice',
  'practice',
  'field',
  's_u'
);
create type semester_code as enum ('1', '2', '3'); -- 3 = summer
create type app_role as enum (
  'admin',
  'program_director',
  'assessor',
  'corresponding_lecturer'
);
create type upload_type as enum (
  'tqf3',
  'tqf4',
  'tqf5',
  'tqf6',
  'grade_report_pdf',
  'grade_raw_scores',
  'item_analysis',
  'rubric',
  'supporting'
);
create type offering_status as enum (
  'draft',
  'documents_pending',
  'ready_for_ai',
  'ai_in_progress',
  'ai_complete',
  'assessor_review',
  'assessed',
  'pending_review_next_semester',
  'implemented',
  'not_implemented'
);
create type ai_report_status as enum ('queued', 'running', 'succeeded', 'failed');
create type rubric_score as enum ('1', '2', '3', 'na');
create type assessment_band as enum ('improve', 'good', 'excellent');
create type implementation_decision as enum ('implemented', 'not_implemented', 'partially_implemented');

-- ----- Profiles (linked to auth.users) -------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email ~* '^[^@]+@mfu\.ac\.th$'),
  name_th text,
  name_en text,
  title_th text,
  title_en text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----- Programs ------------------------------------------------------
create table programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_th text not null,
  name_en text not null,
  school text not null default 'Health Science',
  level program_level not null,
  plo_domain_schema plo_schema not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);

create table program_plos (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  plo_number int not null,
  domain plo_domain not null,
  description_th text not null,
  description_en text,
  bloom_level int check (bloom_level between 1 and 6),
  display_order int not null default 0,
  unique (program_id, plo_number)
);

create index idx_program_plos_program on program_plos(program_id);

-- ----- Courses (catalog) ---------------------------------------------
create table courses (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete restrict,
  code text not null,
  name_th text not null,
  name_en text not null,
  credit_structure text not null, -- e.g. "2(2-0-4)"
  credits numeric(3,1) not null,
  type course_type not null,
  year_of_study int check (year_of_study between 1 and 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, code)
);

create index idx_courses_program on courses(program_id);

-- ----- Course offerings (per semester instance) ----------------------
create table course_offerings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete restrict,
  academic_year int not null, -- Buddhist year, e.g. 2568
  semester semester_code not null,
  section text default '1',
  lecturer_id uuid references profiles(id),
  has_exam_assessment boolean not null default true, -- drives rubric item 3.4
  status offering_status not null default 'draft',
  previous_offering_id uuid references course_offerings(id), -- carry-forward
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  unique (course_id, academic_year, semester, section)
);

create index idx_offerings_year_sem on course_offerings(academic_year, semester);
create index idx_offerings_lecturer on course_offerings(lecturer_id);
create index idx_offerings_prev on course_offerings(previous_offering_id);

-- Which PLOs this offering is responsible for (per TQF.2 mapping)
create table course_plo_assignments (
  offering_id uuid not null references course_offerings(id) on delete cascade,
  plo_id uuid not null references program_plos(id) on delete cascade,
  primary key (offering_id, plo_id)
);

-- ----- Role assignments (RBAC) ---------------------------------------
-- A user can hold multiple roles, scoped per program or course offering.
-- admin: program_id and offering_id both null
-- program_director / assessor: program_id required, offering_id null
-- corresponding_lecturer: offering_id required (also stored on course_offerings.lecturer_id for fast lookup)
create table role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role app_role not null,
  program_id uuid references programs(id) on delete cascade,
  offering_id uuid references course_offerings(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references profiles(id),
  revoked_at timestamptz,
  check (
    (role = 'admin' and program_id is null and offering_id is null) or
    (role in ('program_director', 'assessor') and program_id is not null and offering_id is null) or
    (role = 'corresponding_lecturer' and offering_id is not null)
  )
);

create index idx_role_assignments_user on role_assignments(user_id) where revoked_at is null;
create index idx_role_assignments_program on role_assignments(program_id) where revoked_at is null;
create index idx_role_assignments_offering on role_assignments(offering_id) where revoked_at is null;

-- ----- File uploads (metadata; bytes live in Google Drive) -----------
create table uploads (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  type upload_type not null,
  original_filename text not null,
  drive_file_id text not null,
  drive_web_view_link text,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid not null references profiles(id),
  is_superseded boolean not null default false
);

create index idx_uploads_offering on uploads(offering_id) where is_superseded = false;
create index idx_uploads_offering_type on uploads(offering_id, type) where is_superseded = false;

-- ----- AI reports ----------------------------------------------------
create table ai_reports (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  version int not null,
  status ai_report_status not null default 'queued',
  prompt_template text not null, -- 'CLAUDE.md' or 'CLAUDE.undergrad.md'
  gemini_model text not null default 'gemini-2.5-pro',
  gemini_request_id text,
  input_token_count int,
  output_token_count int,
  drive_pdf_id text,
  drive_pdf_link text,
  log_sheet_row_id text, -- ID of corresponding row in the lecturer-action log Sheet
  structured_output jsonb, -- parsed sections 1..4 for in-app rendering
  grade_stats jsonb,       -- deterministic stats (mean, sd, distribution)
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references profiles(id),
  unique (offering_id, version)
);

create index idx_ai_reports_offering on ai_reports(offering_id);

-- ----- Assessments (7-item rubric) -----------------------------------
create table assessments (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  ai_report_id uuid not null references ai_reports(id),
  assessor_id uuid not null references profiles(id),

  -- Rubric items (1/2/3 or NA when not applicable, esp. item_3_4)
  item_1_clo rubric_score not null,
  item_2_1_content rubric_score not null,
  item_2_2_methods rubric_score not null,
  item_3_1_assessment_methods rubric_score not null,
  item_3_2_assessment_forms rubric_score not null,
  item_3_3_proportions rubric_score not null,
  item_3_4_exam_quality rubric_score not null, -- 'na' if has_exam_assessment = false

  comments jsonb, -- {item_1_clo: {strengths: "...", improvements: "..."}, ...}
  section_comments jsonb, -- pinned comments on AI report sections
  general_notes text,

  total_score int generated always as (
    case when item_1_clo = 'na' then 0 else item_1_clo::text::int end +
    case when item_2_1_content = 'na' then 0 else item_2_1_content::text::int end +
    case when item_2_2_methods = 'na' then 0 else item_2_2_methods::text::int end +
    case when item_3_1_assessment_methods = 'na' then 0 else item_3_1_assessment_methods::text::int end +
    case when item_3_2_assessment_forms = 'na' then 0 else item_3_2_assessment_forms::text::int end +
    case when item_3_3_proportions = 'na' then 0 else item_3_3_proportions::text::int end +
    case when item_3_4_exam_quality = 'na' then 0 else item_3_4_exam_quality::text::int end
  ) stored,

  max_score int generated always as (
    case when item_1_clo = 'na' then 0 else 3 end +
    case when item_2_1_content = 'na' then 0 else 3 end +
    case when item_2_2_methods = 'na' then 0 else 3 end +
    case when item_3_1_assessment_methods = 'na' then 0 else 3 end +
    case when item_3_2_assessment_forms = 'na' then 0 else 3 end +
    case when item_3_3_proportions = 'na' then 0 else 3 end +
    case when item_3_4_exam_quality = 'na' then 0 else 3 end
  ) stored,

  -- Percentage and band computed from a view (or app-side) since
  -- a generated column cannot depend on another generated column in PG <17.

  signed_pdf_drive_id text,
  signed_pdf_drive_link text,
  signed_at timestamptz,
  is_locked boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_assessments_offering on assessments(offering_id);
create index idx_assessments_assessor on assessments(assessor_id);

-- Convenience view that adds percentage + band
create or replace view assessment_results as
select
  a.*,
  case when a.max_score = 0 then null
       else round(100.0 * a.total_score / a.max_score, 2)
  end as percent_score,
  case
    when a.max_score = 0 then null
    when round(100.0 * a.total_score / a.max_score, 2) >= 80 then 'excellent'::assessment_band
    when round(100.0 * a.total_score / a.max_score, 2) >= 70 then 'good'::assessment_band
    else 'improve'::assessment_band
  end as band
from assessments a;

-- ----- Cross-semester implementation reviews -------------------------
create table implementation_reviews (
  id uuid primary key default gen_random_uuid(),
  previous_assessment_id uuid not null references assessments(id),
  new_offering_id uuid not null references course_offerings(id),
  decision implementation_decision not null,
  reviewer_id uuid not null references profiles(id),
  notes text,
  reviewed_at timestamptz not null default now(),
  unique (previous_assessment_id, new_offering_id)
);

-- ----- Notifications -------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  related_offering_id uuid references course_offerings(id) on delete set null,
  email_sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_recipient_unread on notifications(recipient_id) where read_at is null;

-- ----- Audit log -----------------------------------------------------
create table audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references profiles(id),
  action text not null, -- e.g. 'insert', 'update', 'delete', 'sign_off', 'status_change'
  entity_type text not null, -- table name
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  request_id text -- correlation id from API layer
);

create index idx_audit_entity on audit_log(entity_type, entity_id);
create index idx_audit_actor on audit_log(actor_id);
create index idx_audit_time on audit_log(occurred_at);

-- =====================================================================
-- Triggers: maintain updated_at, write audit log
-- =====================================================================

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'profiles','programs','courses','course_offerings','assessments'
    ])
  loop
    execute format('
      create trigger trg_%I_updated_at
        before update on %I
        for each row execute function set_updated_at();
    ', t, t);
  end loop;
end $$;

-- Generic audit trigger (writes row diffs to audit_log)
create or replace function write_audit_log() returns trigger as $$
declare
  actor uuid := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
begin
  insert into audit_log (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    actor,
    lower(tg_op),
    tg_table_name,
    coalesce(new.id::text, old.id::text),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'programs','program_plos','courses','course_offerings',
      'course_plo_assignments','role_assignments','uploads',
      'ai_reports','assessments','implementation_reviews'
    ])
  loop
    execute format('
      create trigger trg_%I_audit
        after insert or update or delete on %I
        for each row execute function write_audit_log();
    ', t, t);
  end loop;
end $$;

-- =====================================================================
-- Helper functions for RLS (defined here so policies can reference them)
-- =====================================================================

create or replace function current_user_is_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from role_assignments
    where user_id = auth.uid()
      and role = 'admin'
      and revoked_at is null
  );
$$;

create or replace function current_user_directs_program(p uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from role_assignments
    where user_id = auth.uid()
      and role = 'program_director'
      and program_id = p
      and revoked_at is null
  );
$$;

create or replace function current_user_assesses_program(p uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from role_assignments
    where user_id = auth.uid()
      and role = 'assessor'
      and program_id = p
      and revoked_at is null
  );
$$;

create or replace function current_user_lectures_offering(o uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from course_offerings co
    where co.id = o
      and co.lecturer_id = auth.uid()
  );
$$;

create or replace function offering_program(o uuid) returns uuid
language sql stable security definer as $$
  select c.program_id
  from course_offerings co
  join courses c on c.id = co.course_id
  where co.id = o;
$$;
