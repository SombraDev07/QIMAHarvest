import { mascaraPlaca, mascaraRomaneio } from '../format'
import type { Carga, Visita } from '../types'

export type FonteEvidencia = 'svg-mock' | 'requer-visao' | 'sem-foto'

export interface EvidenciaLida {
  cargaId?: string
  placa?: string
  /** todos os números visíveis no documento — a foto costuma ter várias NFs */
  notasFiscais: string[]
  fonte: FonteEvidencia
}

export type StatusConferencia = 'ok' | 'divergente' | 'pendente' | 'sem-foto'

export interface ChecagemCampo {
  campo: 'id' | 'placa' | 'romaneio'
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
}

export interface ItemFilaFoto {
  visitaCod: number
  visitaData: string
  pdrNome: string
  carga: Carga
  conferencia: ConferenciaFoto
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

/** SVG offline com placa, ID da carga e várias NFs no documento */
export function gerarFotoMock(id: string, placa: string, romaneio: string): string {
  const nfs = notasFiscaisSimuladas(id, romaneio)
  const linhasNf = nfs
    .map((nf, i) => {
      const desta = nf === romaneio.trim()
      return `<text x="48" y="${318 + i * 28}" font-family="monospace" font-size="16" fill="${desta ? '#d6e8c8' : '#c5d2de'}">NF ${nf}${desta ? '  ← desta carga' : ''}</text>`
    })
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" data-carga="${id}" data-placa="${placa}" data-nfs="${nfs.join(',')}">
    <rect width="100%" height="100%" fill="#1f2c38"/>
    <rect x="16" y="16" width="608" height="448" fill="none" stroke="#4a5d6e" stroke-width="2" stroke-dasharray="6 6"/>
    <text x="320" y="64" font-family="sans-serif" font-size="13" fill="#9fb0c0" text-anchor="middle">Evidência do tablet · várias notas no documento</text>
    <text x="320" y="168" font-family="monospace" font-size="42" fill="#e7edf3" text-anchor="middle">${placa}</text>
    <text x="320" y="206" font-family="monospace" font-size="18" fill="#9fb0c0" text-anchor="middle">Carga ${id}</text>
    <rect x="32" y="248" width="576" height="${64 + nfs.length * 28}" rx="8" fill="#162029"/>
    <text x="48" y="278" font-family="sans-serif" font-size="12" fill="#647688">Notas fiscais no documento</text>
    ${linhasNf}
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
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

/** lê o que a foto declara; jpeg/png reais pedem API de visão */
export function lerEvidencia(fotoUrl: string | undefined): EvidenciaLida {
  if (!fotoUrl) return { notasFiscais: [], fonte: 'sem-foto' }
  if (!fotoUrl.startsWith('data:image/svg+xml')) {
    return { notasFiscais: [], fonte: 'requer-visao' }
  }
  const svg = decodificarSvg(fotoUrl)
  if (!svg) return { notasFiscais: [], fonte: 'requer-visao' }

  const cargaAttr = /data-carga="([^"]*)"/.exec(svg)?.[1]
  const placaAttr = /data-placa="([^"]*)"/.exec(svg)?.[1]
  const nfsAttr = /data-nfs="([^"]*)"/.exec(svg)?.[1]
  if (cargaAttr || placaAttr || nfsAttr) {
    return {
      cargaId: cargaAttr,
      placa: placaAttr,
      notasFiscais: (nfsAttr ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      fonte: 'svg-mock',
    }
  }
  return { ...lerSvgLegado(svg), fonte: 'svg-mock' }
}

function token(valor: string): string {
  return mascaraRomaneio(valor).replace(/ /g, '')
}

function conferirId(lancado: string, naFoto: string | undefined): ChecagemCampo {
  const foto = naFoto?.trim() ?? ''
  const ok = Boolean(foto) && foto === lancado.trim()
  return {
    campo: 'id',
    rotulo: 'ID da carga',
    lancado: lancado || '—',
    naFoto: foto || '—',
    ok,
    detalhe: ok
      ? 'O ID lançado é o mesmo da etiqueta na foto.'
      : foto
        ? 'O ID da foto não é o da carga selecionada.'
        : 'A foto não trouxe o ID da carga.',
  }
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

function conferirRomaneio(lancado: string, nfs: string[]): ChecagemCampo {
  const alvo = token(lancado)
  const lista = nfs.map(token).filter(Boolean)
  const naFoto = nfs.length ? nfs.join(', ') : '—'
  if (!alvo) {
    return {
      campo: 'romaneio',
      rotulo: 'Romaneio / NF',
      lancado: '—',
      naFoto,
      ok: null,
      detalhe: 'Romaneio não informado — não dá para procurar nas NFs da foto.',
    }
  }
  const ok = lista.includes(alvo)
  return {
    campo: 'romaneio',
    rotulo: 'Romaneio / NF',
    lancado,
    naFoto,
    ok,
    detalhe: ok
      ? 'O romaneio lançado aparece entre as notas fiscais da foto.'
      : lista.length
        ? 'O romaneio lançado não está entre as NFs visíveis no documento.'
        : 'A foto não listou notas fiscais.',
  }
}

function statusDe(checagens: ChecagemCampo[], fonte: FonteEvidencia): StatusConferencia {
  if (fonte === 'sem-foto') return 'sem-foto'
  if (checagens.some((c) => c.ok === false)) return 'divergente'
  if (fonte === 'requer-visao' || checagens.some((c) => c.ok === null)) return 'pendente'
  return 'ok'
}

export function conferirCargaComFoto(carga: Carga): ConferenciaFoto {
  const lida = lerEvidencia(carga.fotoUrl)
  if (lida.fonte === 'sem-foto') {
    return { status: 'sem-foto', fonte: lida.fonte, checagens: [] }
  }
  if (lida.fonte === 'requer-visao') {
    const checagens: ChecagemCampo[] = [
      {
        campo: 'id',
        rotulo: 'ID da carga',
        lancado: carga.id,
        naFoto: '—',
        ok: null,
        detalhe: 'Foto real: precisa de API de visão para ler o documento.',
      },
      {
        campo: 'placa',
        rotulo: 'Placa',
        lancado: carga.placa || '—',
        naFoto: '—',
        ok: null,
        detalhe: 'Foto real: precisa de API de visão para ler a placa.',
      },
      {
        campo: 'romaneio',
        rotulo: 'Romaneio / NF',
        lancado: carga.romaneio || '—',
        naFoto: '—',
        ok: null,
        detalhe: 'Foto real: precisa de API de visão para listar as NFs do papel.',
      },
    ]
    return { status: 'pendente', fonte: lida.fonte, checagens }
  }
  const checagens = [
    conferirId(carga.id, lida.cargaId),
    conferirPlaca(carga.placa, lida.placa),
    conferirRomaneio(carga.romaneio, lida.notasFiscais),
  ]
  return { status: statusDe(checagens, lida.fonte), fonte: lida.fonte, checagens }
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
  ok: number
  divergente: number
  pendenteApi: number
  semFoto: number
}

export function resumirLeituraMassa(fila: ItemFilaFoto[]): ResumoLeituraMassa {
  let comFoto = 0
  let lidasLocal = 0
  let ok = 0
  let divergente = 0
  let pendenteApi = 0
  let semFoto = 0
  for (const item of fila) {
    if (item.carga.fotoUrl) comFoto += 1
    if (item.conferencia.fonte === 'svg-mock') lidasLocal += 1
    if (item.conferencia.fonte === 'requer-visao') pendenteApi += 1
    if (item.conferencia.status === 'ok') ok += 1
    if (item.conferencia.status === 'divergente') divergente += 1
    if (item.conferencia.status === 'sem-foto') semFoto += 1
  }
  return { total: fila.length, comFoto, lidasLocal, ok, divergente, pendenteApi, semFoto }
}

const FATIA_LEITURA = 32

/**
 * Percorre a fila em fatias para a tela mostrar progresso.
 * SVG mock lê na hora; jpeg/png só entram no lote quando houver API de visão.
 */
export async function lerFilaEmMassa(
  fila: ItemFilaFoto[],
  onProgress: (feitos: number, total: number) => void,
): Promise<ResumoLeituraMassa> {
  const alvo = fila.filter((i) => i.carga.fotoUrl)
  const total = alvo.length
  if (total === 0) {
    onProgress(0, 0)
    return resumirLeituraMassa(fila)
  }
  for (let i = 0; i < alvo.length; i += FATIA_LEITURA) {
    for (const item of alvo.slice(i, i + FATIA_LEITURA)) {
      conferirCargaComFoto(item.carga)
    }
    onProgress(Math.min(i + FATIA_LEITURA, total), total)
    await new Promise((r) => setTimeout(r, 0))
  }
  return resumirLeituraMassa(fila)
}
