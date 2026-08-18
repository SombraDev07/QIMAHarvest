/**
 * Planilhas de correção em massa. Não criam visita nem carga: só atualizam o
 * que já existe, casando por chave. Célula vazia = não mexe naquele campo.
 *
 * Chaves:
 *   carga         → ID da carga
 *   dia anterior  → Visit ID + dia
 *   acumulado     → Visit ID + dia (o dia tem que ser o da visita)
 */
import {
  mascaraProdutor,
  mascaraRomaneio,
  normalizarHoraPlanilha,
  numeroPlanilha,
  semAcento,
} from '../format'
import {
  CLASSIFICACOES,
  PESO_LIQUIDO_MAX,
  type Carga,
  type Classificacao,
  type Visita,
} from '../types'
import { campo, lerPlanilha, type Linha } from './planilhaVisitas'

const DATA = /^\d{2}\/\d{2}\/\d{4}$/

const CLASSIFICACAO_POR_TESTE: Record<string, Classificacao> = {
  negativa: 'Negativa',
  'testada negativa': 'Negativa',
  declarada: 'Declarada',
  positiva: 'Positiva',
  'testada positiva': 'Positiva',
  participante: 'Participante',
}

export type LinhaCorrecao<T> = {
  linha: number
  patch: T | null
  erros: string[]
  /** preenchido na conferência, para a prévia mostrar a visita alvo */
  visitaCod?: number
}

export type PatchCarga = {
  id: string
  produtor?: string
  produtorNI?: boolean
  romaneio?: string
  romaneioNI?: boolean
  pesoLiquido?: number
  pesoLiquidoNI?: boolean
  pesoComDesconto?: number
  pesoComDescontoNI?: boolean
  classificacao?: Classificacao
  data?: string
  hora?: string
}

export type PatchVolumes = {
  cod: number
  dia: string
  valores: Partial<Record<Classificacao, number>>
}

export type ResumoCorrecao = {
  cargas: number
  diasAnteriores: number
  acumulados: number
}

const ZERADO: Record<Classificacao, number> = {
  Negativa: 0,
  Declarada: 0,
  Positiva: 0,
  Participante: 0,
}

function ehNaoInformado(v: string): boolean {
  const s = semAcento(v).trim().toLowerCase()
  return s === 'nao informado' || s === 'ni' || s === 'n/i'
}

function classificacaoDe(v: string): Classificacao | null {
  return CLASSIFICACAO_POR_TESTE[semAcento(v).trim().toLowerCase()] ?? null
}

function parseCod(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : NaN
}

function lerPeso(
  bruto: string,
  rotulo: string,
): { ok: true; valor?: number; ni?: boolean } | { ok: false; erro: string } {
  if (!bruto) return { ok: true }
  if (ehNaoInformado(bruto)) return { ok: true, valor: 0, ni: true }
  const n = numeroPlanilha(bruto)
  if (!Number.isFinite(n) || n < 0) return { ok: false, erro: `${rotulo} inválido.` }
  if (n > PESO_LIQUIDO_MAX)
    return {
      ok: false,
      erro: `${rotulo} acima do máximo de ${PESO_LIQUIDO_MAX.toLocaleString('pt-BR')} kg.`,
    }
  return { ok: true, valor: n, ni: false }
}

function lerVolume(bruto: string, rotulo: string): { ok: true; valor?: number } | { ok: false; erro: string } {
  if (!bruto) return { ok: true }
  const n = numeroPlanilha(bruto)
  if (!Number.isFinite(n) || n < 0) return { ok: false, erro: `${rotulo} inválido.` }
  return { ok: true, valor: n }
}

function volumesDaLinha(
  l: Linha,
  aliases: Record<Classificacao, string[]>,
): { valores: Partial<Record<Classificacao, number>>; erros: string[] } {
  const valores: Partial<Record<Classificacao, number>> = {}
  const erros: string[] = []
  for (const c of CLASSIFICACOES) {
    const r = lerVolume(campo(l, ...aliases[c]), c)
    if (!r.ok) erros.push(r.erro)
    else if (r.valor !== undefined) valores[c] = r.valor
  }
  return { valores, erros }
}

const ALIAS_DIA_ANTERIOR: Record<Classificacao, string[]> = {
  Negativa: ['Negativa', 'A: VOLUME TESTADA NEGATIVA (Kg)'],
  Declarada: ['Declarada', 'A: VOLUME DECLARADA (Kg)'],
  Positiva: ['Positiva', 'A: VOLUME TESTADA POSITVA (Kg)', 'A: VOLUME TESTADA POSITIVA (Kg)'],
  Participante: ['Participante', 'A: VOLUME PARTICIPANTES (Kg)'],
}

const ALIAS_ACUMULADO: Record<Classificacao, string[]> = {
  Negativa: ['Negativa', 'B: VOLUME BIOTECNOLOGIA PATENTE INVALIDA'],
  Declarada: ['Declarada', 'A: VOLUME DECLARADA (Kg)', 'B: VOLUME DECLARADA'],
  Positiva: ['Positiva', 'B: VOLUME BIOTECNOLOGIA PATENTE VALIDA'],
  Participante: ['Participante', 'B: VOLUME PARTICIPANTES'],
}

/* ------------------------------------------------------------------ *
 * Parsers
 * ------------------------------------------------------------------ */

export function analisarCorrecaoCargas(texto: string): LinhaCorrecao<PatchCarga>[] {
  const linhas = lerPlanilha(texto)
  const vistos = new Set<string>()

  return linhas.map((l, i) => {
    const erros: string[] = []
    const id = campo(l, 'ID', 'ID Carga', 'Id Carga')
    if (!id) erros.push('ID da carga ausente.')
    else if (vistos.has(id)) erros.push(`ID repetido na planilha: ${id}.`)
    else vistos.add(id)

    const patch: PatchCarga = { id }
    const produtorBruto = campo(l, 'Produtor', 'Produtor Nome')
    if (produtorBruto) {
      if (ehNaoInformado(produtorBruto)) patch.produtorNI = true
      else patch.produtor = mascaraProdutor(produtorBruto)
    }

    const romaneioBruto = campo(l, 'Romaneio', 'Numero Documento', 'Número Documento')
    if (romaneioBruto) {
      if (ehNaoInformado(romaneioBruto)) patch.romaneioNI = true
      else patch.romaneio = mascaraRomaneio(romaneioBruto)
    }

    const liquido = lerPeso(campo(l, 'Peso Líquido', 'Peso Liquido'), 'Peso líquido')
    if (!liquido.ok) erros.push(liquido.erro)
    else if (liquido.ni) patch.pesoLiquidoNI = true
    else if (liquido.valor !== undefined) patch.pesoLiquido = liquido.valor

    const desconto = lerPeso(
      campo(l, 'Peso Líquido com Desconto', 'Peso Liquido com Desconto', 'Peso com Desconto'),
      'Peso com desconto',
    )
    if (!desconto.ok) erros.push(desconto.erro)
    else if (desconto.ni) patch.pesoComDescontoNI = true
    else if (desconto.valor !== undefined) patch.pesoComDesconto = desconto.valor

    if (
      patch.pesoLiquido !== undefined &&
      patch.pesoComDesconto !== undefined &&
      !patch.pesoLiquidoNI &&
      !patch.pesoComDescontoNI &&
      patch.pesoComDesconto > patch.pesoLiquido
    )
      erros.push('Peso com desconto maior que o líquido.')

    const tecBruto = campo(l, 'Tecnologia', 'Classificação', 'Classificacao', 'Teste Resultado Monitorado')
    if (tecBruto) {
      const tec = classificacaoDe(tecBruto)
      if (!tec) erros.push(`Tecnologia desconhecida: "${tecBruto}".`)
      else patch.classificacao = tec
    }

    const data = campo(l, 'Data')
    if (data) {
      if (!DATA.test(data)) erros.push(`Data inválida: "${data}".`)
      else patch.data = data
    }

    const horaBruta = campo(l, 'Hora')
    if (horaBruta) {
      const hora = normalizarHoraPlanilha(horaBruta)
      if (!hora) erros.push(`Hora inválida: "${horaBruta}".`)
      else patch.hora = hora
    }

    const temCampo =
      patch.produtor !== undefined ||
      patch.produtorNI ||
      patch.romaneio !== undefined ||
      patch.romaneioNI ||
      patch.pesoLiquido !== undefined ||
      patch.pesoLiquidoNI ||
      patch.pesoComDesconto !== undefined ||
      patch.pesoComDescontoNI ||
      patch.classificacao !== undefined ||
      patch.data !== undefined ||
      patch.hora !== undefined

    if (id && !temCampo) erros.push('Nenhum campo para corrigir.')

    return {
      linha: i + 2,
      patch: erros.length > 0 ? null : patch,
      erros,
    }
  })
}

function analisarVolumes(
  texto: string,
  aliases: Record<Classificacao, string[]>,
  exigeVolume: boolean,
): LinhaCorrecao<PatchVolumes>[] {
  const linhas = lerPlanilha(texto)
  const vistos = new Set<string>()

  return linhas.map((l, i) => {
    const erros: string[] = []
    const cod = parseCod(campo(l, 'Visit ID', 'ID Visita', 'Id Visita', 'Cod Visita', 'Código Visita'))
    if (!Number.isFinite(cod)) erros.push('Visit ID ausente ou inválido.')

    const dia = campo(l, 'Dia', 'Data', 'Data Visita')
    if (!dia) erros.push('Dia ausente.')
    else if (!DATA.test(dia)) erros.push(`Dia inválido: "${dia}".`)

    const chaveLinha = `${cod}|${dia}`
    if (Number.isFinite(cod) && dia) {
      if (vistos.has(chaveLinha)) erros.push(`Visit ID + dia repetidos na planilha: ${cod} ${dia}.`)
      else vistos.add(chaveLinha)
    }

    const { valores, erros: errosVol } = volumesDaLinha(l, aliases)
    erros.push(...errosVol)
    if (exigeVolume && Object.keys(valores).length === 0) erros.push('Nenhuma tecnologia para corrigir.')

    return {
      linha: i + 2,
      patch:
        erros.length > 0
          ? null
          : { cod, dia, valores },
      erros,
    }
  })
}

export const analisarCorrecaoDiaAnterior = (texto: string) =>
  analisarVolumes(texto, ALIAS_DIA_ANTERIOR, true)

export const analisarCorrecaoAcumulado = (texto: string) =>
  analisarVolumes(texto, ALIAS_ACUMULADO, true)

/* ------------------------------------------------------------------ *
 * Conferência contra o que está no sistema
 * ------------------------------------------------------------------ */

function visitaPorCod(visitas: Visita[], cod: number) {
  return visitas.find((v) => v.cod === cod)
}

function acharCarga(visitas: Visita[], id: string): { visita: Visita; carga: Carga } | undefined {
  for (const visita of visitas) {
    const carga = visita.cargas.find((c) => c.id === id)
    if (carga) return { visita, carga }
  }
  return undefined
}

export function conferirCargas(
  linhas: LinhaCorrecao<PatchCarga>[],
  visitas: Visita[],
): LinhaCorrecao<PatchCarga>[] {
  return linhas.map((l) => {
    if (!l.patch) return l
    const achada = acharCarga(visitas, l.patch.id)
    if (!achada) {
      return { ...l, erros: [...l.erros, `Carga ${l.patch.id} não encontrada.`] }
    }
    return { ...l, visitaCod: achada.visita.cod }
  })
}

export function conferirDiaAnterior(
  linhas: LinhaCorrecao<PatchVolumes>[],
  visitas: Visita[],
): LinhaCorrecao<PatchVolumes>[] {
  return linhas.map((l) => {
    if (!l.patch) return l
    const visita = visitaPorCod(visitas, l.patch.cod)
    if (!visita) {
      return { ...l, erros: [...l.erros, `Visita ${l.patch.cod} não encontrada.`] }
    }
    return { ...l, visitaCod: visita.cod }
  })
}

export function conferirAcumulado(
  linhas: LinhaCorrecao<PatchVolumes>[],
  visitas: Visita[],
): LinhaCorrecao<PatchVolumes>[] {
  return linhas.map((l) => {
    if (!l.patch) return l
    const visita = visitaPorCod(visitas, l.patch.cod)
    if (!visita) {
      return { ...l, erros: [...l.erros, `Visita ${l.patch.cod} não encontrada.`] }
    }
    if (l.patch.dia !== visita.data) {
      return {
        ...l,
        erros: [
          ...l.erros,
          `Dia ${l.patch.dia} não é o da visita ${visita.cod} (${visita.data}).`,
        ],
      }
    }
    return { ...l, visitaCod: visita.cod }
  })
}

/* ------------------------------------------------------------------ *
 * Aplicação pura — o store só grava o resultado
 * ------------------------------------------------------------------ */

function marcarNI(c: Carga, campo: 'produtor' | 'romaneio' | 'pesoLiquido' | 'pesoComDesconto', on: boolean): Carga {
  const naoInformado = { ...c.naoInformado, [campo]: on || undefined }
  return { ...c, naoInformado }
}

export function aplicarPatchCarga(carga: Carga, patch: PatchCarga): Carga {
  let c = { ...carga }

  if (patch.produtorNI) {
    c = marcarNI({ ...c, produtor: '' }, 'produtor', true)
  } else if (patch.produtor !== undefined) {
    c = marcarNI({ ...c, produtor: patch.produtor }, 'produtor', false)
  }

  if (patch.romaneioNI) {
    c = marcarNI({ ...c, romaneio: '' }, 'romaneio', true)
  } else if (patch.romaneio !== undefined) {
    c = marcarNI({ ...c, romaneio: patch.romaneio }, 'romaneio', false)
  }

  if (patch.pesoLiquidoNI) {
    c = marcarNI({ ...c, pesoLiquido: 0 }, 'pesoLiquido', true)
  } else if (patch.pesoLiquido !== undefined) {
    c = marcarNI({ ...c, pesoLiquido: patch.pesoLiquido }, 'pesoLiquido', false)
  }

  if (patch.pesoComDescontoNI) {
    c = marcarNI({ ...c, pesoComDesconto: 0 }, 'pesoComDesconto', true)
  } else if (patch.pesoComDesconto !== undefined) {
    c = marcarNI({ ...c, pesoComDesconto: patch.pesoComDesconto }, 'pesoComDesconto', false)
  }

  if (patch.classificacao) c = { ...c, classificacao: patch.classificacao }
  if (patch.data) c = { ...c, data: patch.data }
  if (patch.hora) c = { ...c, hora: patch.hora }
  return c
}

function sincronizarGrupo(cargas: Carga[], referencia: Carga): Carga[] {
  if (!referencia.rateio || !referencia.grupoRateio) return cargas
  return cargas.map((c) =>
    c.grupoRateio === referencia.grupoRateio
      ? {
          ...c,
          data: referencia.data,
          hora: referencia.hora,
          placa: referencia.placa,
          classificacao: referencia.classificacao,
        }
      : c,
  )
}

function upsertDiaAnterior(visita: Visita, patch: PatchVolumes): Visita {
  const existente = visita.diaAnterior.find((d) => d.data === patch.dia)
  const base = existente?.valores ?? ZERADO
  const valores = { ...base, ...patch.valores }
  const registro = existente
    ? visita.diaAnterior.map((d) =>
        d.data === patch.dia ? { ...d, informouDiaAnterior: 'Sim' as const, valores } : d,
      )
    : [
        ...visita.diaAnterior,
        {
          id: `DA-${visita.cod}-${patch.dia.replace(/\//g, '')}`,
          data: patch.dia,
          informouDiaAnterior: 'Sim' as const,
          valores,
        },
      ]
  return { ...visita, diaAnterior: registro }
}

export type AlteracaoAplicada = {
  cod: number
  tipo: 'carga' | 'dia-anterior' | 'acumulado'
  chave: string
  resumo: string
  planilha: 'cargas' | 'dia-anterior' | 'acumulado'
}

export function aplicarPatches(
  visitas: Visita[],
  input: {
    cargas?: PatchCarga[]
    diasAnteriores?: PatchVolumes[]
    acumulados?: PatchVolumes[]
  },
): { visitas: Visita[]; resumo: ResumoCorrecao; alteracoes: AlteracaoAplicada[] } {
  const porCod = new Map(visitas.map((v) => [v.cod, v]))
  let cargas = 0
  let diasAnteriores = 0
  let acumulados = 0
  const alteracoes: AlteracaoAplicada[] = []

  for (const patch of input.cargas ?? []) {
    const achada = acharCarga([...porCod.values()], patch.id)
    if (!achada) continue
    const atualizada = aplicarPatchCarga(achada.carga, patch)
    let lista = achada.visita.cargas.map((c) => (c.id === patch.id ? atualizada : c))
    lista = sincronizarGrupo(lista, atualizada)
    porCod.set(achada.visita.cod, { ...achada.visita, cargas: lista })
    cargas++
    alteracoes.push({
      cod: achada.visita.cod,
      tipo: 'carga',
      chave: patch.id,
      resumo: `Carga ${patch.id}: ${rotuloPatchCarga(patch)}`,
      planilha: 'cargas',
    })
  }

  for (const patch of input.diasAnteriores ?? []) {
    const visita = porCod.get(patch.cod)
    if (!visita) continue
    porCod.set(patch.cod, upsertDiaAnterior(visita, patch))
    diasAnteriores++
    alteracoes.push({
      cod: patch.cod,
      tipo: 'dia-anterior',
      chave: patch.dia,
      resumo: `Dia anterior ${patch.dia}: ${rotuloPatchVolumes(patch)}`,
      planilha: 'dia-anterior',
    })
  }

  for (const patch of input.acumulados ?? []) {
    const visita = porCod.get(patch.cod)
    if (!visita) continue
    porCod.set(patch.cod, {
      ...visita,
      acumulado: {
        ...visita.acumulado,
        informadoPeloPdr: 'Sim',
        valores: { ...visita.acumulado.valores, ...patch.valores },
      },
    })
    acumulados++
    alteracoes.push({
      cod: patch.cod,
      tipo: 'acumulado',
      chave: patch.dia,
      resumo: `Acumulado ${patch.dia}: ${rotuloPatchVolumes(patch)}`,
      planilha: 'acumulado',
    })
  }

  return {
    visitas: visitas.map((v) => porCod.get(v.cod) ?? v),
    resumo: { cargas, diasAnteriores, acumulados },
    alteracoes,
  }
}

export const MODELO_CORRECAO_CARGAS = [
  'ID;Produtor;Romaneio;Peso Líquido;Peso com Desconto;Tecnologia;Data;Hora',
  '30414001;FAZENDA BOA ESPERANCA;152422;42500;41800;Declarada;15/03/2026;08:30',
  '30414002;Não informado;Não informado;;;Positiva;;',
].join('\r\n')

export const MODELO_CORRECAO_DIA_ANTERIOR = [
  'Visit ID;Dia;Negativa;Declarada;Positiva;Participante',
  '1670376;15/01/2026;0;600144;31508;0',
].join('\r\n')

export const MODELO_CORRECAO_ACUMULADO = [
  'Visit ID;Dia;Negativa;Declarada;Positiva;Participante',
  '1670376;16/01/2026;37740;0;9201736;0',
].join('\r\n')

/** rótulo curto dos campos que a linha vai alterar, para a prévia */
export function rotuloPatchCarga(p: PatchCarga): string {
  const partes: string[] = []
  if (p.produtor !== undefined || p.produtorNI) partes.push('produtor')
  if (p.romaneio !== undefined || p.romaneioNI) partes.push('romaneio')
  if (p.pesoLiquido !== undefined || p.pesoLiquidoNI) partes.push('peso líquido')
  if (p.pesoComDesconto !== undefined || p.pesoComDescontoNI) partes.push('peso c/ desconto')
  if (p.classificacao) partes.push('tecnologia')
  if (p.data) partes.push('data')
  if (p.hora) partes.push('hora')
  return partes.join(', ')
}

export function rotuloPatchVolumes(p: PatchVolumes): string {
  return CLASSIFICACOES.filter((c) => p.valores[c] !== undefined)
    .map((c) => `${c} ${p.valores[c]!.toLocaleString('pt-BR')}`)
    .join(' · ')
}
