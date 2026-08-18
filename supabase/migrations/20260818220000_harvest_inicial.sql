-- QIMA Harvest — schema operacional (Supabase / Postgres)
-- O front (Vercel) fala só com estas tabelas. Snowflake fica para BI depois.

create extension if not exists "pgcrypto";

/* ------------------------------------------------------------------ *
 * Função de updated_at
 * ------------------------------------------------------------------ */
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

/* ------------------------------------------------------------------ *
 * Cadastro
 * ------------------------------------------------------------------ */
create table public.pdrs (
  id text primary key,
  nome text not null,
  cnpj text not null,
  cidade text not null default '',
  uf text not null default '',
  situacao text not null default 'Ativo'
    check (situacao in ('Ativo', 'Inativo')),
  latitude text,
  longitude text,
  telefone text,
  email text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pdrs_cnpj_idx on public.pdrs (cnpj);
create index pdrs_nome_idx on public.pdrs (nome);

create table public.usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  nome text not null,
  login text not null unique,
  email text,
  telefone text,
  cpf text,
  perfil text not null
    check (perfil in (
      'Admin', 'Support', 'Information Analyst', 'Coordinator', 'Supervisor',
      'Strategic Leader', 'Operational Leader', 'Auditor',
      'Regional GR (Client)', 'RTV (Client)', 'Bayer SP (Client)',
      'Operational Monitor'
    )),
  situacao text not null default 'Ativo'
    check (situacao in ('Ativo', 'Inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index usuarios_perfil_idx on public.usuarios (perfil);

create table public.parametros (
  id int primary key default 1 check (id = 1),
  limite_desconto_erro numeric not null default 25,
  min_digitos_placa int not null default 6,
  salto_max_romaneio int not null default 500,
  limite_dia_anterior_tecnologia numeric not null default 3000000,
  tolerancia_horario_min int not null default 60,
  caixa_fita_min int not null default 1,
  caixa_fita_max int not null default 100,
  mensagem_erro_chat text not null default '⚠️ {quantidade} erro(s) encontrado(s) na visita:',
  regras_ativas jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.parametros (id) values (1);

/* ------------------------------------------------------------------ *
 * Visita — cabeçalho + snapshot do PDR no dia (a planilha traz o PDR
 * embutido; o catálogo é outro registro, ligado quando o CNPJ casa)
 * ------------------------------------------------------------------ */
create table public.visitas (
  cod bigint primary key,
  data date not null,
  envio_tablet timestamptz,
  pdr_id text references public.pdrs (id) on delete set null,
  pdr_nome text not null default '',
  pdr_cnpj text not null default '',
  pdr_cidade text not null default '',
  pdr_uf text not null default '',
  pdr_regiao text not null default '',
  pdr_distrito text not null default '',
  pdr_endereco text not null default '',
  pdr_telefone text not null default '',
  pdr_responsavel text not null default '',
  pdr_capacidade_estatica numeric not null default 0,
  pdr_tipo_unidade text not null default 'ARMAZÉM'
    check (pdr_tipo_unidade in ('ARMAZÉM', 'COOPERATIVA', 'ESMAGADORA', 'TERMINAL')),
  numero_visitas int not null default 1,
  situacao text not null default 'central-correcao'
    check (situacao in ('central-correcao', 'operacao-correcao', 'certificada', 'cancelada')),
  rodada int not null default 1,
  consultor text not null default '',
  lider text not null default '',
  lider_focal text not null default '',
  supervisor text not null default '',
  tipo_visita text not null default 'PRESENCIAL'
    check (tipo_visita in ('PRESENCIAL', 'REMOTA')),
  modalidade text not null default '8H'
    check (modalidade in ('1H', '2H', '4H', '8H')),
  hora_inicio time,
  hora_fim time,
  duracao text,
  primeira_visita boolean not null default false,
  pdr_mista boolean not null default false,
  cinco_estrelas boolean not null default false,
  motivo text,
  -- bloco 2
  visita_iniciada text not null default 'Não' check (visita_iniciada in ('Sim', 'Não')),
  recebimento_cargas text not null default 'Não' check (recebimento_cargas in ('Sim', 'Não')),
  realizou_testes text not null default 'Não' check (realizou_testes in ('Sim', 'Não')),
  houve_reteste text not null default 'Não' check (houve_reteste in ('Sim', 'Não')),
  reteste_solicitante text not null default '',
  reteste_motivo text not null default '',
  houve_ocorrencia text not null default 'Não' check (houve_ocorrencia in ('Sim', 'Não')),
  caixa_fita_teste int not null default 1,
  fitas_associaveis_cargas text not null default 'Não' check (fitas_associaveis_cargas in ('Sim', 'Não')),
  -- bloco 3
  acumulado_informado_pelo_pdr text not null default 'Não' check (acumulado_informado_pelo_pdr in ('Sim', 'Não')),
  acumulado_origem text not null default 'PDR' check (acumulado_origem in ('PDR', 'RTV', 'B2B')),
  acumulado_negativa numeric not null default 0,
  acumulado_declarada numeric not null default 0,
  acumulado_positiva numeric not null default 0,
  acumulado_participante numeric not null default 0,
  -- validação / import
  ultima_validacao_por text,
  ultima_validacao_ts timestamptz,
  ultima_validacao_erros int,
  ultima_validacao_atencoes int,
  aviso_import jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index visitas_situacao_idx on public.visitas (situacao, rodada);
create index visitas_pdr_cnpj_data_idx on public.visitas (pdr_cnpj, data);
create index visitas_data_idx on public.visitas (data);
create index visitas_consultor_idx on public.visitas (consultor);

create sequence if not exists public.visita_cod_seq;
select setval('public.visita_cod_seq', 1, false);

create table public.procedimentos_visita (
  id uuid primary key default gen_random_uuid(),
  visita_cod bigint not null references public.visitas (cod) on delete cascade,
  item text not null,
  resposta text not null check (resposta in ('Sim', 'Não', 'N/A')),
  obs text,
  ordem int not null default 0
);

create index procedimentos_visita_cod_idx on public.procedimentos_visita (visita_cod);

create table public.recebimentos_mes (
  id uuid primary key default gen_random_uuid(),
  visita_cod bigint not null references public.visitas (cod) on delete cascade,
  mes text not null,
  toneladas numeric not null default 0,
  fornecedores int not null default 0,
  cargas int not null default 0
);

create index recebimentos_mes_visita_idx on public.recebimentos_mes (visita_cod);

create table public.dias_anteriores (
  id text primary key,
  visita_cod bigint not null references public.visitas (cod) on delete cascade,
  data date not null,
  informou text not null default 'Não' check (informou in ('Sim', 'Não')),
  negativa numeric not null default 0,
  declarada numeric not null default 0,
  positiva numeric not null default 0,
  participante numeric not null default 0,
  unique (visita_cod, data)
);

create index dias_anteriores_visita_idx on public.dias_anteriores (visita_cod);

/* ------------------------------------------------------------------ *
 * Cargas
 * ------------------------------------------------------------------ */
create table public.cargas (
  id text primary key,
  visita_cod bigint not null references public.visitas (cod) on delete cascade,
  data date,
  hora time,
  placa text not null default '',
  produtor text not null default '',
  cpf_cnpj_produtor text not null default '',
  romaneio text not null default '',
  peso_liquido numeric not null default 0,
  peso_com_desconto numeric not null default 0,
  classificacao text not null default 'Participante'
    check (classificacao in ('Negativa', 'Declarada', 'Positiva', 'Participante')),
  rateio boolean not null default false,
  grupo_rateio text,
  observacao text,
  acompanhada boolean not null default true,
  foto_path text,
  foto_url text,
  tecnologia_testada boolean,
  nao_informado jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cargas_visita_idx on public.cargas (visita_cod);
create index cargas_romaneio_idx on public.cargas (romaneio);
create index cargas_placa_idx on public.cargas (placa);
create index cargas_grupo_idx on public.cargas (grupo_rateio);

create table public.leituras_foto (
  id uuid primary key default gen_random_uuid(),
  carga_id text not null references public.cargas (id) on delete cascade,
  fonte text not null default 'requer-visao'
    check (fonte in ('svg-mock', 'requer-visao', 'visao-api')),
  carga_id_lida text,
  placa_lida text,
  notas_fiscais jsonb not null default '[]'::jsonb,
  status text not null default 'pendente'
    check (status in ('ok', 'divergente', 'pendente', 'sem-foto')),
  modelo text,
  bruto jsonb,
  lida_em timestamptz not null default now()
);

create index leituras_foto_carga_idx on public.leituras_foto (carga_id, lida_em desc);

create table public.ocorrencias (
  id text primary key,
  visita_cod bigint not null references public.visitas (cod) on delete cascade,
  tipo text not null default '',
  gravidade text not null default 'Baixa' check (gravidade in ('Baixa', 'Média', 'Alta')),
  descricao text not null default '',
  data date,
  status text not null default 'Aberta'
    check (status in ('Aberta', 'Em análise', 'Resolvida')),
  carga_id text references public.cargas (id) on delete set null
);

create index ocorrencias_visita_idx on public.ocorrencias (visita_cod);

create table public.mensagens_visita (
  id text primary key,
  visita_cod bigint not null references public.visitas (cod) on delete cascade,
  autor text not null,
  papel text not null default '',
  texto text not null,
  ts timestamptz not null default now(),
  tipo text not null default 'mensagem' check (tipo in ('mensagem', 'sistema')),
  responsavel text
);

create index mensagens_visita_idx on public.mensagens_visita (visita_cod, ts);

create table public.erros_liberados (
  id uuid primary key default gen_random_uuid(),
  visita_cod bigint not null references public.visitas (cod) on delete cascade,
  alerta_id text not null,
  regra text not null,
  justificativa text not null,
  por text not null,
  ts timestamptz not null default now()
);

create index erros_liberados_visita_idx on public.erros_liberados (visita_cod);

create table public.log_alteracoes (
  id text primary key,
  visita_cod bigint not null references public.visitas (cod) on delete cascade,
  ts timestamptz not null default now(),
  por text not null,
  origem text not null check (origem in ('import-correcao', 'edicao')),
  planilha text not null default 'tela',
  tipo text not null check (tipo in ('carga', 'dia-anterior', 'acumulado')),
  chave text not null default '',
  resumo text not null
);

create index log_alteracoes_visita_idx on public.log_alteracoes (visita_cod, ts desc);

/* ------------------------------------------------------------------ *
 * Solicitações
 * ------------------------------------------------------------------ */
create table public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique,
  tipo text not null check (tipo in ('exclusao-carga', 'insercao-dados', 'acumulado')),
  titulo text not null,
  descricao text not null default '',
  motivo text,
  visita_cod bigint references public.visitas (cod) on delete set null,
  carga_id text references public.cargas (id) on delete set null,
  status text not null default 'pendente'
    check (status in ('pendente', 'analise', 'feito')),
  solicitante text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create sequence if not exists public.solicitacao_numero_seq owned by public.solicitacoes.numero;

create table public.solicitacao_participantes (
  solicitacao_id uuid not null references public.solicitacoes (id) on delete cascade,
  nome text not null,
  primary key (solicitacao_id, nome)
);

create table public.mensagens_solicitacao (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes (id) on delete cascade,
  autor text not null,
  texto text not null,
  ts timestamptz not null default now()
);

create table public.anexos_solicitacao (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.mensagens_solicitacao (id) on delete cascade,
  nome text not null,
  tamanho int not null default 0,
  tipo text not null default '',
  storage_path text not null
);

/* ------------------------------------------------------------------ *
 * Import / export — jobs, não o dado de negócio
 * ------------------------------------------------------------------ */
create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null
    check (tipo in ('visitas', 'cargas', 'pdrs', 'acumulado', 'correcao')),
  nome_arquivo text not null,
  importado_por text not null,
  ts timestamptz not null default now(),
  resumo jsonb not null default '{}'::jsonb
);

create table public.importacao_itens (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.importacoes (id) on delete cascade,
  severidade text not null check (severidade in ('sucesso', 'alerta', 'vermelho')),
  visita_cod bigint,
  criou_registro boolean not null default false,
  motivo text not null default '',
  payload jsonb not null default '{}'::jsonb
);

create index importacao_itens_job_idx on public.importacao_itens (importacao_id);

create table public.exportacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('visitas', 'cargas')),
  gerado_por text not null,
  ts timestamptz not null default now(),
  recorte jsonb not null default '{}'::jsonb,
  linhas int not null default 0
);

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidencias', 'evidencias', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']::text[]),
  ('anexos', 'anexos', false, 20971520, null)
on conflict (id) do nothing;

/* ------------------------------------------------------------------ *
 * Triggers
 * ------------------------------------------------------------------ */
create trigger pdrs_updated before update on public.pdrs
  for each row execute function public.set_updated_at();
create trigger usuarios_updated before update on public.usuarios
  for each row execute function public.set_updated_at();
create trigger parametros_updated before update on public.parametros
  for each row execute function public.set_updated_at();
create trigger visitas_updated before update on public.visitas
  for each row execute function public.set_updated_at();
create trigger cargas_updated before update on public.cargas
  for each row execute function public.set_updated_at();
create trigger solicitacoes_updated before update on public.solicitacoes
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ *
 * RLS — o front usa a anon key + JWT do Auth. Sem login, nada vaza.
 * postgres / service_role ignoram RLS (migrations e admin).
 * ------------------------------------------------------------------ */
alter table public.pdrs enable row level security;
alter table public.usuarios enable row level security;
alter table public.parametros enable row level security;
alter table public.visitas enable row level security;
alter table public.procedimentos_visita enable row level security;
alter table public.recebimentos_mes enable row level security;
alter table public.dias_anteriores enable row level security;
alter table public.cargas enable row level security;
alter table public.leituras_foto enable row level security;
alter table public.ocorrencias enable row level security;
alter table public.mensagens_visita enable row level security;
alter table public.erros_liberados enable row level security;
alter table public.log_alteracoes enable row level security;
alter table public.solicitacoes enable row level security;
alter table public.solicitacao_participantes enable row level security;
alter table public.mensagens_solicitacao enable row level security;
alter table public.anexos_solicitacao enable row level security;
alter table public.importacoes enable row level security;
alter table public.importacao_itens enable row level security;
alter table public.exportacoes enable row level security;

create or replace function public.usuario_atual()
returns public.usuarios
language sql
stable
security definer
set search_path = public
as $$
  select u.*
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.situacao = 'Ativo'
  limit 1;
$$;

create or replace function public.pode_editar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuario_atual() u
    where u.perfil in (
      'Admin', 'Strategic Leader', 'Operational Leader', 'Information Analyst'
    )
  );
$$;

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuario_atual() u where u.perfil = 'Admin'
  );
$$;

-- leitura: qualquer usuário autenticado e ativo
do $$
declare
  t text;
begin
  foreach t in array array[
    'pdrs', 'parametros', 'visitas', 'procedimentos_visita', 'recebimentos_mes',
    'dias_anteriores', 'cargas', 'leituras_foto', 'ocorrencias', 'mensagens_visita',
    'erros_liberados', 'log_alteracoes', 'solicitacoes', 'solicitacao_participantes',
    'mensagens_solicitacao', 'anexos_solicitacao', 'importacoes', 'importacao_itens',
    'exportacoes'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.usuario_atual() is not null)',
      t || '_select', t
    );
  end loop;
end $$;

create policy usuarios_select_proprio on public.usuarios
  for select to authenticated
  using (auth_user_id = auth.uid() or public.eh_admin());

-- escrita operacional
do $$
declare
  t text;
begin
  foreach t in array array[
    'visitas', 'procedimentos_visita', 'recebimentos_mes', 'dias_anteriores',
    'cargas', 'leituras_foto', 'ocorrencias', 'mensagens_visita',
    'erros_liberados', 'log_alteracoes'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.pode_editar()) with check (public.pode_editar())',
      t || '_write', t
    );
  end loop;
end $$;

-- chat da visita: quem está logado manda mensagem (não só quem edita carga)
create policy mensagens_visita_insert_todos on public.mensagens_visita
  for insert to authenticated
  with check (public.usuario_atual() is not null);

create policy pdrs_write on public.pdrs
  for all to authenticated
  using (public.pode_editar())
  with check (public.pode_editar());

create policy usuarios_write on public.usuarios
  for all to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

create policy parametros_write on public.parametros
  for update to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

create policy solicitacoes_write on public.solicitacoes
  for all to authenticated
  using (public.usuario_atual() is not null)
  with check (public.usuario_atual() is not null);

create policy solicitacao_participantes_write on public.solicitacao_participantes
  for all to authenticated
  using (public.usuario_atual() is not null)
  with check (public.usuario_atual() is not null);

create policy mensagens_solicitacao_write on public.mensagens_solicitacao
  for all to authenticated
  using (public.usuario_atual() is not null)
  with check (public.usuario_atual() is not null);

create policy anexos_solicitacao_write on public.anexos_solicitacao
  for all to authenticated
  using (public.usuario_atual() is not null)
  with check (public.usuario_atual() is not null);

create policy importacoes_write on public.importacoes
  for all to authenticated
  using (public.pode_editar())
  with check (public.pode_editar());

create policy importacao_itens_write on public.importacao_itens
  for all to authenticated
  using (public.pode_editar())
  with check (public.pode_editar());

create policy exportacoes_write on public.exportacoes
  for insert to authenticated
  with check (public.usuario_atual() is not null);

-- storage: pasta da evidência / anexo só com login
create policy evidencias_select on storage.objects
  for select to authenticated
  using (bucket_id = 'evidencias' and public.usuario_atual() is not null);

create policy evidencias_write on storage.objects
  for all to authenticated
  using (bucket_id = 'evidencias' and public.pode_editar())
  with check (bucket_id = 'evidencias' and public.pode_editar());

create policy anexos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'anexos' and public.usuario_atual() is not null);

create policy anexos_write on storage.objects
  for all to authenticated
  using (bucket_id = 'anexos' and public.usuario_atual() is not null)
  with check (bucket_id = 'anexos' and public.usuario_atual() is not null);
