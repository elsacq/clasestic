create table if not exists public.portal_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.portal_students (
  id text primary key,
  name text not null,
  google_email text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create unique index if not exists portal_students_google_email_idx
  on public.portal_students (lower(google_email))
  where google_email is not null;

create table if not exists public.portal_groups (
  id text primary key,
  name text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_student_groups (
  student_id text not null references public.portal_students (id) on delete cascade,
  group_id text not null references public.portal_groups (id) on delete cascade,
  primary key (student_id, group_id)
);

create table if not exists public.portal_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  student_id text not null unique references public.portal_students (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.portal_videos (
  id text primary key,
  group_id text not null references public.portal_groups (id) on delete restrict,
  title text not null,
  class_date date not null,
  exercise_filename text,
  has_exercise boolean not null default false,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_videos_exercise_file check (has_exercise = (exercise_filename is not null))
);

create table if not exists public.portal_video_secrets (
  video_id text primary key references public.portal_videos (id) on delete cascade,
  video_url text not null,
  video_password text,
  exercise_path text,
  updated_at timestamptz not null default now(),
  constraint portal_video_secrets_https_url check (video_url ~ '^https://')
);

create table if not exists public.student_submissions (
  id uuid primary key default gen_random_uuid(),
  video_id text not null references public.portal_videos (id) on delete restrict,
  student_id text not null references public.portal_students (id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  uploaded_at timestamptz not null default now(),
  grade numeric(3,1) check (grade is null or (grade >= 0 and grade <= 10)),
  feedback text,
  graded_at timestamptz
);

create table if not exists public.portal_access_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  student_id text not null references public.portal_students (id) on delete cascade,
  video_id text not null references public.portal_videos (id) on delete cascade,
  event_type text not null check (event_type in ('video_clicked', 'exercise_downloaded', 'submission_downloaded')),
  created_at timestamptz not null default now()
);

create index if not exists portal_student_groups_group_idx on public.portal_student_groups (group_id, student_id);
create index if not exists portal_videos_group_date_idx on public.portal_videos (group_id, class_date desc);
create index if not exists student_submissions_student_uploaded_idx on public.student_submissions (student_id, uploaded_at desc);
create index if not exists portal_access_logs_video_date_idx on public.portal_access_logs (video_id, created_at desc);

create or replace function public.portal_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_admins
    where user_id = (select auth.uid())
  );
$$;

create or replace function public.portal_student_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.student_id
  from public.portal_profiles as profile
  join public.portal_students as student on student.id = profile.student_id and student.enabled
  where profile.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.portal_can_access_group(target_group_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_student_groups as membership
    join public.portal_groups as student_group
      on student_group.id = membership.group_id and student_group.enabled
    where membership.group_id = target_group_id
      and membership.student_id = public.portal_student_id()
  );
$$;

revoke all on function public.portal_is_admin() from public;
revoke all on function public.portal_student_id() from public;
revoke all on function public.portal_can_access_group(text) from public;
grant execute on function public.portal_is_admin() to authenticated;
grant execute on function public.portal_student_id() to authenticated;
grant execute on function public.portal_can_access_group(text) to authenticated;

alter table public.portal_admins enable row level security;
alter table public.portal_students enable row level security;
alter table public.portal_groups enable row level security;
alter table public.portal_student_groups enable row level security;
alter table public.portal_profiles enable row level security;
alter table public.portal_videos enable row level security;
alter table public.portal_video_secrets enable row level security;
alter table public.student_submissions enable row level security;
alter table public.portal_access_logs enable row level security;

create policy "Admins can manage portal admins"
  on public.portal_admins for all to authenticated
  using (public.portal_is_admin()) with check (public.portal_is_admin());

create policy "Admins can manage portal students"
  on public.portal_students for all to authenticated
  using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy "Students can view their own profile details"
  on public.portal_students for select to authenticated
  using (id = public.portal_student_id());

create policy "Admins can manage portal groups"
  on public.portal_groups for all to authenticated
  using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy "Students can view their own groups"
  on public.portal_groups for select to authenticated
  using (enabled and public.portal_can_access_group(id));

create policy "Admins can manage group memberships"
  on public.portal_student_groups for all to authenticated
  using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy "Students can view their own memberships"
  on public.portal_student_groups for select to authenticated
  using (student_id = public.portal_student_id());

create policy "Admins can manage portal profiles"
  on public.portal_profiles for all to authenticated
  using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy "Students can view their own portal profile"
  on public.portal_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Admins can manage videos"
  on public.portal_videos for all to authenticated
  using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy "Students can view visible videos in their groups"
  on public.portal_videos for select to authenticated
  using (visible and public.portal_can_access_group(group_id));

create policy "Admins can manage video secrets"
  on public.portal_video_secrets for all to authenticated
  using (public.portal_is_admin()) with check (public.portal_is_admin());

create policy "Admins can manage student submissions"
  on public.student_submissions for all to authenticated
  using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy "Students can view their own submissions"
  on public.student_submissions for select to authenticated
  using (student_id = public.portal_student_id());
create policy "Students can submit exercises for visible group videos"
  on public.student_submissions for insert to authenticated
  with check (
    student_id = public.portal_student_id()
    and grade is null
    and feedback is null
    and graded_at is null
    and split_part(file_path, '/', 1) = 'submissions'
    and split_part(file_path, '/', 2) = (select auth.uid())::text
    and split_part(file_path, '/', 3) = video_id
    and exists (
      select 1
      from public.portal_videos as video
      where video.id = video_id
        and video.visible
        and public.portal_can_access_group(video.group_id)
    )
  );

create policy "Admins can view portal activity"
  on public.portal_access_logs for select to authenticated
  using (public.portal_is_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('portal-files', 'portal-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

create policy "Admins can manage portal files"
  on storage.objects for all to authenticated
  using (bucket_id = 'portal-files' and public.portal_is_admin())
  with check (bucket_id = 'portal-files' and public.portal_is_admin());

create policy "Students can upload their own exercise submissions"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portal-files'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1
      from public.portal_videos as video
      where video.id = (storage.foldername(name))[3]
        and video.visible
        and public.portal_can_access_group(video.group_id)
    )
  );

create policy "Students can remove their own unrecorded submission files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'portal-files'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and not exists (
      select 1 from public.student_submissions
      where file_path = name
    )
  );

grant select, insert, update, delete on public.portal_admins to authenticated;
grant select, insert, update, delete on public.portal_students to authenticated;
grant select, insert, update, delete on public.portal_groups to authenticated;
grant select, insert, update, delete on public.portal_student_groups to authenticated;
grant select, insert, update, delete on public.portal_profiles to authenticated;
grant select, insert, update, delete on public.portal_videos to authenticated;
grant select, insert, update, delete on public.portal_video_secrets to authenticated;
grant select, insert, update, delete on public.student_submissions to authenticated;
grant select on public.portal_access_logs to authenticated;
grant usage, select on sequence public.portal_access_logs_id_seq to authenticated;

grant all on public.portal_admins to service_role;
grant all on public.portal_students to service_role;
grant all on public.portal_groups to service_role;
grant all on public.portal_student_groups to service_role;
grant all on public.portal_profiles to service_role;
grant all on public.portal_videos to service_role;
grant all on public.portal_video_secrets to service_role;
grant all on public.student_submissions to service_role;
grant all on public.portal_access_logs to service_role;
grant usage, select on sequence public.portal_access_logs_id_seq to service_role;
