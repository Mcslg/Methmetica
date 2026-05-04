alter table public.workflows
add column if not exists update_summary text;

alter table public.workflow_versions
add column if not exists update_summary text;

create or replace function public.apply_workflow_update_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_previous_version_id uuid;
begin
  new.change_type := public.workflow_change_type_from_json(new.workflow_json, new.change_type);
  new.update_policy := public.workflow_update_policy_from_json(new.workflow_json, new.change_type, new.update_policy);
  new.update_summary := nullif(trim(coalesce(new.workflow_json #>> '{meta,updateSummary}', new.update_summary, '')), '');
  new.warning_message := nullif(trim(coalesce(new.workflow_json #>> '{meta,warningMessage}', new.warning_message, '')), '');

  if tg_table_name = 'workflow_versions' then
    if new.supersedes_version_id is null then
      select current_version_id into v_previous_version_id
      from public.workflows
      where id = new.workflow_id;
      new.supersedes_version_id := v_previous_version_id;
    end if;
  elsif tg_table_name = 'workflows' and tg_op = 'UPDATE' and new.supersedes_version_id is null then
    new.supersedes_version_id := old.current_version_id;
  end if;

  if new.change_type = 'edit' then
    new.update_policy := 'none';
    new.warning_message := null;
  elsif new.change_type = 'fix' and new.warning_message is null then
    new.warning_message := '這個版本已有修正版，建議手動更新。';
  elsif new.change_type = 'hotfix' and new.warning_message is null then
    new.warning_message := '這個版本有重要修復，建議盡快更新。';
  end if;

  return new;
end;
$$;
