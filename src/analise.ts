import { historicoAcumuladoPorCnpj } from './data/mock'
import { gruposDeRateio, percentualDesconto } from './store'
import { CAIXA_FITA_MAX, CAIXA_FITA_MIN, CLASSIFICACOES } from './types'
import type { AbaVisita, AcumuladoPeriodo, ErroLiberado, Visita } from './types'

export type Severidade = 'erro' | 'atencao'

export interface Alerta {
  id: string
  severidade: Severidade
  /** nome curto da regra quebrada */
  regra: string
  /** o que exatamente foi encontrado */
  detalhe: string
  /** aba para onde o analista deve ser levado */
  aba: AbaVisita
  /** carga de origem, quando o problema é de uma carga específica */
  cargaId?: string
  /** valor que disparou a regra, exibido em destaque */
  valor?: string
}

/* limites de negócio */
export const LIMITE_DESCONTO_ERRO = 30
/** placa válida tem ao menos 6 caracteres alfanuméricos */
export const MIN_DIGITOS_PLACA = 6
/** salto tolerado entre romaneios consecutivos da mesma visita */
export const SALTO_MAX_ROMANEIO = 500

const kg = (n: number) => `${Math.round(n).toLocaleString('pt-BR')} kg`
const pct = (n: number) =>
  `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

/**
 * Percorre a visita aplicando as regras de consistência.
 * Cada alerta carrega a aba (e a carga) de destino para o clique levar
 * o analista direto ao ponto do problema.
 */
export function analisarVisita(visita: Visita): Alerta[] {
  const alertas: Alerta[] = []
  const add = (a: Alerta) => alertas.push(a)
  // toda carga com problema é revisada e editada na aba Divergências,
  // independente de ela estar ou não acompanhada pelo consultor
  const abaDaCarga = (_acompanhada: boolean): AbaVisita => 'divergencias'

  /* ----------------------------------------------------------- cargas */
  const romaneios = new Map<string, number>()

  visita.cargas.forEach((c) => {
    const p = percentualDesconto(c)

    if (c.pesoComDesconto > c.pesoLiquido) {
      add({
        id: `${c.id}-peso-invertido`,
        severidade: 'erro',
        regra: 'Peso com desconto maior que o líquido',
        detalhe: `Carga ${c.id} (placa ${c.placa}): líquido ${kg(c.pesoLiquido)} e com desconto ${kg(c.pesoComDesconto)}.`,
        aba: abaDaCarga(c.acompanhada),
        cargaId: c.id,
        valor: kg(c.pesoComDesconto - c.pesoLiquido),
      })
    } else if (p > LIMITE_DESCONTO_ERRO) {
      add({
        id: `${c.id}-desconto-alto`,
        severidade: 'erro',
        regra: `Desconto acima de ${LIMITE_DESCONTO_ERRO}%`,
        detalhe: `Carga ${c.id} (placa ${c.placa}, romaneio ${c.romaneio || '—'}): desconto de ${kg(c.pesoLiquido - c.pesoComDesconto)} sobre ${kg(c.pesoLiquido)}.`,
        aba: abaDaCarga(c.acompanhada),
        cargaId: c.id,
        valor: pct(p),
      })
    }

    if (!c.romaneio.trim()) {
      add({
        id: `${c.id}-sem-romaneio`,
        severidade: 'erro',
        regra: 'Carga sem romaneio',
        detalhe: `Carga ${c.id} (placa ${c.placa}) foi lançada sem número de romaneio.`,
        aba: abaDaCarga(c.acompanhada),
        cargaId: c.id,
      })
    } else {
      romaneios.set(c.romaneio, (romaneios.get(c.romaneio) ?? 0) + 1)
    }

    const placa = c.placa.replace(/[^A-Za-z0-9]/g, '')
    if (!placa) {
      add({
        id: `${c.id}-sem-placa`,
        severidade: 'erro',
        regra: 'Carga sem placa',
        detalhe: `Carga ${c.id} foi lançada sem placa do caminhão.`,
        aba: abaDaCarga(c.acompanhada),
        cargaId: c.id,
      })
    } else if (placa.length < MIN_DIGITOS_PLACA) {
      add({
        id: `${c.id}-placa-curta`,
        severidade: 'erro',
        regra: `Placa com menos de ${MIN_DIGITOS_PLACA} caracteres`,
        detalhe: `Carga ${c.id}: a placa "${c.placa}" tem ${placa.length} caracteres — provável digitação incompleta.`,
        aba: abaDaCarga(c.acompanhada),
        cargaId: c.id,
        valor: c.placa,
      })
    }

    if (c.pesoLiquido <= 0) {
      add({
        id: `${c.id}-peso-zero`,
        severidade: 'erro',
        regra: 'Peso líquido zerado',
        detalhe: `Carga ${c.id} (placa ${c.placa}) está sem peso líquido.`,
        aba: abaDaCarga(c.acompanhada),
        cargaId: c.id,
      })
    }
  })

  // romaneio repetido dentro da mesma visita
  romaneios.forEach((qtd, romaneio) => {
    if (qtd < 2) return
    const envolvidas = visita.cargas.filter((c) => c.romaneio === romaneio)
    add({
      id: `romaneio-${romaneio}`,
      severidade: 'erro',
      regra: 'Romaneio duplicado',
      detalhe: `O romaneio ${romaneio} aparece em ${qtd} cargas: ${envolvidas.map((c) => c.id).join(', ')}.`,
      aba: abaDaCarga(envolvidas[0].acompanhada),
      cargaId: envolvidas[0].id,
      valor: `${qtd}×`,
    })
  })

  // salto grande entre romaneios consecutivos da mesma visita
  const sequencia = visita.cargas
    .filter((c) => /^\d+$/.test(c.romaneio.trim()))
    .map((c) => ({ carga: c, numero: Number(c.romaneio) }))
    .sort((a, b) => a.numero - b.numero)

  for (let i = 1; i < sequencia.length; i++) {
    const salto = sequencia[i].numero - sequencia[i - 1].numero
    if (salto <= SALTO_MAX_ROMANEIO) continue
    add({
      id: `salto-${sequencia[i].carga.id}`,
      severidade: 'erro',
      regra: `Salto de romaneio acima de ${SALTO_MAX_ROMANEIO}`,
      detalhe: `Do romaneio ${sequencia[i - 1].numero} (carga ${sequencia[i - 1].carga.id}) para ${sequencia[i].numero} (carga ${sequencia[i].carga.id}) há um salto de ${salto.toLocaleString('pt-BR')} números.`,
      aba: abaDaCarga(sequencia[i].carga.acompanhada),
      cargaId: sequencia[i].carga.id,
      valor: `+${salto.toLocaleString('pt-BR')}`,
    })
  }

  /* --------------------------------------------------------- rateios */
  gruposDeRateio(visita.cargas).forEach((g) => {
    const placas = new Set(g.cargas.map((c) => c.placa))
    if (placas.size > 1) {
      add({
        id: `${g.id}-placas`,
        severidade: 'erro',
        regra: 'Rateio com placas divergentes',
        detalhe: `O grupo ${g.id} tem ${placas.size} placas diferentes (${[...placas].join(', ')}); um rateio é sempre o mesmo caminhão.`,
        aba: 'divergencias',
        cargaId: g.cargas[0].id,
      })
    }

    const classes = new Set(g.cargas.map((c) => c.classificacao))
    if (classes.size > 1) {
      add({
        id: `${g.id}-classificacoes`,
        severidade: 'erro',
        regra: 'Rateio com classificações divergentes',
        detalhe: `O grupo ${g.id} mistura ${[...classes].join(', ')}.`,
        aba: 'divergencias',
        cargaId: g.cargas[0].id,
      })
    }

    if (g.cargas.length < 2) {
      add({
        id: `${g.id}-unico`,
        severidade: 'atencao',
        regra: 'Rateio com uma única carga',
        detalhe: `O grupo ${g.id} ficou com apenas uma carga.`,
        aba: 'divergencias',
        cargaId: g.cargas[0].id,
      })
    }
  })

  /* ---------------------------------------------- bloco 2 — coerência */
  const d = visita.dadosVisita
  const temCargas = visita.cargas.length > 0

  if (d.recebimentoCargas === 'Não' && temCargas) {
    add({
      id: 'b2-recebimento',
      severidade: 'erro',
      regra: 'Recebimento de cargas incoerente',
      detalhe: `A pergunta 2.2 está "Não", mas a visita tem ${visita.cargas.length} cargas lançadas.`,
      aba: 'visita',
    })
  }

  if (d.recebimentoCargas === 'Sim' && !temCargas) {
    add({
      id: 'b2-sem-cargas',
      severidade: 'erro',
      regra: 'Recebimento sem cargas lançadas',
      detalhe: 'A pergunta 2.2 está "Sim", mas nenhuma carga foi registrada.',
      aba: 'visita',
    })
  }

  if (d.houveReteste === 'Sim' && (!d.retesteSolicitante.trim() || !d.retesteMotivo.trim())) {
    add({
      id: 'b2-reteste',
      severidade: 'erro',
      regra: 'Reteste sem justificativa',
      detalhe: 'A pergunta 2.4 está "Sim" mas falta informar quem pediu o reteste e/ou o motivo.',
      aba: 'visita',
    })
  }

  if (d.houveOcorrencia === 'Sim' && visita.ocorrencias.length === 0) {
    add({
      id: 'b2-ocorrencia-sem-registro',
      severidade: 'atencao',
      regra: 'Ocorrência sem registro',
      detalhe: 'A pergunta 2.5 está "Sim" mas não há ocorrência cadastrada na aba 6.',
      aba: 'ocorrencias',
    })
  }

  if (d.houveOcorrencia === 'Não' && visita.ocorrencias.length > 0) {
    add({
      id: 'b2-ocorrencia-nao',
      severidade: 'erro',
      regra: 'Ocorrência não declarada',
      detalhe: `A pergunta 2.5 está "Não" mas existem ${visita.ocorrencias.length} ocorrências registradas.`,
      aba: 'visita',
    })
  }

  if (
    d.caixaFitaTeste < CAIXA_FITA_MIN ||
    d.caixaFitaTeste > CAIXA_FITA_MAX ||
    !Number.isInteger(d.caixaFitaTeste)
  ) {
    add({
      id: 'b2-caixa',
      severidade: 'erro',
      regra: 'Caixa de fita fora da faixa',
      detalhe: `O número da caixa de fita teste deve ficar entre ${CAIXA_FITA_MIN} e ${CAIXA_FITA_MAX}.`,
      aba: 'visita',
      valor: String(d.caixaFitaTeste),
    })
  }

  if (d.realizouTestes === 'Sim' && d.caixaFitaTeste === 0) {
    add({
      id: 'b2-caixa-zero',
      severidade: 'atencao',
      regra: 'Caixa de fita não informada',
      detalhe: 'Foram realizados testes (2.3) mas a caixa de fita teste (2.6) está zerada.',
      aba: 'visita',
    })
  }

  /* ------------------------------------------------ bloco 3 — acumulado */
  const a = visita.acumulado
  const totalAcumulado = CLASSIFICACOES.reduce((s, c) => s + a.valores[c], 0)

  if (a.origem === 'PDR' && a.informadoPeloPdr === 'Sim' && totalAcumulado === 0) {
    add({
      id: 'b3-zerado',
      severidade: 'erro',
      regra: 'Acumulado informado e zerado',
      detalhe: 'O PDR informou o acumulado (3.1) mas todos os valores estão em zero.',
      aba: 'acumulado',
    })
  }

  if (CLASSIFICACOES.some((c) => a.valores[c] < 0)) {
    add({
      id: 'b3-negativo',
      severidade: 'erro',
      regra: 'Acumulado com valor negativo',
      detalhe: 'Há classificação com tonelagem negativa no acumulado.',
      aba: 'acumulado',
    })
  }

  // o acumulado é cumulativo: um período nunca pode valer menos que o anterior
  const historico = historicoAcumuladoPorCnpj(visita.pdr.cnpj)
  const totalPeriodo = (p: AcumuladoPeriodo) =>
    p.negativa + p.declarada + p.positiva + p.participante

  const conferirSerie = (lista: AcumuladoPeriodo[], rotulo: string) => {
    const crono = [...lista].reverse() // do mais antigo para o mais novo
    let encontrados = 0
    for (let i = 1; i < crono.length && encontrados < 3; i++) {
      const anterior = totalPeriodo(crono[i - 1])
      const atual = totalPeriodo(crono[i])
      if (atual >= anterior) continue
      encontrados++
      add({
        id: `b3-retrocesso-${rotulo}-${crono[i].periodo}`,
        severidade: 'erro',
        regra: 'Acumulado menor que o do período anterior',
        detalhe: `${rotulo} ${crono[i].periodo} soma ${atual.toLocaleString('pt-BR')} t, abaixo dos ${anterior.toLocaleString('pt-BR')} t de ${crono[i - 1].periodo}. Acumulado não pode diminuir.`,
        aba: 'acumulado',
        valor: `−${(anterior - atual).toLocaleString('pt-BR')} t`,
      })
    }
  }

  conferirSerie(historico.dias, 'Dia')
  conferirSerie(historico.meses, 'Mês')

  /* ------------------------------------------------------- ocorrências */
  visita.ocorrencias.forEach((o) => {
    if (o.cargaId && !visita.cargas.some((c) => c.id === o.cargaId)) {
      add({
        id: `${o.id}-carga-inexistente`,
        severidade: 'erro',
        regra: 'Ocorrência apontando carga inexistente',
        detalhe: `A ocorrência ${o.id} referencia a carga ${o.cargaId}, que não está mais na visita.`,
        aba: 'ocorrencias',
      })
    }
  })

  // erros primeiro, depois atenções
  return alertas.sort((x, y) => (x.severidade === y.severidade ? 0 : x.severidade === 'erro' ? -1 : 1))
}

export function resumoAnalise(alertas: Alerta[]) {
  return {
    erros: alertas.filter((a) => a.severidade === 'erro').length,
    atencoes: alertas.filter((a) => a.severidade === 'atencao').length,
    total: alertas.length,
  }
}

/** alertas indexados por carga, para pintar as linhas da tabela */
export function problemasPorCarga(alertas: Alerta[]): Map<string, Alerta[]> {
  const mapa = new Map<string, Alerta[]>()
  alertas.forEach((a) => {
    if (!a.cargaId) return
    const lista = mapa.get(a.cargaId) ?? []
    lista.push(a)
    mapa.set(a.cargaId, lista)
  })
  return mapa
}

/**
 * Separa os alertas já liberados manualmente dos que ainda bloqueiam a
 * certificação. Um erro liberado continua visível, mas com a justificativa.
 */
export function aplicarLiberacoes(alertas: Alerta[], liberados: ErroLiberado[]) {
  const porId = new Map(liberados.map((l) => [l.alertaId, l]))
  const ativos: Alerta[] = []
  const perdoados: { alerta: Alerta; liberacao: ErroLiberado }[] = []

  alertas.forEach((a) => {
    const liberacao = porId.get(a.id)
    if (liberacao) perdoados.push({ alerta: a, liberacao })
    else ativos.push(a)
  })

  return { ativos, perdoados }
}

export const severidadeDaCarga = (lista?: Alerta[]): Severidade | undefined =>
  !lista?.length ? undefined : lista.some((a) => a.severidade === 'erro') ? 'erro' : 'atencao'
