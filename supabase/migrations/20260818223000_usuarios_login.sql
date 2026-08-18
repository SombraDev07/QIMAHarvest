-- Login do SPA: id no formato U-001 (texto) e senha no cadastro.
-- Enquanto não há Auth, a senha segue em texto — o mesmo modelo do localStorage.

alter table public.usuarios
  alter column id drop default;

alter table public.usuarios
  alter column id type text using id::text;

alter table public.usuarios
  add column if not exists senha text;

insert into public.usuarios (id, nome, login, senha, email, telefone, cpf, perfil, situacao)
values
  (
    'U-001',
    'Bruno de Souza Ferreira',
    'Bruno.Ferreira',
    'Qima123',
    'bruno.ferreira@qima.com',
    '(54) 99101-2233',
    '123.456.780-62',
    'Admin',
    'Ativo'
  ),
  (
    'U-002',
    'Ederlan Qima',
    'Ederlan.Qima',
    'Qima123',
    'ederlan.qima@qima.com',
    '(51) 99202-3344',
    '123.456.787-39',
    'Admin',
    'Ativo'
  )
on conflict (id) do update set
  nome = excluded.nome,
  login = excluded.login,
  senha = excluded.senha,
  email = excluded.email,
  telefone = excluded.telefone,
  cpf = excluded.cpf,
  perfil = excluded.perfil,
  situacao = excluded.situacao;
