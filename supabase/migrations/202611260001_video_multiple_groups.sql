create table if not exists public.portal_video_groups (
  video_id text not null references public.portal_videos (id) on delete cascade,
  group_id text not null references public.portal_groups (id) on delete restrict,
  primary key (video_id, group_id)
);

create index if not exists portal_video_groups_group_idx
  on public.portal_video_groups (group_id, video_id);

insert into public.portal_video_groups (video_id, group_id)
select id, group_id
from public.portal_videos
on conflict (video_id, group_id) do nothing;

alter table public.portal_video_groups enable row level security;

drop policy if exists "Admins can manage video groups" on public.portal_video_groups;
create policy "Admins can manage video groups"
  on public.portal_video_groups for all to authenticated
  using (public.portal_is_admin()) with check (public.portal_is_admin());

drop policy if exists "Students can view video groups they belong to" on public.portal_video_groups;
create policy "Students can view video groups they belong to"
  on public.portal_video_groups for select to authenticated
  using (public.portal_can_access_group(group_id));

drop policy if exists "Students can view visible videos in their groups"
  on public.portal_videos;

create policy "Students can view visible videos in their groups"
  on public.portal_videos for select to authenticated
  using (
    visible and exists (
      select 1
      from public.portal_video_groups as video_group
      where video_group.video_id = id
        and public.portal_can_access_group(video_group.group_id)
    )
  );

drop policy if exists "Students can submit exercises for visible group videos"
  on public.student_submissions;

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
      join public.portal_video_groups as video_group on video_group.video_id = video.id
      where video.id = public.student_submissions.video_id
        and video.visible
        and public.portal_can_access_group(video_group.group_id)
    )
  );

drop policy if exists "Students can upload their own exercise submissions"
  on storage.objects;

create policy "Students can upload their own exercise submissions"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portal-files'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1
      from public.portal_videos as video
      join public.portal_video_groups as video_group on video_group.video_id = video.id
      where video.id = (storage.foldername(name))[3]
        and video.visible
        and public.portal_can_access_group(video_group.group_id)
    )
  );

grant select, insert, update, delete on public.portal_video_groups to authenticated;
grant all on public.portal_video_groups to service_role;

create or replace function public.portal_set_video_groups(target_video_id text, target_group_ids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.portal_is_admin() then
    raise exception 'Se requieren permisos de administración.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.portal_videos where id = target_video_id) then
    raise exception 'No se encontró el vídeo.' using errcode = '23503';
  end if;

  if coalesce(cardinality(target_group_ids), 0) = 0 then
    raise exception 'Selecciona al menos un grupo para el vídeo.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(target_group_ids) as selected_group(group_id)
    left join public.portal_groups as student_group on student_group.id = selected_group.group_id
    where student_group.id is null
  ) then
    raise exception 'Uno o más grupos seleccionados ya no existen.' using errcode = '23503';
  end if;

  delete from public.portal_video_groups where video_id = target_video_id;
  insert into public.portal_video_groups (video_id, group_id)
  select target_video_id, selected_group.group_id
  from (select distinct unnest(target_group_ids) as group_id) as selected_group;
end;
$$;

revoke all on function public.portal_set_video_groups(text, text[]) from public;
grant execute on function public.portal_set_video_groups(text, text[]) to authenticated;
