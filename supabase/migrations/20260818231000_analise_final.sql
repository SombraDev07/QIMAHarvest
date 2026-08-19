-- Análise final: garimpo pós-certificação. Não altera a situação da visita.

alter table public.visitas
  add column if not exists analise_final_por text,
  add column if not exists analise_final_ts timestamptz,
  add column if not exists analise_final_obs text;
