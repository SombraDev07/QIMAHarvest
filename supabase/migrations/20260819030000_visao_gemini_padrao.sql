-- Análise de Fotos: Gemini Flash-Lite como conector padrão (a chave continua fora do git).
alter table public.parametros
  alter column visao_provedor set default 'gemini';

alter table public.parametros
  alter column visao_modelo set default 'gemini-flash-lite-latest';

update public.parametros
set visao_provedor = 'gemini'
where visao_provedor in ('desligado', '');

update public.parametros
set visao_modelo = 'gemini-flash-lite-latest'
where visao_provedor = 'gemini'
  and visao_modelo in ('', 'gemini-2.0-flash', 'gemini-2.5-flash');
