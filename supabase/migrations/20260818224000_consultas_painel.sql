-- Painel no banco: o Chrome não carrega a safra no boot.
-- KPI, fila, busca e relatório saem de índices + funções; o front pede página.

create extension if not exists pg_trgm;

create index if not exists visitas_fila_idx
  on public.visitas (situacao, rodada, data desc);

create index if not exists visitas_pdr_nome_trgm_idx
  on public.visitas using gin (pdr_nome gin_trgm_ops);

create index if not exists visitas_consultor_trgm_idx
  on public.visitas using gin (consultor gin_trgm_ops);

create index if not exists visitas_insercao_auto_idx
  on public.visitas (pdr_cnpj, data)
  where consultor = 'INSERÇÃO_AUTO';

create index if not exists cargas_acompanhada_idx
  on public.cargas (acompanhada)
  where acompanhada;

create index if not exists cargas_foto_idx
  on public.cargas (visita_cod)
  where foto_url is not null;

/* ------------------------------------------------------------------ *
 * Volume líquido — mesma regra do front (pesoVolumeLiquido)
 * ------------------------------------------------------------------ */
create or replace function public.peso_volume_liquido(
  p_liquido numeric,
  p_desconto numeric,
  p_nao_informado jsonb
)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce((p_nao_informado->>'pesoComDesconto')::boolean, false) is not true
         and coalesce(p_desconto, 0) > 0
      then p_desconto
    when coalesce((p_nao_informado->>'pesoLiquido')::boolean, false)
      then 0
    else greatest(coalesce(p_liquido, 0), 0)
  end;
$$;

create or replace function public.kpi_safra()
returns json
language sql
stable
as $$
  select json_build_object(
    'total', (select count(*)::int from public.visitas),
    'certificadas', (select count(*)::int from public.visitas where situacao = 'certificada'),
    'emCorrecao', (
      select count(*)::int from public.visitas
      where situacao in ('central-correcao', 'operacao-correcao')
    ),
    'acompanhadas', (select count(*)::int from public.cargas where acompanhada is true),
    'rateadas', (
      select count(*)::int from public.cargas
      where acompanhada is true and rateio is true
    ),
    'volumeKg', (
      select coalesce(sum(public.peso_volume_liquido(peso_liquido, peso_com_desconto, nao_informado)), 0)
      from public.cargas
      where acompanhada is true
    )
  );
$$;

create or replace function public.fluxo_contagens()
returns json
language sql
stable
as $$
  select json_build_object(
    'c1', count(*) filter (where situacao = 'central-correcao' and rodada <= 1),
    'o1', count(*) filter (where situacao = 'operacao-correcao' and rodada <= 1),
    'c2', count(*) filter (where situacao = 'central-correcao' and rodada >= 2),
    'o2', count(*) filter (where situacao = 'operacao-correcao' and rodada >= 2),
    'canc', count(*) filter (where situacao = 'cancelada'),
    'cert', count(*) filter (where situacao = 'certificada')
  )::json
  from public.visitas;
$$;

create or replace function public.kpi_acumulado()
returns json
language sql
stable
as $$
  select json_build_object(
    'registros', count(*)::int,
    'negativa', coalesce(sum(acumulado_negativa), 0),
    'declarada', coalesce(sum(acumulado_declarada), 0),
    'positiva', coalesce(sum(acumulado_positiva), 0),
    'participante', coalesce(sum(acumulado_participante), 0)
  )
  from public.visitas
  where consultor = 'INSERÇÃO_AUTO';
$$;

/* ------------------------------------------------------------------ *
 * Fila paginada da lista (12 linhas). Contagens da fila vêm no mesmo round-trip.
 * ------------------------------------------------------------------ */
create or replace function public.listar_fila(
  p_situacao text,
  p_rodada int default null,
  p_codigo text default null,
  p_pdr text default null,
  p_de date default null,
  p_ate date default null,
  p_consultor text default null,
  p_lider text default null,
  p_lider_focal text default null,
  p_supervisor text default null,
  p_regiao text default null,
  p_ordem text default 'data',
  p_dir text default 'desc',
  p_offset int default 0,
  p_limit int default 12,
  p_usuario text default ''
)
returns json
language plpgsql
stable
as $$
declare
  v_total_fila bigint;
  v_total bigint;
  v_atrasadas bigint;
  v_resposta bigint;
  v_itens json;
  v_dir text := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_ordem text := coalesce(p_ordem, 'data');
begin
  select count(*) into v_total_fila
  from public.visitas v
  where v.situacao = p_situacao
    and (
      p_rodada is null
      or (p_rodada >= 2 and v.rodada >= 2)
      or (p_rodada < 2 and v.rodada <= 1)
    );

  with filtrada as (
    select v.*
    from public.visitas v
    where v.situacao = p_situacao
      and (
        p_rodada is null
        or (p_rodada >= 2 and v.rodada >= 2)
        or (p_rodada < 2 and v.rodada <= 1)
      )
      and (p_codigo is null or p_codigo = '' or v.cod::text ilike '%' || p_codigo || '%')
      and (
        p_pdr is null or p_pdr = ''
        or v.pdr_nome ilike '%' || p_pdr || '%'
        or v.pdr_cnpj ilike '%' || p_pdr || '%'
        or v.pdr_cidade ilike '%' || p_pdr || '%'
      )
      and (p_de is null or v.data >= p_de)
      and (p_ate is null or v.data <= p_ate)
      and (p_consultor is null or p_consultor = '' or v.consultor = p_consultor)
      and (p_lider is null or p_lider = '' or v.lider = p_lider)
      and (p_lider_focal is null or p_lider_focal = '' or v.lider_focal = p_lider_focal)
      and (p_supervisor is null or p_supervisor = '' or v.supervisor = p_supervisor)
      and (p_regiao is null or p_regiao = '' or v.pdr_regiao = p_regiao)
  ),
  last_msg as (
    select distinct on (m.visita_cod) m.visita_cod, m.autor
    from public.mensagens_visita m
    where m.tipo = 'mensagem'
      and m.visita_cod in (select cod from filtrada)
    order by m.visita_cod, m.ts desc
  ),
  contada as (
    select
      count(*) as total,
      count(*) filter (
        where f.situacao = 'operacao-correcao'
          and coalesce(f.envio_tablet::date, f.data) < (current_date - 5)
      ) as atrasadas,
      count(*) filter (
        where lm.autor is not null and lm.autor is distinct from p_usuario
      ) as com_resposta
    from filtrada f
    left join last_msg lm on lm.visita_cod = f.cod
  )
  select total, atrasadas, com_resposta
    into v_total, v_atrasadas, v_resposta
  from contada;

  execute format(
    $q$
    with filtrada as (
      select v.*
      from public.visitas v
      where v.situacao = $1
        and (
          $2::int is null
          or ($2 >= 2 and v.rodada >= 2)
          or ($2 < 2 and v.rodada <= 1)
        )
        and ($3::text is null or $3 = '' or v.cod::text ilike '%%' || $3 || '%%')
        and (
          $4::text is null or $4 = ''
          or v.pdr_nome ilike '%%' || $4 || '%%'
          or v.pdr_cnpj ilike '%%' || $4 || '%%'
          or v.pdr_cidade ilike '%%' || $4 || '%%'
        )
        and ($5::date is null or v.data >= $5)
        and ($6::date is null or v.data <= $6)
        and ($7::text is null or $7 = '' or v.consultor = $7)
        and ($8::text is null or $8 = '' or v.lider = $8)
        and ($9::text is null or $9 = '' or v.lider_focal = $9)
        and ($10::text is null or $10 = '' or v.supervisor = $10)
        and ($11::text is null or $11 = '' or v.pdr_regiao = $11)
    ),
    pagina as (
      select *
      from filtrada
      order by
        case when $12 = 'cod' then cod end %s,
        case when $12 = 'data' then data end %s,
        case when $12 = 'pdr' then pdr_nome end %s,
        case when $12 = 'numeroVisitas' then numero_visitas end %s,
        case when $12 = 'situacao' then situacao end %s,
        case when $12 = 'consultor' then consultor end %s,
        case when $12 = 'lider' then lider end %s,
        case when $12 = 'liderFocal' then lider_focal end %s,
        case when $12 = 'supervisor' then supervisor end %s,
        case when $12 = 'cargas' then (select count(*) from public.cargas c where c.visita_cod = filtrada.cod) end %s,
        data desc,
        cod desc
      offset $13
      limit $14
    )
    select coalesce(json_agg(json_build_object(
      'cod', p.cod,
      'data', to_char(p.data, 'DD/MM/YYYY'),
      'envioTablet', to_char(coalesce(p.envio_tablet::date, p.data), 'DD/MM/YYYY'),
      'pdrNome', p.pdr_nome,
      'pdrCnpj', p.pdr_cnpj,
      'pdrCidade', p.pdr_cidade,
      'pdrUf', p.pdr_uf,
      'pdrRegiao', p.pdr_regiao,
      'numeroVisitas', p.numero_visitas,
      'situacao', p.situacao,
      'rodada', p.rodada,
      'consultor', p.consultor,
      'lider', p.lider,
      'liderFocal', p.lider_focal,
      'supervisor', p.supervisor,
      'qtdCargas', (select count(*) from public.cargas c where c.visita_cod = p.cod),
      'qtdRateio', (select count(*) from public.cargas c where c.visita_cod = p.cod and c.rateio),
      'atrasada', p.situacao = 'operacao-correcao'
        and coalesce(p.envio_tablet::date, p.data) < (current_date - 5),
      'temNovaResposta', exists (
        select 1
        from public.mensagens_visita m
        where m.visita_cod = p.cod
          and m.tipo = 'mensagem'
          and m.ts = (
            select max(m2.ts) from public.mensagens_visita m2
            where m2.visita_cod = p.cod and m2.tipo = 'mensagem'
          )
          and m.autor is distinct from $15
      )
    ) order by 1), '[]'::json)
    from pagina p
    $q$,
    v_dir, v_dir, v_dir, v_dir, v_dir, v_dir, v_dir, v_dir, v_dir, v_dir
  )
  into v_itens
  using
    p_situacao, p_rodada, p_codigo, p_pdr, p_de, p_ate,
    p_consultor, p_lider, p_lider_focal, p_supervisor, p_regiao,
    v_ordem, p_offset, p_limit, p_usuario;

  return json_build_object(
    'totalFila', v_total_fila,
    'total', coalesce(v_total, 0),
    'atrasadas', coalesce(v_atrasadas, 0),
    'comResposta', coalesce(v_resposta, 0),
    'itens', coalesce(v_itens, '[]'::json)
  );
end;
$$;

create or replace function public.csv_fila(
  p_situacao text,
  p_rodada int default null,
  p_codigo text default null,
  p_pdr text default null,
  p_de date default null,
  p_ate date default null,
  p_consultor text default null,
  p_lider text default null,
  p_lider_focal text default null,
  p_supervisor text default null,
  p_regiao text default null
)
returns text
language sql
stable
as $$
  with filtrada as (
    select v.*,
      (select count(*) from public.cargas c where c.visita_cod = v.cod) as qtd_cargas
    from public.visitas v
    where v.situacao = p_situacao
      and (
        p_rodada is null
        or (p_rodada >= 2 and v.rodada >= 2)
        or (p_rodada < 2 and v.rodada <= 1)
      )
      and (p_codigo is null or p_codigo = '' or v.cod::text ilike '%' || p_codigo || '%')
      and (
        p_pdr is null or p_pdr = ''
        or v.pdr_nome ilike '%' || p_pdr || '%'
        or v.pdr_cnpj ilike '%' || p_pdr || '%'
        or v.pdr_cidade ilike '%' || p_pdr || '%'
      )
      and (p_de is null or v.data >= p_de)
      and (p_ate is null or v.data <= p_ate)
      and (p_consultor is null or p_consultor = '' or v.consultor = p_consultor)
      and (p_lider is null or p_lider = '' or v.lider = p_lider)
      and (p_lider_focal is null or p_lider_focal = '' or v.lider_focal = p_lider_focal)
      and (p_supervisor is null or p_supervisor = '' or v.supervisor = p_supervisor)
      and (p_regiao is null or p_regiao = '' or v.pdr_regiao = p_regiao)
  )
  select
    'Código;Data;Envio tablet;PDR;CNPJ;Cidade;UF;Região;Nº visitas;Cargas;Situação;Consultor;Líder;Líder Focal;Supervisor'
    || coalesce(string_agg(
      chr(13) || chr(10) || concat_ws(
        ';',
        f.cod::text,
        to_char(f.data, 'DD/MM/YYYY'),
        to_char(coalesce(f.envio_tablet::date, f.data), 'DD/MM/YYYY'),
        replace(f.pdr_nome, ';', ','),
        f.pdr_cnpj,
        replace(f.pdr_cidade, ';', ','),
        f.pdr_uf,
        replace(f.pdr_regiao, ';', ','),
        f.numero_visitas::text,
        f.qtd_cargas::text,
        case f.situacao
          when 'central-correcao' then 'Central Correção'
          when 'operacao-correcao' then 'Operação Correção'
          when 'certificada' then 'Certificada'
          when 'cancelada' then 'Cancelada'
          else f.situacao
        end,
        replace(f.consultor, ';', ','),
        replace(f.lider, ';', ','),
        replace(f.lider_focal, ';', ','),
        replace(f.supervisor, ';', ',')
      ),
      ''
      order by f.data desc, f.cod desc
    ), '')
  from filtrada f;
$$;

create or replace function public.resumo_relatorio(
  p_de date default null,
  p_ate date default null,
  p_situacao text default null
)
returns json
language sql
stable
as $$
  with v as (
    select cod from public.visitas
    where (p_de is null or data >= p_de)
      and (p_ate is null or data <= p_ate)
      and (p_situacao is null or p_situacao = '' or situacao = p_situacao)
  )
  select json_build_object(
    'visitas', (select count(*)::int from v),
    'cargas', (
      select count(*)::int
      from public.cargas c
      where c.visita_cod in (select cod from v)
    )
  );
$$;

create or replace function public.relatorio_visitas_pagina(
  p_de date default null,
  p_ate date default null,
  p_situacao text default null,
  p_offset int default 0,
  p_limit int default 400
)
returns json
language sql
stable
as $$
  with pagina as (
    select v.*
    from public.visitas v
    where (p_de is null or v.data >= p_de)
      and (p_ate is null or v.data <= p_ate)
      and (p_situacao is null or p_situacao = '' or v.situacao = p_situacao)
    order by v.data, v.cod
    offset p_offset
    limit p_limit
  )
  select coalesce(json_agg(json_build_object(
    'Visit ID', p.cod,
    'Regional PDR', p.pdr_regiao,
    'Distritor PDR', p.pdr_distrito,
    'Estado PDR', p.pdr_uf,
    'Cidade PDR', p.pdr_cidade,
    'Nome PDR', p.pdr_nome,
    'CNPJ PDR', p.pdr_cnpj,
    'Líder', p.lider,
    'Inspetor', p.consultor,
    'Semana', to_char(p.data, 'IW')::int,
    'Modulo', p.modalidade,
    'Data Visita', to_char(p.data, 'DD/MM/YYYY'),
    'Entrada', coalesce(to_char(p.hora_inicio, 'HH24:MI'), '00:00'),
    'Saída', coalesce(to_char(p.hora_fim, 'HH24:MI'), '00:00'),
    'Houve recebimento de soja?', p.recebimento_cargas,
    'Testes executados em conformidade?', p.realizou_testes,
    'Armazenamento correto de fitas teste?', p.fitas_associaveis_cargas,
    'Houve solicitação de reteste?', p.houve_reteste,
    'Houve divergência no reteste?', '',
    'Número de caixas de fita teste disponíveis', p.caixa_fita_teste,
    'PDR forneceu dados do dia anterior?',
      case when exists (
        select 1 from public.dias_anteriores d
        where d.visita_cod = p.cod and d.informou = 'Sim'
      ) then 'Sim' else 'Não' end,
    'PDR forneceu dados do acumulado da safra?', p.acumulado_informado_pelo_pdr,
    'A: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg)', coalesce(x.a_sem_part, 0),
    'A: VOLUME TESTADA NEGATIVA (Kg)', coalesce(x.a_neg, 0),
    'A: VOLUME DECLARADA (Kg)', coalesce(x.a_dec, 0),
    'A: VOLUME TESTADA POSITVA (Kg)', coalesce(x.a_pos, 0),
    'A: VOLUME PARTICIPANTES (Kg)', coalesce(x.a_par, 0),
    'B: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg)', p.acumulado_negativa + p.acumulado_positiva,
    'B: VOLUME BIOTECNOLOGIA PATENTE INVALIDA', p.acumulado_negativa,
    'B: VOLUME BIOTECNOLOGIA PATENTE VALIDA', p.acumulado_positiva,
    'B: VOLUME PARTICIPANTES', p.acumulado_participante,
    'C: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg)', '',
    'C: VOLUME BIOTECNOLOGIA PATENTE VALIDA', '',
    'C: VOLUME TOTAL TESTADO NEGATIVO (Kg)', '',
    'C: VOLUME PARTICIPANTES (Kg)', '',
    'E: Nº TOTAL DE CARGAS RECEBIDAS SEM PARTICIPANTE', coalesce(x.e_sem_part, 0),
    'E: Nº CARGAS TESTADA NEGATIVA', coalesce(x.e_neg, 0),
    'E: Nº CARGAS TOTAL DECLARADA', coalesce(x.e_dec, 0),
    'E: Nº CARGAS TESTADA POSITIVA', coalesce(x.e_pos, 0),
    'E: Nº CARGAS PARTICIPANTES', coalesce(x.e_par, 0),
    'HORAS', nullif(regexp_replace(p.modalidade, '\D', '', 'g'), '')::int,
    'Tipo Visita', case when p.tipo_visita = 'REMOTA' then 'Remote' else 'On-Site' end,
    'Nome responsável acompanhamento', p.pdr_responsavel,
    'Situação', case p.situacao
      when 'central-correcao' then 'Central Correção'
      when 'operacao-correcao' then 'Operação Correção'
      when 'certificada' then 'Certificada'
      when 'cancelada' then 'Cancelada'
      else p.situacao
    end,
    'Rodada', p.rodada,
    'Ocorrencias', p.houve_ocorrencia
  ) order by p.data, p.cod), '[]'::json)
  from pagina p
  left join lateral (
    select
      coalesce(sum(c.peso_liquido) filter (where c.classificacao <> 'Participante'), 0) as a_sem_part,
      coalesce(sum(c.peso_liquido) filter (where c.classificacao = 'Negativa'), 0) as a_neg,
      coalesce(sum(c.peso_liquido) filter (where c.classificacao = 'Declarada'), 0) as a_dec,
      coalesce(sum(c.peso_liquido) filter (where c.classificacao = 'Positiva'), 0) as a_pos,
      coalesce(sum(c.peso_liquido) filter (where c.classificacao = 'Participante'), 0) as a_par,
      count(*) filter (where c.classificacao <> 'Participante') as e_sem_part,
      count(*) filter (where c.classificacao = 'Negativa') as e_neg,
      count(*) filter (where c.classificacao = 'Declarada') as e_dec,
      count(*) filter (where c.classificacao = 'Positiva') as e_pos,
      count(*) filter (where c.classificacao = 'Participante') as e_par
    from public.cargas c
    where c.visita_cod = p.cod
  ) x on true;
$$;

create or replace function public.relatorio_cargas_pagina(
  p_de date default null,
  p_ate date default null,
  p_situacao text default null,
  p_offset int default 0,
  p_limit int default 800
)
returns json
language sql
stable
as $$
  with pagina as (
    select c.*,
      v.pdr_regiao, v.pdr_distrito, v.pdr_uf, v.pdr_cidade, v.pdr_nome, v.pdr_cnpj
    from public.cargas c
    join public.visitas v on v.cod = c.visita_cod
    where (p_de is null or v.data >= p_de)
      and (p_ate is null or v.data <= p_ate)
      and (p_situacao is null or p_situacao = '' or v.situacao = p_situacao)
    order by v.data, v.cod, c.id
    offset p_offset
    limit p_limit
  )
  select coalesce(json_agg(json_build_object(
    'ID Visita', p.visita_cod,
    'Regional PDR', p.pdr_regiao,
    'Distrito PDR', p.pdr_distrito,
    'Estado PDR', p.pdr_uf,
    'Cidade PDR', p.pdr_cidade,
    'Nome PDR', p.pdr_nome,
    'CNPJ PDR', p.pdr_cnpj,
    'Data', coalesce(to_char(p.data, 'DD/MM/YYYY'), ''),
    'Hora', coalesce(to_char(p.hora, 'HH24:MI'), ''),
    'Tipo Documento', 'ROMANEIO',
    'Numero Documento', p.romaneio,
    'Peso Líquido', p.peso_liquido,
    'Peso Líquido com Desconto', p.peso_com_desconto,
    'Teste Resultado Monitorado', p.classificacao,
    'Produtor Nome', p.produtor,
    'Produtor CPF/CNPJ', p.cpf_cnpj_produtor,
    'Placa Caminhão', p.placa,
    'Carga Acompanhada', case when p.acompanhada then 'Sim' else 'Não' end,
    'RATEIO', case when p.rateio then 'SIM' else 'NAO' end,
    'Grupo Rateio', coalesce(p.grupo_rateio, ''),
    'ID Carga', p.id
  )), '[]'::json)
  from pagina p;
$$;

create or replace function public.zerar_visitas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate public.visitas restart identity cascade;
end;
$$;

grant execute on function public.peso_volume_liquido(numeric, numeric, jsonb) to anon, authenticated, service_role;
grant execute on function public.kpi_safra() to anon, authenticated, service_role;
grant execute on function public.fluxo_contagens() to anon, authenticated, service_role;
grant execute on function public.kpi_acumulado() to anon, authenticated, service_role;
grant execute on function public.listar_fila(text, int, text, text, date, date, text, text, text, text, text, text, text, int, int, text) to anon, authenticated, service_role;
grant execute on function public.csv_fila(text, int, text, text, date, date, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.resumo_relatorio(date, date, text) to anon, authenticated, service_role;
grant execute on function public.relatorio_visitas_pagina(date, date, text, int, int) to anon, authenticated, service_role;
grant execute on function public.relatorio_cargas_pagina(date, date, text, int, int) to anon, authenticated, service_role;
grant execute on function public.zerar_visitas() to anon, authenticated, service_role;
