import type { AnexoArquivo, MensagemSolicitacao, Solicitacao, StatusSolicitacao, TipoSolicitacao } from '../types'
import { supabase } from './cliente'

type Linha = Record<string, unknown>

const EXPIRA_URL_S = 60 * 60 * 24 * 7
const LIMITE_ANEXO_BYTES = 20 * 1024 * 1024

function erro(acao: string, e: { message?: string } | null): Error {
  return new Error(`${acao}: ${e?.message ?? 'falha desconhecida'}`)
}

export function caminhoAnexo(
  solicitacaoId: string,
  mensagemId: string,
  anexoId: string,
  nome: string,
): string {
  const base = nome.replace(/[/\\]/g, '_').replace(/\.\.+/g, '_').trim() || 'arquivo'
  return `solicitacoes/${solicitacaoId}/${mensagemId}/${anexoId}/${base}`
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function anexoDeLinha(row: Linha, urls: Map<string, string>): AnexoArquivo {
  const path = String(row.storage_path ?? '')
  return {
    id: String(row.id),
    nome: String(row.nome ?? ''),
    tamanho: n(row.tamanho),
    tipo: String(row.tipo ?? ''),
    path,
    url: urls.get(path) ?? '',
  }
}

async function urlsAssinadas(paths: string[]): Promise<Map<string, string>> {
  const sb = supabase()
  const mapa = new Map<string, string>()
  if (!sb || paths.length === 0) return mapa
  const unicos = [...new Set(paths.filter(Boolean))]
  for (let i = 0; i < unicos.length; i += 80) {
    const fatia = unicos.slice(i, i + 80)
    const { data, error: e } = await sb.storage.from('anexos').createSignedUrls(fatia, EXPIRA_URL_S)
    if (e) throw erro('assinar anexos', e)
    for (let i = 0; i < fatia.length; i++) {
      const item = data?.[i]
      if (item?.signedUrl) mapa.set(fatia[i], item.signedUrl)
    }
  }
  return mapa
}

async function enviarArquivo(
  solicitacaoId: string,
  mensagemId: string,
  anexo: AnexoArquivo,
): Promise<AnexoArquivo> {
  const sb = supabase()
  if (!sb) return anexo
  if (anexo.path && !anexo.arquivo) return anexo
  const arquivo = anexo.arquivo
  if (!arquivo) return anexo
  if (arquivo.size > LIMITE_ANEXO_BYTES) {
    throw new Error(`"${anexo.nome}" passa de 20 MB — o histórico não aceita arquivo maior.`)
  }
  const path = anexo.path ?? caminhoAnexo(solicitacaoId, mensagemId, anexo.id, anexo.nome)
  const { error: e } = await sb.storage.from('anexos').upload(path, arquivo, {
    upsert: true,
    contentType: anexo.tipo || arquivo.type || 'application/octet-stream',
  })
  if (e) throw erro(`enviar ${anexo.nome}`, e)
  if (anexo.url.startsWith('blob:')) URL.revokeObjectURL(anexo.url)
  return { ...anexo, path, arquivo: undefined, url: anexo.url }
}

export async function carregarSolicitacoes(): Promise<Solicitacao[]> {
  const sb = supabase()
  if (!sb) return []
  const [sols, parts, msgs, anexos] = await Promise.all([
    sb.from('solicitacoes').select('*').order('atualizado_em', { ascending: false }),
    sb.from('solicitacao_participantes').select('*'),
    sb.from('mensagens_solicitacao').select('*').order('ts', { ascending: true }),
    sb.from('anexos_solicitacao').select('*'),
  ])
  if (sols.error) throw erro('carregar solicitações', sols.error)
  if (parts.error) throw erro('carregar participantes', parts.error)
  if (msgs.error) throw erro('carregar mensagens', msgs.error)
  if (anexos.error) throw erro('carregar anexos', anexos.error)

  const urls = await urlsAssinadas(
    ((anexos.data ?? []) as Linha[]).map((a) => String(a.storage_path ?? '')),
  )

  const participantesPor = new Map<string, string[]>()
  for (const p of (parts.data ?? []) as Linha[]) {
    const id = String(p.solicitacao_id)
    const lista = participantesPor.get(id) ?? []
    lista.push(String(p.nome))
    participantesPor.set(id, lista)
  }

  const anexosPorMsg = new Map<string, AnexoArquivo[]>()
  for (const a of (anexos.data ?? []) as Linha[]) {
    const mid = String(a.mensagem_id)
    const lista = anexosPorMsg.get(mid) ?? []
    lista.push(anexoDeLinha(a, urls))
    anexosPorMsg.set(mid, lista)
  }

  const msgsPor = new Map<string, MensagemSolicitacao[]>()
  for (const m of (msgs.data ?? []) as Linha[]) {
    const sid = String(m.solicitacao_id)
    const lista = msgsPor.get(sid) ?? []
    lista.push({
      id: String(m.id),
      autor: String(m.autor ?? ''),
      texto: String(m.texto ?? ''),
      ts: new Date(String(m.ts)).getTime(),
      anexos: anexosPorMsg.get(String(m.id)) ?? [],
    })
    msgsPor.set(sid, lista)
  }

  return ((sols.data ?? []) as Linha[]).map((s) => {
    const id = String(s.id)
    return {
      id,
      numero: n(s.numero),
      tipo: (s.tipo as TipoSolicitacao) ?? 'insercao-dados',
      titulo: String(s.titulo ?? ''),
      descricao: String(s.descricao ?? ''),
      motivo: (s.motivo as string | null) ?? undefined,
      visitaCod: s.visita_cod != null ? n(s.visita_cod) : undefined,
      cargaId: (s.carga_id as string | null) ?? undefined,
      status: (s.status as StatusSolicitacao) ?? 'pendente',
      solicitante: String(s.solicitante ?? ''),
      participantes: participantesPor.get(id) ?? [],
      criadoEm: new Date(String(s.criado_em)).getTime(),
      atualizadoEm: new Date(String(s.atualizado_em)).getTime(),
      mensagens: msgsPor.get(id) ?? [],
    }
  })
}

async function upsertLinhaSolicitacao(s: Solicitacao, comRefs: boolean): Promise<void> {
  const sb = supabase()
  if (!sb) return
  const { error: e } = await sb.from('solicitacoes').upsert({
    id: s.id,
    numero: s.numero,
    tipo: s.tipo,
    titulo: s.titulo,
    descricao: s.descricao,
    motivo: s.motivo ?? null,
    visita_cod: comRefs ? (s.visitaCod ?? null) : null,
    carga_id: comRefs ? (s.cargaId ?? null) : null,
    status: s.status,
    solicitante: s.solicitante,
    criado_em: new Date(s.criadoEm).toISOString(),
    atualizado_em: new Date(s.atualizadoEm).toISOString(),
  })
  if (e) throw e
}

export async function persistirSolicitacao(s: Solicitacao): Promise<Solicitacao> {
  const sb = supabase()
  if (!sb) return s

  const mensagens: MensagemSolicitacao[] = []
  for (const m of s.mensagens) {
    const anexos: AnexoArquivo[] = []
    for (const a of m.anexos) anexos.push(await enviarArquivo(s.id, m.id, a))
    mensagens.push({ ...m, anexos })
  }
  const gravada: Solicitacao = { ...s, mensagens }

  try {
    await upsertLinhaSolicitacao(gravada, true)
  } catch (e) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : ''
    if (/foreign key|visita_cod|carga_id/i.test(msg)) await upsertLinhaSolicitacao(gravada, false)
    else throw erro('solicitação', e as { message?: string })
  }

  const { error: ePartDel } = await sb.from('solicitacao_participantes').delete().eq('solicitacao_id', s.id)
  if (ePartDel) throw erro('participantes', ePartDel)
  if (s.participantes.length) {
    const { error: ePart } = await sb.from('solicitacao_participantes').insert(
      s.participantes.map((nome) => ({ solicitacao_id: s.id, nome })),
    )
    if (ePart) throw erro('participantes', ePart)
  }

  const { error: eMsg } = await sb.from('mensagens_solicitacao').upsert(
    mensagens.map((m) => ({
      id: m.id,
      solicitacao_id: s.id,
      autor: m.autor,
      texto: m.texto,
      ts: new Date(m.ts).toISOString(),
    })),
  )
  if (eMsg) throw erro('mensagens', eMsg)

  const idsMsg = mensagens.map((m) => m.id)
  const { data: msgsAtuais } = await sb.from('mensagens_solicitacao').select('id').eq('solicitacao_id', s.id)
  const msgsSobra = ((msgsAtuais ?? []) as Linha[])
    .map((r) => String(r.id))
    .filter((id) => !idsMsg.includes(id))
  if (msgsSobra.length) await sb.from('mensagens_solicitacao').delete().in('id', msgsSobra)

  const linhasAnexo = mensagens.flatMap((m) =>
    m.anexos
      .filter((a) => a.path)
      .map((a) => ({
        id: a.id,
        mensagem_id: m.id,
        nome: a.nome,
        tamanho: a.tamanho,
        tipo: a.tipo,
        storage_path: a.path as string,
      })),
  )
  if (linhasAnexo.length) {
    const { error: eAnx } = await sb.from('anexos_solicitacao').upsert(linhasAnexo)
    if (eAnx) throw erro('anexos', eAnx)
  }

  const idsAnexo = linhasAnexo.map((a) => a.id)
  const { data: anxAtuais } = await sb
    .from('anexos_solicitacao')
    .select('id, mensagem_id')
    .in('mensagem_id', idsMsg.length ? idsMsg : ['00000000-0000-0000-0000-000000000000'])
  const anxSobra = ((anxAtuais ?? []) as Linha[])
    .map((r) => String(r.id))
    .filter((id) => !idsAnexo.includes(id))
  if (anxSobra.length) await sb.from('anexos_solicitacao').delete().in('id', anxSobra)

  const urls = await urlsAssinadas(mensagens.flatMap((m) => m.anexos.map((a) => a.path ?? '')))
  return {
    ...gravada,
    mensagens: mensagens.map((m) => ({
      ...m,
      anexos: m.anexos.map((a) => ({
        ...a,
        arquivo: undefined,
        url: (a.path && urls.get(a.path)) || a.url,
      })),
    })),
  }
}

export async function apagarSolicitacao(id: string): Promise<void> {
  const sb = supabase()
  if (!sb) return
  const { data: msgs } = await sb.from('mensagens_solicitacao').select('id').eq('solicitacao_id', id)
  const idsMsg = ((msgs ?? []) as Linha[]).map((m) => String(m.id))
  if (idsMsg.length) {
    const { data: anexos } = await sb.from('anexos_solicitacao').select('storage_path').in('mensagem_id', idsMsg)
    const paths = ((anexos ?? []) as Linha[]).map((a) => String(a.storage_path ?? '')).filter(Boolean)
    if (paths.length) await sb.storage.from('anexos').remove(paths)
  }
  const { error: e } = await sb.from('solicitacoes').delete().eq('id', id)
  if (e) throw erro('excluir solicitação', e)
}
