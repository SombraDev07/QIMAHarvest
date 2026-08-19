-- Relatórios da safra gerados no Postgres a cada hora.
-- O Chrome só baixa as partes prontas; não monta 200 mil linhas na RAM.

create table if not exists public.relatorio_safra (
  tipo text primary key check (tipo in ('visitas', 'cargas')),
  gerado_em timestamptz not null default now(),
  linhas int not null default 0,
  partes int not null default 0,
  gerando boolean not null default false,
  pedido boolean not null default false,
  erro text
);

create table if not exists public.relatorio_partes (
  tipo text not null check (tipo in ('visitas', 'cargas')),
  n int not null check (n >= 0),
  csv text not null,
  primary key (tipo, n)
);

alter table public.relatorio_safra enable row level security;
alter table public.relatorio_partes enable row level security;

drop policy if exists relatorio_safra_anon on public.relatorio_safra;
create policy relatorio_safra_anon on public.relatorio_safra
  for all to anon using (true) with check (true);

drop policy if exists relatorio_partes_anon on public.relatorio_partes;
create policy relatorio_partes_anon on public.relatorio_partes
  for all to anon using (true) with check (true);

drop policy if exists relatorio_safra_select on public.relatorio_safra;
create policy relatorio_safra_select on public.relatorio_safra
  for select to authenticated using (true);

drop policy if exists relatorio_partes_select on public.relatorio_partes;
create policy relatorio_partes_select on public.relatorio_partes
  for select to authenticated using (true);

grant all on public.relatorio_safra to anon, authenticated, service_role;
grant all on public.relatorio_partes to anon, authenticated, service_role;

create or replace function public.csv_campo(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null or p = '' then ''
    when p ~ '[";\r\n]' then '"' || replace(p, '"', '""') || '"'
    else p
  end;
$$;

create or replace function public.json_objetos_para_csv(
  p_linhas json,
  p_cabecalhos text[],
  p_com_cabecalho boolean
)
returns text
language plpgsql
immutable
as $$
declare
  r json;
  i int;
  linha text;
  out text := '';
begin
  if p_com_cabecalho then
    out := array_to_string(p_cabecalhos, ';');
  end if;
  if p_linhas is null or json_typeof(p_linhas) <> 'array' then
    return out;
  end if;
  for r in select value from json_array_elements(p_linhas)
  loop
    linha := '';
    for i in 1 .. array_length(p_cabecalhos, 1) loop
      if i > 1 then linha := linha || ';'; end if;
      linha := linha || public.csv_campo(r ->> p_cabecalhos[i]);
    end loop;
    if out <> '' then out := out || E'\r\n'; end if;
    out := out || linha;
  end loop;
  return out;
end;
$$;

create or replace function public.cabecalhos_relatorio_visitas()
returns text[]
language sql
immutable
as $$
  select array[
    'Visit ID',
    'Regional PDR',
    'Distritor PDR',
    'Estado PDR',
    'Cidade PDR',
    'Nome PDR',
    'CNPJ PDR',
    'Líder',
    'Inspetor',
    'Semana',
    'Modulo',
    'Data Visita',
    'Entrada',
    'Saída',
    'Houve recebimento de soja?',
    'Testes executados em conformidade?',
    'Armazenamento correto de fitas teste?',
    'Houve solicitação de reteste?',
    'Houve divergência no reteste?',
    'Número de caixas de fita teste disponíveis',
    'PDR forneceu dados do dia anterior?',
    'PDR forneceu dados do acumulado da safra?',
    'A: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg)',
    'A: VOLUME TESTADA NEGATIVA (Kg)',
    'A: VOLUME DECLARADA (Kg)',
    'A: VOLUME TESTADA POSITVA (Kg)',
    'A: VOLUME PARTICIPANTES (Kg)',
    'B: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg)',
    'B: VOLUME BIOTECNOLOGIA PATENTE INVALIDA',
    'B: VOLUME BIOTECNOLOGIA PATENTE VALIDA',
    'B: VOLUME PARTICIPANTES',
    'C: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg)',
    'C: VOLUME BIOTECNOLOGIA PATENTE VALIDA',
    'C: VOLUME TOTAL TESTADO NEGATIVO (Kg)',
    'C: VOLUME PARTICIPANTES (Kg)',
    'E: Nº TOTAL DE CARGAS RECEBIDAS SEM PARTICIPANTE',
    'E: Nº CARGAS TESTADA NEGATIVA',
    'E: Nº CARGAS TOTAL DECLARADA',
    'E: Nº CARGAS TESTADA POSITIVA',
    'E: Nº CARGAS PARTICIPANTES',
    'HORAS',
    'Tipo Visita',
    'Nome responsável acompanhamento',
    'Situação',
    'Rodada',
    'Ocorrencias'
  ];
$$;

create or replace function public.cabecalhos_relatorio_cargas()
returns text[]
language sql
immutable
as $$
  select array[
    'ID Visita',
    'Regional PDR',
    'Distrito PDR',
    'Estado PDR',
    'Cidade PDR',
    'Nome PDR',
    'CNPJ PDR',
    'Data',
    'Hora',
    'Tipo Documento',
    'Numero Documento',
    'Peso Líquido',
    'Peso Líquido com Desconto',
    'Teste Resultado Monitorado',
    'Produtor Nome',
    'Produtor CPF/CNPJ',
    'Placa Caminhão',
    'Carga Acompanhada',
    'RATEIO',
    'Grupo Rateio',
    'ID Carga'
  ];
$$;

create or replace function public.gerar_relatorio_tipo(p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offset int := 0;
  v_limite int;
  v_fatia json;
  v_len int;
  v_n int := 0;
  v_linhas int := 0;
  v_cab text[];
begin
  if p_tipo = 'visitas' then
    v_limite := 2000;
    v_cab := public.cabecalhos_relatorio_visitas();
  elsif p_tipo = 'cargas' then
    v_limite := 4000;
    v_cab := public.cabecalhos_relatorio_cargas();
  else
    raise exception 'tipo de relatório inválido: %', p_tipo;
  end if;

  delete from public.relatorio_partes where tipo = p_tipo;

  loop
    if p_tipo = 'visitas' then
      v_fatia := public.relatorio_visitas_pagina(null, null, null, v_offset, v_limite);
    else
      v_fatia := public.relatorio_cargas_pagina(null, null, null, v_offset, v_limite);
    end if;
    v_len := coalesce(json_array_length(v_fatia), 0);
    if v_n = 0 and v_len = 0 then
      insert into public.relatorio_partes (tipo, n, csv)
      values (p_tipo, 0, array_to_string(v_cab, ';'));
      v_n := 1;
      exit;
    end if;
    exit when v_len = 0;
    insert into public.relatorio_partes (tipo, n, csv)
    values (
      p_tipo,
      v_n,
      public.json_objetos_para_csv(v_fatia, v_cab, v_n = 0)
    );
    v_n := v_n + 1;
    v_linhas := v_linhas + v_len;
    v_offset := v_offset + v_limite;
    exit when v_len < v_limite;
  end loop;

  insert into public.relatorio_safra (tipo, gerado_em, linhas, partes, gerando, erro)
  values (p_tipo, now(), v_linhas, v_n, false, null)
  on conflict (tipo) do update set
    gerado_em = excluded.gerado_em,
    linhas = excluded.linhas,
    partes = excluded.partes,
    gerando = false,
    erro = null;

  insert into public.exportacoes (tipo, gerado_por, recorte, linhas)
  values (p_tipo, 'cron', '{}'::jsonb, v_linhas);
end;
$$;

create or replace function public.gerar_relatorios_safra()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('statement_timeout', '15min', true);
  if not pg_try_advisory_lock(918273645) then
    return json_build_object('ok', false, 'motivo', 'já está gerando');
  end if;
  begin
    insert into public.relatorio_safra (tipo, gerando, pedido)
    values ('visitas', true, false)
    on conflict (tipo) do update set gerando = true, pedido = false, erro = null;
    insert into public.relatorio_safra (tipo, gerando, pedido)
    values ('cargas', true, false)
    on conflict (tipo) do update set gerando = true, pedido = false, erro = null;

    perform public.gerar_relatorio_tipo('visitas');
    perform public.gerar_relatorio_tipo('cargas');
  exception when others then
    update public.relatorio_safra
      set gerando = false, erro = sqlerrm
      where tipo in ('visitas', 'cargas');
    perform pg_advisory_unlock(918273645);
    raise;
  end;
  perform pg_advisory_unlock(918273645);
  return json_build_object('ok', true);
end;
$$;

-- O PostgREST corta em ~8 s; o Chrome só pede e espera o cron.
create or replace function public.pedir_gerar_relatorios_safra()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cron boolean := false;
begin
  insert into public.relatorio_safra (tipo, gerando, pedido)
  values ('visitas', true, true)
  on conflict (tipo) do update set gerando = true, pedido = true, erro = null;
  insert into public.relatorio_safra (tipo, gerando, pedido)
  values ('cargas', true, true)
  on conflict (tipo) do update set gerando = true, pedido = true, erro = null;

  begin
    select exists (
      select 1 from cron.job
      where jobname in ('harvest-relatorios-tick', 'harvest-relatorios-hora')
    ) into v_cron;
  exception when others then
    v_cron := false;
  end;

  if not v_cron then
    return public.gerar_relatorios_safra();
  end if;
  return json_build_object('ok', true, 'agendado', true);
end;
$$;

create or replace function public.tick_relatorios_safra()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if extract(minute from now())::int = 0
     or exists (select 1 from public.relatorio_safra where pedido) then
    return public.gerar_relatorios_safra();
  end if;
  return json_build_object('ok', true, 'motivo', 'nada a gerar');
end;
$$;

grant execute on function public.csv_campo(text) to anon, authenticated, service_role;
grant execute on function public.json_objetos_para_csv(json, text[], boolean) to anon, authenticated, service_role;
grant execute on function public.cabecalhos_relatorio_visitas() to anon, authenticated, service_role;
grant execute on function public.cabecalhos_relatorio_cargas() to anon, authenticated, service_role;
grant execute on function public.gerar_relatorio_tipo(text) to anon, authenticated, service_role;
grant execute on function public.gerar_relatorios_safra() to anon, authenticated, service_role;
grant execute on function public.pedir_gerar_relatorios_safra() to anon, authenticated, service_role;
grant execute on function public.tick_relatorios_safra() to anon, authenticated, service_role;

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron não disponível: %', sqlerrm;
end;
$$;

do $$
begin
  perform cron.unschedule(j.jobid)
  from cron.job j
  where j.jobname in ('harvest-relatorios-hora', 'harvest-relatorios-tick');
exception when others then
  null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'harvest-relatorios-tick',
    '* * * * *',
    $cron$select public.tick_relatorios_safra();$cron$
  );
exception when others then
  raise notice 'não foi possível agendar o cron: %', sqlerrm;
end;
$$;
