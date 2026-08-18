-- Transição: o SPA ainda entra com a chave publishable, sem Auth.
-- Sem GRANT o PostgREST nem vê as tabelas; sem policy anon o RLS barra tudo.
-- Quando o login real existir, remova as policies *_anon.

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'pdrs', 'usuarios', 'parametros', 'visitas', 'procedimentos_visita',
    'recebimentos_mes', 'dias_anteriores', 'cargas', 'leituras_foto',
    'ocorrencias', 'mensagens_visita', 'erros_liberados', 'log_alteracoes',
    'solicitacoes', 'solicitacao_participantes', 'mensagens_solicitacao',
    'anexos_solicitacao', 'importacoes', 'importacao_itens', 'exportacoes'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      t || '_anon', t
    );
  end loop;
end $$;

create policy evidencias_anon on storage.objects
  for all to anon
  using (bucket_id in ('evidencias', 'anexos'))
  with check (bucket_id in ('evidencias', 'anexos'));

alter publication supabase_realtime add table public.visitas;
alter publication supabase_realtime add table public.cargas;
alter publication supabase_realtime add table public.dias_anteriores;
alter publication supabase_realtime add table public.pdrs;
