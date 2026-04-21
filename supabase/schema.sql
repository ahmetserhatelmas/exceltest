create table if not exists public.dashboard_payloads (
  id bigserial primary key,
  data_year integer not null unique,
  source_file text not null default 'Veri son.xlsx',
  payload jsonb not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dashboard_payloads_generated_idx
  on public.dashboard_payloads (generated_at desc);

create or replace function public.set_dashboard_payloads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dashboard_payloads_updated_at on public.dashboard_payloads;
create trigger trg_dashboard_payloads_updated_at
before update on public.dashboard_payloads
for each row
execute function public.set_dashboard_payloads_updated_at();

