-- Análise de Fotos: conector de visão (Gemini / OpenAI / webhook) e prompt editável.
alter table public.parametros
  add column if not exists visao_provedor text not null default 'desligado',
  add column if not exists visao_chave text not null default '',
  add column if not exists visao_modelo text not null default '',
  add column if not exists visao_endpoint text not null default '',
  add column if not exists visao_prompt text not null default '';
