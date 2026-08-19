-- Análise de Fotos: analista marca a carga como CONFERIDA após validar com a IA.
alter table public.cargas
  add column if not exists foto_conferida_por text,
  add column if not exists foto_conferida_ts timestamptz;

create index if not exists cargas_com_foto_idx
  on public.cargas (id)
  where coalesce(foto_url, '') <> '' or coalesce(foto_path, '') <> '';
