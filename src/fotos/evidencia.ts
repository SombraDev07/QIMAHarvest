import { fmtKg, mascaraPlaca, mascaraProdutor, mascaraRomaneio } from '../format'
import type { Carga, Visita } from '../types'
import {
  comConcorrencia,
  lerFotoComVisao,
  leituraVisaoEmCache,
  visaoLigada,
  type CamposVisao,
  type ConfigVisao,
} from './visao'

export type FonteEvidencia = 'svg-mock' | 'visao' | 'requer-visao' | 'sem-foto' | 'visao-erro'

export interface EvidenciaLida extends CamposVisao {
  cargaId?: string
  fonte: FonteEvidencia
  erro?: string
}

export type StatusConferencia = 'ok' | 'divergente' | 'pendente' | 'sem-foto'

export type CampoConferencia =
  | 'dataHora'
  | 'placa'
  | 'produtor'
  | 'romaneio'
  | 'pesoLiquido'
  | 'pesoComDesconto'

export interface ChecagemCampo {
  campo: CampoConferencia
  rotulo: string
  lancado: string
  naFoto: string
  /** false = não bate; null = ainda não dá para concluir */
  ok: boolean | null
  detalhe: string
}

export interface ConferenciaFoto {
  status: StatusConferencia
  fonte: FonteEvidencia
  checagens: ChecagemCampo[]
  erro?: string
}

export interface ItemFilaFoto {
  visitaCod: number
  visitaData: string
  pdrNome: string
  carga: Carga
  conferencia: ConferenciaFoto
}

export type ExtraFotoMock = {
  data?: string
  hora?: string
  produtor?: string
  pesoLiquido?: number
  pesoComDesconto?: number
}

/** outras NFs no mesmo papel, para a foto parecer um bloco de notas fiscais */
export function notasFiscaisSimuladas(id: string, romaneio: string): string[] {
  const n = Number.parseInt(id.replace(/\D/g, '') || '1', 10)
  const a = String(141000 + (n % 5000))
  const b = String(146000 + ((n * 7) % 5000))
  const lista = [a, b]
  const rom = romaneio.trim()
  if (rom) lista.splice(1, 0, rom)
  return lista.filter((x, i, arr) => arr.indexOf(x) === i)
}

/** SVG offline com os mesmos campos que a visão extrai de uma foto real */
export function gerarFotoMock(
  id: string,
  placa: string,
  romaneio: string,
  extra: ExtraFotoMock = {},
): string {
  const nfs = notasFiscaisSimuladas(id, romaneio)
  const linhasNf = nfs
    .map((nf, i) => {
      const desta = nf === romaneio.trim()
      return `<text x="48" y="${318 + i * 28}" font-family="monospace" font-size="16" fill="${desta ? '#d6e8c8' : '#c5d2de'}">NF ${nf}${desta ? '  ← desta carga' : ''}</text>`
    })
    .join('')
  const data = extra.data ?? ''
  const hora = extra.hora ?? ''
  const produtor = extra.produtor ?? ''
  const pesoL = extra.pesoLiquido
  const pesoD = extra.pesoComDesconto
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" data-carga="${id}" data-placa="${placa}" data-nfs="${nfs.join(',')}" data-data="${data}" data-hora="${hora}" data-produtor="${escaparAttr(produtor)}" data-peso-liquido="${pesoL ?? ''}" data-peso-desconto="${pesoD ?? ''}">
    <rect width="100%" height="100%" fill="#1f2c38"/>
    <rect x="16" y="16" width="608" height="448" fill="none" stroke="#4a5d6e" stroke-width="2" stroke-dasharray="6 6"/>
    <text x="320" y="52" font-family="sans-serif" font-size="13" fill="#9fb0c0" text-anchor="middle">Evidência do tablet · várias notas no documento</text>
    <text x="320" y="88" font-family="monospace" font-size="14" fill="#c5d2de" text-anchor="middle">${data} ${hora}</text>
    <text x="320" y="168" font-family="monospace" font-size="42" fill="#e7edf3" text-anchor="middle">${placa}</text>
    <text x="320" y="206" font-family="monospace" font-size="16" fill="#9fb0c0" text-anchor="middle">${escaparAttr(produtor)}</text>
    <text x="320" y="230" font-family="monospace" font-size="13" fill="#9fb0c0" text-anchor="middle">${pesoL != null ? `${pesoL} kg líq.` : ''} ${pesoD != null ? `· ${pesoD} kg c/ desc.` : ''}</text>
    <rect x="32" y="248" width="576" height="${64 + nfs.length * 28}" rx="8" fill="#162029"/>
    <text x="48" y="278" font-family="sans-serif" font-size="12" fill="#647688">Notas fiscais no documento</text>
    ${linhasNf}
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function escaparAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function decodificarSvg(fotoUrl: string): string | null {
  const virgula = fotoUrl.indexOf(',')
  if (virgula < 0) return null
  const bruto = fotoUrl.slice(virgula + 1)
  try {
    return decodeURIComponent(bruto)
  } catch {
    return bruto
  }
}

function lerSvgLegado(svg: string): Pick<EvidenciaLida, 'cargaId' | 'placa' | 'notasFiscais'> {
  const cargaId = /Carga\s+([^<\s]+)/.exec(svg)?.[1]
  const romaneio = /romaneio\s+([^<\s]+)/.exec(svg)?.[1]
  const placa = /font-size="42"[^>]*>([^<]+)</.exec(svg)?.[1]?.trim()
  return {
    cargaId,
    placa,
    notasFiscais: romaneio ? [romaneio] : [],
  }
}

function attr(svg: string, nome: string): string | undefined {
  const v = new RegExp(`data-${nome}="([^"]*)"`).exec(svg)?.[1]
  return v ? v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&') : undefined
}

/** lê o que a foto declara; jpeg/png reais pedem API de visão (async em lerEvidenciaAsync) */
export function lerEvidencia(fotoUrl: string | undefined): EvidenciaLida {
  if (!fotoUrl) return { notasFiscais: [], fonte: 'sem-foto' }
  if (!fotoUrl.startsWith('data:image/svg+xml')) {
    const cache = leituraVisaoEmCache(fotoUrl)
    if (cache) return { ...cache, fonte: 'visao' }
    return { notasFiscais: [], fonte: 'requer-visao' }
  }
  const svg = decodificarSvg(fotoUrl)
  if (!svg) return { notasFiscais: [], fonte: 'requer-visao' }

  const cargaAttr = attr(svg, 'carga')
  const placaAttr = attr(svg, 'placa')
  const nfsAttr = attr(svg, 'nfs')
  if (cargaAttr || placaAttr || nfsAttr) {
    const pesoL = attr(svg, 'peso-liquido')
    const pesoD = attr(svg, 'peso-desconto')
    const romaneioLista = (nfsAttr ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return {
      cargaId: cargaAttr,
      placa: placaAttr,
      notasFiscais: romaneioLista,
      romaneio: romaneioLista[0],
      data: attr(svg, 'data') || undefined,
      hora: attr(svg, 'hora') || undefined,
      produtor: attr(svg, 'produtor') || undefined,
      pesoLiquido: pesoL ? Number(pesoL) : undefined,
      pesoComDesconto: pesoD ? Number(pesoD) : undefined,
      fonte: 'svg-mock',
    }
  }
  return { ...lerSvgLegado(svg), fonte: 'svg-mock' }
}

export async function lerEvidenciaAsync(
  fotoUrl: string | undefined,
  cfg: ConfigVisao,
): Promise<EvidenciaLida> {
  const sinc = lerEvidencia(fotoUrl)
  if (sinc.fonte !== 'requer-visao' || !fotoUrl) return sinc
  if (!visaoLigada(cfg)) return sinc
  try {
    const campos = await lerFotoComVisao(fotoUrl, cfg)
    return { ...campos, fonte: 'visao' }
  } catch (e) {
    return {
      notasFiscais: [],
      fonte: 'visao-erro',
      erro: e instanceof Error ? e.message : 'Falha na API de visão.',
    }
  }
}

function token(valor: string): string {
  return mascaraRomaneio(valor).replace(/ /g, '')
}

function conferirDataHora(
  data: string,
  hora: string,
  lida: Pick<CamposVisao, 'data' | 'hora'>,
): ChecagemCampo {
  const lancado = [data, hora].filter(Boolean).join(' ') || '—'
  const naFoto = [lida.data, lida.hora].filter(Boolean).join(' ') || '—'
  const dataOk = Boolean(data) && Boolean(lida.data) && soDigitosData(data) === soDigitosData(lida.data ?? '')
  const horaOk =
    !hora || !lida.hora || hora.slice(0, 5) === lida.hora.slice(0, 5)
  const temFoto = Boolean(lida.data || lida.hora)
  let ok: boolean | null = null
  if (temFoto && (data || hora)) ok = dataOk && horaOk
  else if (!temFoto && (data || hora)) ok = false
  return {
    campo: 'dataHora',
    rotulo: 'Data / hora',
    lancado,
    naFoto,
    ok,
    detalhe:
      ok === true
        ? 'Data e hora da foto coincidem com o lançamento.'
        : ok === false
          ? temFoto
            ? 'Data ou hora da foto é outra.'
            : 'A foto não trouxe data/hora.'
          : 'Ainda não há data/hora nas duas pontas para conferir.',
  }
}

function soDigitosData(v: string): string {
  const m = v.match(/(\d{1,2})\D(\d{1,2})\D(\d{2,4})/)
  if (!m) return v.replace(/\D/g, '')
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}${ano}`
}

function conferirPlaca(lancado: string, naFoto: string | undefined): ChecagemCampo {
  const foto = naFoto?.trim() ?? ''
  const a = mascaraPlaca(lancado)
  const b = mascaraPlaca(foto)
  const ok = Boolean(a) && Boolean(b) && a === b
  return {
    campo: 'placa',
    rotulo: 'Placa',
    lancado: lancado || '—',
    naFoto: foto || '—',
    ok: a && b ? ok : a || b ? false : null,
    detalhe:
      a && b
        ? ok
          ? 'Placa da foto coincide com o lançamento.'
          : 'Placa da foto é outra — a evidência vale mais que o digitado depois.'
        : a
          ? 'A foto não trouxe placa.'
          : 'Placa não lançada.',
  }
}

function conferirProdutor(lancado: string, naFoto: string | undefined): ChecagemCampo {
  const a = mascaraProdutor(lancado)
  const b = mascaraProdutor(naFoto ?? '')
  let ok: boolean | null = null
  if (a && b) {
    ok = a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a)))
  } else if (a || b) {
    ok = false
  }
  return {
    campo: 'produtor',
    rotulo: 'Produtor',
    lancado: lancado || '—',
    naFoto: (naFoto ?? '').trim() || '—',
    ok,
    detalhe:
      ok === true
        ? 'Nome do produtor na foto bate com o lançamento.'
        : ok === false
          ? b
            ? 'O produtor lido na foto é outro.'
            : 'A foto não trouxe o produtor.'
          : 'Produtor não lançado e não lido.',
  }
}

function conferirRomaneio(lancado: string, nfs: string[], romaneioFoto?: string): ChecagemCampo {
  const alvo = token(lancado)
  const lista = [...nfs, romaneioFoto ?? ''].map(token).filter(Boolean)
  const naFoto = [romaneioFoto, ...nfs].filter(Boolean).join(', ') || '—'
  if (!alvo) {
    return {
      campo: 'romaneio',
      rotulo: 'Romaneio',
      lancado: '—',
      naFoto,
      ok: null,
      detalhe: 'Romaneio não informado — não dá para procurar nas NFs da foto.',
    }
  }
  const ok = lista.includes(alvo)
  return {
    campo: 'romaneio',
    rotulo: 'Romaneio',
    lancado,
    naFoto,
    ok,
    detalhe: ok
      ? 'O romaneio lançado aparece no documento (pode ser uma das NFs).'
      : lista.length
        ? 'O romaneio lançado não está entre os números visíveis no documento.'
        : 'A foto não listou romaneio nem notas fiscais.',
  }
}

function conferirPeso(
  campo: 'pesoLiquido' | 'pesoComDesconto',
  rotulo: string,
  lancado: number,
  naFoto: number | undefined,
): ChecagemCampo {
  const fotoTxt = naFoto != null && Number.isFinite(naFoto) ? fmtKg(naFoto) : '—'
  const lancadoTxt = lancado > 0 ? fmtKg(lancado) : '—'
  if (!(lancado > 0) && (naFoto == null || naFoto === 0)) {
    return {
      campo,
      rotulo,
      lancado: lancadoTxt,
      naFoto: fotoTxt,
      ok: null,
      detalhe: 'Peso não lançado e não lido.',
    }
  }
  if (naFoto == null) {
    return {
      campo,
      rotulo,
      lancado: lancadoTxt,
      naFoto: fotoTxt,
      ok: false,
      detalhe: 'A foto não trouxe este peso.',
    }
  }
  const tol = Math.max(2, Math.round(Math.abs(lancado) * 0.005))
  const ok = Math.abs(lancado - naFoto) <= tol
  return {
    campo,
    rotulo,
    lancado: lancadoTxt,
    naFoto: fotoTxt,
    ok,
    detalhe: ok
      ? `Peso da foto dentro da tolerância (${tol} kg).`
      : `Peso da foto difere do lançado (tolerância ${tol} kg).`,
  }
}

function statusDe(checagens: ChecagemCampo[], fonte: FonteEvidencia): StatusConferencia {
  if (fonte === 'sem-foto') return 'sem-foto'
  if (fonte === 'visao-erro' || fonte === 'requer-visao') return 'pendente'
  if (checagens.some((c) => c.ok === false)) return 'divergente'
  if (checagens.some((c) => c.ok === null)) return 'pendente'
  return 'ok'
}

export function conferirCargaComFoto(carga: Carga, lida?: EvidenciaLida): ConferenciaFoto {
  const ev = lida ?? lerEvidencia(carga.fotoUrl)
  if (ev.fonte === 'sem-foto') {
    return { status: 'sem-foto', fonte: ev.fonte, checagens: [] }
  }
  if (ev.fonte === 'requer-visao' || ev.fonte === 'visao-erro') {
    const checagens = checagensDe(carga, { notasFiscais: [] })
      .map((c) => ({
        ...c,
        naFoto: '—',
        ok: null as boolean | null,
        detalhe:
          ev.fonte === 'visao-erro'
            ? ev.erro ?? 'Falha na API de visão.'
            : 'Foto real: precisa de API de visão para ler o documento.',
      }))
    return { status: 'pendente', fonte: ev.fonte, checagens, erro: ev.erro }
  }
  const checagens = checagensDe(carga, ev)
  return { status: statusDe(checagens, ev.fonte), fonte: ev.fonte, checagens }
}

function checagensDe(carga: Carga, ev: CamposVisao): ChecagemCampo[] {
  return [
    conferirDataHora(carga.data, carga.hora, ev),
    conferirPlaca(carga.placa, ev.placa),
    conferirProdutor(carga.produtor, ev.produtor),
    conferirRomaneio(carga.romaneio, ev.notasFiscais, ev.romaneio),
    conferirPeso('pesoLiquido', 'Peso líquido', carga.pesoLiquido, ev.pesoLiquido),
    conferirPeso('pesoComDesconto', 'Peso c/ desconto', carga.pesoComDesconto, ev.pesoComDesconto),
  ]
}

const ORDEM: Record<StatusConferencia, number> = {
  divergente: 0,
  pendente: 1,
  'sem-foto': 2,
  ok: 3,
}

/** fila da aba: só visitas já certificadas */
export function filaAnaliseFotos(visitas: Visita[]): ItemFilaFoto[] {
  return visitas
    .filter((v) => v.situacao === 'certificada')
    .flatMap((v) =>
      v.cargas.map((carga) => ({
        visitaCod: v.cod,
        visitaData: v.data,
        pdrNome: v.pdr.nome,
        carga,
        conferencia: conferirCargaComFoto(carga),
      })),
    )
    .sort((a, b) => ORDEM[a.conferencia.status] - ORDEM[b.conferencia.status])
}

export interface ResumoLeituraMassa {
  total: number
  comFoto: number
  lidasLocal: number
  lidasApi: number
  ok: number
  divergente: number
  pendenteApi: number
  semFoto: number
  falhas: number
}

export function resumirLeituraMassa(fila: ItemFilaFoto[]): ResumoLeituraMassa {
  let comFoto = 0
  let lidasLocal = 0
  let lidasApi = 0
  let ok = 0
  let divergente = 0
  let pendenteApi = 0
  let semFoto = 0
  let falhas = 0
  for (const item of fila) {
    if (item.carga.fotoUrl) comFoto += 1
    if (item.conferencia.fonte === 'svg-mock') lidasLocal += 1
    if (item.conferencia.fonte === 'visao') lidasApi += 1
    if (item.conferencia.fonte === 'requer-visao') pendenteApi += 1
    if (item.conferencia.fonte === 'visao-erro') falhas += 1
    if (item.conferencia.status === 'ok') ok += 1
    if (item.conferencia.status === 'divergente') divergente += 1
    if (item.conferencia.status === 'sem-foto') semFoto += 1
  }
  return { total: fila.length, comFoto, lidasLocal, lidasApi, ok, divergente, pendenteApi, semFoto, falhas }
}

const FATIA_LEITURA = 32
const CONCORRENCIA_API = 3

/**
 * Percorre a fila: SVG mock lê na hora; jpeg/png vão à API quando ela está ligada.
 */
export async function lerFilaEmMassa(
  fila: ItemFilaFoto[],
  onProgress: (feitos: number, total: number) => void,
  cfg?: ConfigVisao,
): Promise<{ resumo: ResumoLeituraMassa; fila: ItemFilaFoto[] }> {
  const alvo = fila.filter((i) => i.carga.fotoUrl)
  const total = alvo.length
  if (total === 0) {
    onProgress(0, 0)
    return { resumo: resumirLeituraMassa(fila), fila }
  }

  const atualizada = fila.map((i) => ({ ...i }))
  const porChave = new Map(atualizada.map((i) => [`${i.visitaCod}-${i.carga.id}`, i]))
  const fotos = alvo.map((i) => porChave.get(`${i.visitaCod}-${i.carga.id}`)!)

  const mocks = fotos.filter((i) => i.carga.fotoUrl?.startsWith('data:image/svg+xml'))
  const reais = fotos.filter((i) => !i.carga.fotoUrl?.startsWith('data:image/svg+xml'))

  for (let i = 0; i < mocks.length; i += FATIA_LEITURA) {
    for (const item of mocks.slice(i, i + FATIA_LEITURA)) {
      item.conferencia = conferirCargaComFoto(item.carga)
    }
    onProgress(Math.min(i + FATIA_LEITURA, mocks.length), total)
    await new Promise((r) => setTimeout(r, 0))
  }

  if (cfg && visaoLigada(cfg) && reais.length) {
    let feitos = mocks.length
    await comConcorrencia(reais, CONCORRENCIA_API, async (item) => {
      const lida = await lerEvidenciaAsync(item.carga.fotoUrl, cfg)
      item.conferencia = conferirCargaComFoto(item.carga, lida)
      feitos += 1
      onProgress(feitos, total)
    })
  } else {
    onProgress(total, total)
  }

  atualizada.sort((a, b) => ORDEM[a.conferencia.status] - ORDEM[b.conferencia.status])
  return { resumo: resumirLeituraMassa(atualizada), fila: atualizada }
}
