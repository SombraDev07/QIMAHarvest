-- Pedido de exclusão/inserção guarda o código mesmo se a visita ainda não
-- estiver no banco, e o anexo vive no bucket `anexos` (não no chat local).

alter table public.solicitacoes
  drop constraint if exists solicitacoes_visita_cod_fkey;

alter table public.solicitacoes
  drop constraint if exists solicitacoes_carga_id_fkey;

alter table public.solicitacoes
  alter column numero set default nextval('public.solicitacao_numero_seq');
