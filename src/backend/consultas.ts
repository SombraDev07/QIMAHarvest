import type { Carga, Classificacao, SituacaoId, Visita } from '../types'
import { pesoVolumeLiquido } from '../types'
import { dataIsoParaBr } from '../format'
import { COLUNAS_CARGA, COLUNAS_VISITA, montarCsvDeObjetos } from '../relatorios/planilhas'
import { conferirCargaComFoto, type ItemFilaFoto } from '../fotos/evidencia'
import { supabase } from './cliente'
import { cargaDeLinha } from './persistir'

export type KpiSafra = {
  total: number
  certificadas: number
  emCorrecao: number
  acompanhadas: number
  rateadas: number
  volumeKg: number
}

export const KPI_VAZIO: KpiSafra = {
  total: 0,
  certificadas: 0,
  emCorrecao: 0,
  acompanhadas: 0,
  rateadas: 0,
  volumeKg: 0,
}

export type FluxoChave = 'c1' | 'o1' | 'c2' | 'o2' | 'canc' | 'cert'
export type FluxoQtd = Record<FluxoChave, number>

export const FLUXO_VAZIO: FluxoQtd = { c1: 0, o1: 0, c2: 0, o2: 0, canc: 0, cert: 0 }

export type VisitaResumo = {
  cod: number
  data: string
  envioTablet: string
  pdr: { nome: string; cnpj: string; cidade: string; uf: string; regiao: string }
  numeroVisitas: number
  situacao: SituacaoId
  rodada: number
  consultor: string
  lider: string
  liderFocal: string
  supervisor: string
  qtdCargas: number
  qtdRateio: number
  atrasada: boolean
  temNovaResposta: boolean
}

export type FiltroFila = {
  situacao: SituacaoId
  rodada: number | null
  codigo: string
  pdr: string
  de: string
  ate: string
  consultor: string
  lider: string
  liderFocal: string
  supervisor: string
  regiao: string
  ordem: string
  dir: 'asc' | 'desc'
  pagina: number
  porPagina: number
  usuario: string
}

export type ResultadoFila = {
  itens: VisitaResumo[]
  total: number
  totalFila: number
  atrasadas: number
  comResposta: number
}

export type KpiAcumulado = {
  registros: number
  negativa: number
  declarada: number
  positiva: number
  participante: number
}

export type VisitaAcumuladoResumo = {
  cod: number
  data: string
  pdr: { nome: string; cnpj: string; cidade: string; uf: string }
  valores: Record<Classificacao, number>
}

function erro(acao: string, e: { message?: string } | null): Error {
  return new Error(`${acao}: ${e?.message ?? 'falha desconhecida'}`)
}

const CHAVES_FLUXO: FluxoChave[] = ['c1', 'o1', 'c2', 'o2', 'canc', 'cert']

export function kpiDeVisitas(visitas: Visita[]): KpiSafra {
  const acompanhadas = visitas.flatMap((v) => v.cargas.filter((c) => c.acompanhada))
  return {
    total: visitas.length,
    certificadas: visitas.filter((v) => v.situacao === 'certificada').length,
    emCorrecao: visitas.filter(
      (v) => v.situacao === 'central-correcao' || v.situacao === 'operacao-correcao',
    ).length,
    acompanhadas: acompanhadas.length,
    rateadas: acompanhadas.filter((c) => c.rateio).length,
    volumeKg: acompanhadas.reduce((s, c) => s + pesoVolumeLiquido(c), 0),
  }
}

export function fluxoDeVisitas(visitas: Visita[]): FluxoQtd {
  const q = { ...FLUXO_VAZIO }
  for (const v of visitas) {
    if (v.situacao === 'cancelada') q.canc += 1
    else if (v.situacao === 'certificada') q.cert += 1
    else if (v.situacao === 'central-correcao') q[v.rodada >= 2 ? 'c2' : 'c1'] += 1
    else if (v.situacao === 'operacao-correcao') q[v.rodada >= 2 ? 'o2' : 'o1'] += 1
  }
  return q
}

export function resumoDeVisita(v: Visita, usuario: string, agora = new Date()): VisitaResumo {
  const mensagens = v.mensagens.filter((m) => m.tipo === 'mensagem')
  const ultima = mensagens.reduce<(typeof mensagens)[0] | null>(
    (a, b) => (a && a.ts > b.ts ? a : b),
    null,
  )
  const envio = v.envioTablet || v.data
  const [d, m, a] = envio.split('/').map(Number)
  const hoje = new Date(agora)
  hoje.setHours(0, 0, 0, 0)
  const dias = Number.isFinite(a)
    ? Math.floor((hoje.getTime() - new Date(a, m - 1, d).getTime()) / 86400000)
    : 0
  return {
    cod: v.cod,
    data: v.data,
    envioTablet: envio,
    pdr: {
      nome: v.pdr.nome,
      cnpj: v.pdr.cnpj,
      cidade: v.pdr.cidade,
      uf: v.pdr.uf,
      regiao: v.pdr.regiao,
    },
    numeroVisitas: v.numeroVisitas,
    situacao: v.situacao,
    rodada: v.rodada,
    consultor: v.consultor,
    lider: v.lider,
    liderFocal: v.liderFocal,
    supervisor: v.supervisor,
    qtdCargas: v.cargas.length,
    qtdRateio: v.cargas.filter((c) => c.rateio).length,
    atrasada: v.situacao === 'operacao-correcao' && dias > 5,
    temNovaResposta: Boolean(ultima && ultima.autor !== usuario),
  }
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export async function consultarKpiSafra(): Promise<KpiSafra> {
  const sb = supabase()
  if (!sb) return KPI_VAZIO
  const { data, error: e } = await sb.rpc('kpi_safra')
  if (e) throw erro('KPI', e)
  const r = (data ?? {}) as Record<string, unknown>
  return {
    total: n(r.total),
    certificadas: n(r.certificadas),
    emCorrecao: n(r.emCorrecao),
    acompanhadas: n(r.acompanhadas),
    rateadas: n(r.rateadas),
    volumeKg: n(r.volumeKg),
  }
}

export async function consultarFluxo(): Promise<FluxoQtd> {
  const sb = supabase()
  if (!sb) return { ...FLUXO_VAZIO }
  const { data, error: e } = await sb.rpc('fluxo_contagens')
  if (e) throw erro('fluxo', e)
  const r = (data ?? {}) as Record<string, unknown>
  const q = { ...FLUXO_VAZIO }
  for (const k of CHAVES_FLUXO) q[k] = n(r[k])
  return q
}

export async function consultarKpiAcumulado(): Promise<KpiAcumulado> {
  const sb = supabase()
  if (!sb) return { registros: 0, negativa: 0, declarada: 0, positiva: 0, participante: 0 }
  const { data, error: e } = await sb.rpc('kpi_acumulado')
  if (e) throw erro('KPI acumulado', e)
  const r = (data ?? {}) as Record<string, unknown>
  return {
    registros: n(r.registros),
    negativa: n(r.negativa),
    declarada: n(r.declarada),
    positiva: n(r.positiva),
    participante: n(r.participante),
  }
}

function itemFila(r: Record<string, unknown>): VisitaResumo {
  return {
    cod: n(r.cod),
    data: String(r.data ?? ''),
    envioTablet: String(r.envioTablet ?? ''),
    pdr: {
      nome: String(r.pdrNome ?? ''),
      cnpj: String(r.pdrCnpj ?? ''),
      cidade: String(r.pdrCidade ?? ''),
      uf: String(r.pdrUf ?? ''),
      regiao: String(r.pdrRegiao ?? ''),
    },
    numeroVisitas: n(r.numeroVisitas),
    situacao: (r.situacao as SituacaoId) ?? 'central-correcao',
    rodada: n(r.rodada) || 1,
    consultor: String(r.consultor ?? ''),
    lider: String(r.lider ?? ''),
    liderFocal: String(r.liderFocal ?? ''),
    supervisor: String(r.supervisor ?? ''),
    qtdCargas: n(r.qtdCargas),
    qtdRateio: n(r.qtdRateio),
    atrasada: Boolean(r.atrasada),
    temNovaResposta: Boolean(r.temNovaResposta),
  }
}

export async function listarFila(f: FiltroFila): Promise<ResultadoFila> {
  const sb = supabase()
  if (!sb) return { itens: [], total: 0, totalFila: 0, atrasadas: 0, comResposta: 0 }
  const { data, error: e } = await sb.rpc('listar_fila', {
    p_situacao: f.situacao,
    p_rodada: f.rodada,
    p_codigo: f.codigo || null,
    p_pdr: f.pdr || null,
    p_de: f.de || null,
    p_ate: f.ate || null,
    p_consultor: f.consultor || null,
    p_lider: f.lider || null,
    p_lider_focal: f.liderFocal || null,
    p_supervisor: f.supervisor || null,
    p_regiao: f.regiao || null,
    p_ordem: f.ordem,
    p_dir: f.dir,
    p_offset: (f.pagina - 1) * f.porPagina,
    p_limit: f.porPagina,
    p_usuario: f.usuario,
  })
  if (e) throw erro('listar fila', e)
  const r = (data ?? {}) as Record<string, unknown>
  const itens = Array.isArray(r.itens) ? (r.itens as Record<string, unknown>[]).map(itemFila) : []
  return {
    itens,
    total: n(r.total),
    totalFila: n(r.totalFila),
    atrasadas: n(r.atrasadas),
    comResposta: n(r.comResposta),
  }
}

export async function csvFila(f: Omit<FiltroFila, 'ordem' | 'dir' | 'pagina' | 'porPagina' | 'usuario'>): Promise<string> {
  const sb = supabase()
  if (!sb) return ''
  const { data, error: e } = await sb.rpc('csv_fila', {
    p_situacao: f.situacao,
    p_rodada: f.rodada,
    p_codigo: f.codigo || null,
    p_pdr: f.pdr || null,
    p_de: f.de || null,
    p_ate: f.ate || null,
    p_consultor: f.consultor || null,
    p_lider: f.lider || null,
    p_lider_focal: f.liderFocal || null,
    p_supervisor: f.supervisor || null,
    p_regiao: f.regiao || null,
  })
  if (e) throw erro('exportar fila', e)
  return String(data ?? '')
}

function escaparIlike(termo: string): string {
  return termo.replace(/[%*,]/g, ' ').trim()
}

export type VisitaBusca = {
  cod: number
  data: string
  situacao: SituacaoId
  consultor: string
  pdr: { nome: string; cnpj: string; cidade: string; uf: string }
}

export async function buscarVisitas(termo: string, limite = 8): Promise<VisitaBusca[]> {
  const sb = supabase()
  const t = termo.trim()
  if (!sb || t.length < 2) return []
  const limpo = escaparIlike(t)
  const soDigitos = t.replace(/\D/g, '')
  const or = [
    `pdr_nome.ilike.%${limpo}%`,
    `pdr_cidade.ilike.%${limpo}%`,
    `consultor.ilike.%${limpo}%`,
  ]
  if (soDigitos) {
    or.push(`cod.eq.${Number(soDigitos) || 0}`)
    or.push(`pdr_cnpj.ilike.%${soDigitos}%`)
  }
  const { data, error: e } = await sb
    .from('visitas')
    .select('cod, data, situacao, consultor, pdr_nome, pdr_cnpj, pdr_cidade, pdr_uf')
    .or(or.join(','))
    .limit(limite)
  if (e) throw erro('buscar visitas', e)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    cod: n(r.cod),
    data: r.data ? dataIsoParaBr(String(r.data)) : '',
    situacao: (r.situacao as SituacaoId) ?? 'central-correcao',
    consultor: String(r.consultor ?? ''),
    pdr: {
      nome: String(r.pdr_nome ?? ''),
      cnpj: String(r.pdr_cnpj ?? ''),
      cidade: String(r.pdr_cidade ?? ''),
      uf: String(r.pdr_uf ?? ''),
    },
  }))
}

export async function resumoExportacao(de: string, ate: string, situacao: string): Promise<{
  visitas: number
  cargas: number
}> {
  const sb = supabase()
  if (!sb) return { visitas: 0, cargas: 0 }
  const { data, error: e } = await sb.rpc('resumo_relatorio', {
    p_de: de || null,
    p_ate: ate || null,
    p_situacao: situacao === 'Todas' ? null : situacao,
  })
  if (e) throw erro('resumo relatório', e)
  const r = (data ?? {}) as Record<string, unknown>
  return { visitas: n(r.visitas), cargas: n(r.cargas) }
}

function linhasDaRpc(data: unknown): Record<string, unknown>[] {
  if (data == null) return []
  if (Array.isArray(data)) {
    if (data.length === 0) return []
    if (typeof data[0] === 'object' && data[0] !== null) return data as Record<string, unknown>[]
  }
  if (typeof data === 'object') return data as Record<string, unknown>[]
  return []
}

export async function csvRelatorioVisitas(de: string, ate: string, situacao: string): Promise<string> {
  const sb = supabase()
  if (!sb) return montarCsvDeObjetos(COLUNAS_VISITA.map((c) => c.cabecalho), [])
  const partes: string[] = []
  let offset = 0
  const limite = 400
  for (;;) {
    const { data, error: e } = await sb.rpc('relatorio_visitas_pagina', {
      p_de: de || null,
      p_ate: ate || null,
      p_situacao: situacao === 'Todas' ? null : situacao,
      p_offset: offset,
      p_limit: limite,
    })
    if (e) throw erro('relatório visitas', e)
    const fatia = linhasDaRpc(data)
    partes.push(montarCsvDeObjetos(COLUNAS_VISITA.map((c) => c.cabecalho), fatia, offset === 0))
    if (fatia.length < limite) break
    offset += limite
  }
  return partes.filter(Boolean).join('\r\n')
}

export async function csvRelatorioCargas(de: string, ate: string, situacao: string): Promise<string> {
  const sb = supabase()
  if (!sb) return montarCsvDeObjetos(COLUNAS_CARGA.map((c) => c.cabecalho), [])
  const partes: string[] = []
  let offset = 0
  const limite = 800
  for (;;) {
    const { data, error: e } = await sb.rpc('relatorio_cargas_pagina', {
      p_de: de || null,
      p_ate: ate || null,
      p_situacao: situacao === 'Todas' ? null : situacao,
      p_offset: offset,
      p_limit: limite,
    })
    if (e) throw erro('relatório cargas', e)
    const fatia = linhasDaRpc(data)
    partes.push(montarCsvDeObjetos(COLUNAS_CARGA.map((c) => c.cabecalho), fatia, offset === 0))
    if (fatia.length < limite) break
    offset += limite
  }
  return partes.filter(Boolean).join('\r\n')
}

export async function listarFilaFotos(limite = 200): Promise<ItemFilaFoto[]> {
  const sb = supabase()
  if (!sb) return []
  const { data, error: e } = await sb
    .from('cargas')
    .select('*, visitas!inner(cod, data, pdr_nome, situacao)')
    .eq('visitas.situacao', 'certificada')
    .order('id', { ascending: true })
    .limit(limite)
  if (e) throw erro('fila de fotos', e)
  const ORDEM: Record<string, number> = { divergente: 0, pendente: 1, 'sem-foto': 2, ok: 3 }
  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => {
      const visita = row.visitas as Record<string, unknown> | Record<string, unknown>[] | null
      const v = Array.isArray(visita) ? visita[0] : visita
      const carga: Carga = cargaDeLinha(row)
      return {
        visitaCod: n(v?.cod ?? row.visita_cod),
        visitaData: v?.data ? dataIsoParaBr(String(v.data)) : '',
        pdrNome: String(v?.pdr_nome ?? ''),
        carga,
        conferencia: conferirCargaComFoto(carga),
      }
    })
    .sort((a, b) => (ORDEM[a.conferencia.status] ?? 9) - (ORDEM[b.conferencia.status] ?? 9))
}

export async function listarAcumuladoAuto(termo = '', limite = 80): Promise<VisitaAcumuladoResumo[]> {
  const sb = supabase()
  if (!sb) return []
  let q = sb
    .from('visitas')
    .select(
      'cod, data, pdr_nome, pdr_cnpj, pdr_cidade, pdr_uf, acumulado_negativa, acumulado_declarada, acumulado_positiva, acumulado_participante',
    )
    .eq('consultor', 'INSERÇÃO_AUTO')
    .order('data', { ascending: false })
    .limit(limite)
  const t = termo.trim()
  if (t) {
    const limpo = escaparIlike(t)
    const soDigitos = t.replace(/\D/g, '')
    const or = [`pdr_nome.ilike.%${limpo}%`, `pdr_cidade.ilike.%${limpo}%`]
    if (soDigitos) {
      or.push(`pdr_cnpj.ilike.%${soDigitos}%`)
      or.push(`cod.eq.${Number(soDigitos) || 0}`)
    }
    q = q.or(or.join(','))
  }
  const { data, error: e } = await q
  if (e) throw erro('acumulado', e)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    cod: n(r.cod),
    data: r.data ? dataIsoParaBr(String(r.data)) : '',
    pdr: {
      nome: String(r.pdr_nome ?? ''),
      cnpj: String(r.pdr_cnpj ?? ''),
      cidade: String(r.pdr_cidade ?? ''),
      uf: String(r.pdr_uf ?? ''),
    },
    valores: {
      Negativa: n(r.acumulado_negativa),
      Declarada: n(r.acumulado_declarada),
      Positiva: n(r.acumulado_positiva),
      Participante: n(r.acumulado_participante),
    },
  }))
}

export type RelatorioSafra = {
  tipo: 'visitas' | 'cargas'
  geradoEm: number | null
  linhas: number
  partes: number
  gerando: boolean
  erro: string | null
}

export async function consultarRelatoriosSafra(): Promise<RelatorioSafra[]> {
  const sb = supabase()
  if (!sb) return []
  const { data, error: e } = await sb.from('relatorio_safra').select('*')
  if (e) throw erro('relatório da safra', e)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    tipo: r.tipo === 'cargas' ? 'cargas' : 'visitas',
    geradoEm: r.gerado_em ? new Date(String(r.gerado_em)).getTime() : null,
    linhas: n(r.linhas),
    partes: n(r.partes),
    gerando: Boolean(r.gerando),
    erro: (r.erro as string | null) ?? null,
  }))
}

export async function dispararGeracaoSafra(): Promise<void> {
  const sb = supabase()
  if (!sb) return
  const { error: e } = await sb.rpc('pedir_gerar_relatorios_safra')
  if (e) throw erro('gerar relatórios', e)
}

export async function baixarRelatorioSafra(tipo: 'visitas' | 'cargas'): Promise<string> {
  const sb = supabase()
  if (!sb) return ''
  const { data: meta, error: e1 } = await sb
    .from('relatorio_safra')
    .select('partes')
    .eq('tipo', tipo)
    .maybeSingle()
  if (e1) throw erro('meta do relatório', e1)
  const partes = n(meta?.partes)
  if (partes === 0) return ''
  const textos: string[] = []
  const CONC = 4
  for (let i = 0; i < partes; i += CONC) {
    const lote = await Promise.all(
      Array.from({ length: Math.min(CONC, partes - i) }, (_, k) =>
        sb.from('relatorio_partes').select('csv').eq('tipo', tipo).eq('n', i + k).maybeSingle(),
      ),
    )
    for (const r of lote) {
      if (r.error) throw erro('parte do relatório', r.error)
      textos.push(String(r.data?.csv ?? ''))
    }
  }
  return textos.filter(Boolean).join('\r\n')
}
