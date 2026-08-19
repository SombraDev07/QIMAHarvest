import { gruposDeRateio, historicoAcumuladoUnidade, obterParametros, percentualDesconto } from './store'
import { CLASSIFICACOES, campoNaoInformado } from './types'
import type { AbaVisita, AcumuladoPeriodo, Carga, Classificacao, ErroLiberado, Responsavel, Visita } from './types'

export type Severidade = 'erro' | 'atencao'

export interface Alerta {
  id: string
  /** código da regra no catálogo (Administração → Parâmetros) — ex.: "3.4.7" */
  codigo: string
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
  /** quem deve tratar — Analista ou Operação */
  responsavel: Responsavel
}

const kg = (n: number) => `${Math.round(n).toLocaleString('pt-BR')} kg`
const pct = (n: number) =>
  `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

/** padrões de placa/peso claramente fictícios usados só para preencher o formulário */
const PLACAS_FICTICIAS = /^(AAA|ABC|XXX|ZZZ|000|123|TEST)/i
const PESOS_FICTICIOS = new Set([999, 1000, 1999, 2000, 2999, 3000, 5000, 9999, 10000])

/** "dd/mm/aaaa" → Date local; Date.parse leria como UTC e podia virar o dia */
function dataParaDate(data: string): Date {
  const [d, m, a] = data.split('/').map(Number)
  return new Date(a, m - 1, d)
}

/** minutos desde a meia-noite de um horário "HH:MM" */
function emMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/** minutos entre dois horários "HH:MM" da mesma data */
function diferencaMinutos(h1: string, h2: string): number {
  return Math.abs(emMinutos(h1) - emMinutos(h2))
}

type CampoNumericoPeriodo = 'negativa' | 'declarada' | 'positiva' | 'participante'

const CAMPO_PERIODO: Record<Classificacao, CampoNumericoPeriodo> = {
  Negativa: 'negativa',
  Declarada: 'declarada',
  Positiva: 'positiva',
  Participante: 'participante',
}

/**
 * 2.5 — o acumulado é cumulativo: por tecnologia, um período pode repetir o
 * valor do anterior, mas nunca ficar abaixo dele. O total também não pode
 * cair: 520 kg depois de 36 mil toneladas é acumulado menor, mesmo com dias
 * zerados no meio.
 *
 * Duas coisas que NÃO são retrocesso, e por isso ficam de fora:
 *  - período inteiro zerado é período não informado, não é queda — e também
 *    não serve de base de comparação (pula para o último dia com valor);
 *  - tecnologia zerada num período em que as outras vieram é a mesma coisa,
 *    só daquela tecnologia, desde que o total não tenha caído.
 *
 * Vale só para o acumulado. O Dia Anterior é o movimento de um dia — sobe e
 * desce conforme o que a unidade recebeu —, então não tem regra de
 * crescimento nenhuma.
 *
 * Recebe a série na ordem em que o histórico entrega (do mais novo para o mais
 * antigo) e devolve os alertas, sem depender do resto da análise.
 */
const TECNOLOGIAS = ['negativa', 'declarada', 'positiva', 'participante'] as const

const ROTULO_TECNOLOGIA: Record<(typeof TECNOLOGIAS)[number], string> = {
  negativa: 'Negativa',
  declarada: 'Declarada',
  positiva: 'Positiva',
  participante: 'Participante',
}

const periodoZerado = (p: AcumuladoPeriodo) => TECNOLOGIAS.every((t) => p[t] === 0)
const totalPeriodo = (p: AcumuladoPeriodo) => TECNOLOGIAS.reduce((s, t) => s + p[t], 0)

export function conferirSerieAcumulado(
  lista: AcumuladoPeriodo[],
  rotulo: string,
  maximo = 3,
): Alerta[] {
  const crono = [...lista].reverse() // do mais antigo para o mais novo
  const achados: Alerta[] = []
  let anterior: AcumuladoPeriodo | undefined

  for (let i = 0; i < crono.length && achados.length < maximo; i++) {
    const atual = crono[i]
    if (periodoZerado(atual)) continue
    if (!anterior) {
      anterior = atual
      continue
    }

    const base = anterior
    const caiu = TECNOLOGIAS.filter((t) => atual[t] > 0 && atual[t] < base[t])
    const totalCaiu = totalPeriodo(atual) < totalPeriodo(base)
    if (caiu.length === 0 && !totalCaiu) {
      anterior = atual
      continue
    }

    const detalhes =
      caiu.length > 0
        ? caiu
            .map(
              (t) =>
                `${ROTULO_TECNOLOGIA[t]} caiu de ${kg(base[t])} para ${kg(atual[t])}`,
            )
            .join('; ')
        : `total caiu de ${kg(totalPeriodo(base))} para ${kg(totalPeriodo(atual))}`

    achados.push({
      id: `b3-retrocesso-${rotulo}-${atual.periodo}`,
      codigo: '2.5',
      severidade: 'erro',
      regra: 'Acumulado menor que o do período anterior (2.5)',
      detalhe: `${rotulo} ${atual.periodo} vs. ${base.periodo}: ${detalhes}. O acumulado pode repetir, mas nunca diminuir.`,
      aba: 'acumulado',
      valor: caiu.length ? caiu.map((t) => ROTULO_TECNOLOGIA[t]).join(', ') : 'Total',
      responsavel: 'operacao',
    })
    anterior = atual
  }

  return achados
}

/**
 * Percorre a visita aplicando o catálogo de regras (Formulário, Acumulado,
 * Cargas, Rateio e Cargas Não Acompanhadas). Os limites numéricos que têm
 * equivalente em Administração → Parâmetros vêm de lá, assim como o
 * liga/desliga de cada regra (regrasAtivas, por código).
 *
 * Cada alerta carrega a aba/carga de destino (pro clique levar direto ao
 * ponto do problema) e um responsável (Analista/Operação). Regra geral:
 * carga com erro/atenção e sem foto anexada vai sempre para a Operação,
 * independente do responsável padrão da regra.
 */
export function analisarVisita(visita: Visita): Alerta[] {
  const {
    limiteDescontoErro: LIMITE_DESCONTO_ERRO,
    minDigitosPlaca: MIN_DIGITOS_PLACA,
    saltoMaxRomaneio: SALTO_MAX_ROMANEIO,
    toleranciaHorarioMin: TOLERANCIA_HORARIO_MIN,
    limiteDiaAnteriorTecnologia: LIMITE_DIA_ANTERIOR,
    caixaFitaMin: CAIXA_FITA_MIN,
    caixaFitaMax: CAIXA_FITA_MAX,
    regrasAtivas,
  } = obterParametros()

  const alertas: Alerta[] = []
  const cargaPorId = new Map(visita.cargas.map((c) => [c.id, c]))

  function add(
    a: Omit<Alerta, 'responsavel'> & { responsavel?: Responsavel },
  ) {
    if (regrasAtivas[a.codigo] === false) return
    const carga = a.cargaId ? cargaPorId.get(a.cargaId) : undefined
    // observação do catálogo: carga com problema e sem foto vai pra Operação
    const semFoto = !!carga && !carga.fotoUrl
    alertas.push({ ...a, responsavel: semFoto ? 'operacao' : a.responsavel ?? 'analista' })
  }

  // toda carga com problema é revisada e editada na aba Divergências,
  // independente de ela estar ou não acompanhada pelo consultor
  const abaCarga: AbaVisita = 'divergencias'

  /* ================================================================ *
   * 3. Cargas (regras 3.1 a 3.7 — aplicadas também às não acompanhadas,
   * conforme seção 5) + 5. Cargas Não Acompanhadas (5.1 a 5.3)
   * ================================================================ */
  const romaneios = new Map<string, Carga[]>()
  const pesos = new Map<string, Carga[]>()

  visita.cargas.forEach((c) => {
    const p = percentualDesconto(c)

    // 3.1.1 — horário fora da janela da visita (com tolerância). 5.2 — não
    // acompanhada que caiu dentro da janela: o auditor deveria ter visto.
    const horaCarga = emMinutos(c.hora)
    const foraDaJanela =
      horaCarga < emMinutos(visita.horaInicio) - TOLERANCIA_HORARIO_MIN ||
      horaCarga > emMinutos(visita.horaFim) + TOLERANCIA_HORARIO_MIN
    if (foraDaJanela) {
      add({
        id: `${c.id}-fora-horario`,
        codigo: '3.1.1',
        severidade: 'erro',
        regra: 'Carga fora do horário de atuação (3.1.1)',
        detalhe: `Carga ${c.id} lançada às ${c.hora}, fora da janela ${visita.horaInicio}–${visita.horaFim} da visita (tolerância de ${TOLERANCIA_HORARIO_MIN} min).`,
        aba: abaCarga,
        cargaId: c.id,
      })
    } else if (!c.acompanhada) {
      add({
        id: `${c.id}-nao-acompanhada-na-janela`,
        codigo: '5.2',
        severidade: 'erro',
        regra: 'Carga não acompanhada dentro do horário da visita (5.2)',
        detalhe: `Carga ${c.id} às ${c.hora} caiu na janela ${visita.horaInicio}–${visita.horaFim} e não foi acompanhada pelo auditor.`,
        aba: abaCarga,
        cargaId: c.id,
      })
    }

    // 3.1.2 — mesma data da visita
    if (c.data !== visita.data) {
      add({
        id: `${c.id}-data-divergente`,
        codigo: '3.1.2',
        severidade: 'erro',
        regra: 'Data da carga diferente da visita (3.1.2)',
        detalhe: `Carga ${c.id} está datada de ${c.data}, mas a visita é de ${visita.data}.`,
        aba: abaCarga,
        cargaId: c.id,
      })
    }

    // 3.2.3 — produtor não informado
    if (!c.produtor.trim() && !campoNaoInformado(c, 'produtor')) {
      add({
        id: `${c.id}-sem-produtor`,
        codigo: '3.2.3',
        severidade: 'erro',
        regra: 'Produtor não informado (3.2.3)',
        detalhe: `Carga ${c.id} foi lançada sem o nome do produtor.`,
        aba: abaCarga,
        cargaId: c.id,
      })
    } else if (/ {2,}/.test(c.produtor) || /\d/.test(c.produtor) || /[^A-Za-zÀ-ÿ .'-]/.test(c.produtor)) {
      // 3.5.1 — inconsistências no nome do produtor
      add({
        id: `${c.id}-produtor-inconsistente`,
        codigo: '3.5.1',
        severidade: 'atencao',
        regra: 'Produtor com inconsistências (3.5.1)',
        detalhe: `Carga ${c.id}: nome do produtor "${c.produtor}" tem espaços duplos, número ou caractere inválido.`,
        aba: abaCarga,
        cargaId: c.id,
      })
    }

    // 3.2.4 — os dois pesos não informados (marcado à mão não entra: vale 0 no cálculo)
    if (
      c.pesoLiquido <= 0 &&
      c.pesoComDesconto <= 0 &&
      !(campoNaoInformado(c, 'pesoLiquido') && campoNaoInformado(c, 'pesoComDesconto'))
    ) {
      add({
        id: `${c.id}-sem-pesos`,
        codigo: '3.2.4',
        severidade: 'erro',
        regra: 'Peso líquido e com desconto não informados (3.2.4)',
        detalhe: `Carga ${c.id} (placa ${c.placa}) está sem os dois pesos.`,
        aba: abaCarga,
        cargaId: c.id,
      })
    } else if (
      c.pesoComDesconto > c.pesoLiquido &&
      !campoNaoInformado(c, 'pesoLiquido') &&
      !campoNaoInformado(c, 'pesoComDesconto')
    ) {
      // 3.4.4
      add({
        id: `${c.id}-peso-invertido`,
        codigo: '3.4.4',
        severidade: 'erro',
        regra: 'Peso com desconto maior que o líquido (3.4.4)',
        detalhe: `Carga ${c.id} (placa ${c.placa}): líquido ${kg(c.pesoLiquido)} e com desconto ${kg(c.pesoComDesconto)}.`,
        aba: abaCarga,
        cargaId: c.id,
        valor: kg(c.pesoComDesconto - c.pesoLiquido),
      })
    } else if (p > LIMITE_DESCONTO_ERRO) {
      // 3.4.7
      add({
        id: `${c.id}-desconto-alto`,
        codigo: '3.4.7',
        severidade: 'erro',
        regra: `Desconto acima de ${LIMITE_DESCONTO_ERRO}% (3.4.7)`,
        detalhe: `Carga ${c.id} (placa ${c.placa}, romaneio ${c.romaneio || '—'}): desconto de ${kg(c.pesoLiquido - c.pesoComDesconto)} sobre ${kg(c.pesoLiquido)}.`,
        aba: abaCarga,
        cargaId: c.id,
        valor: pct(p),
      })
    }

    if (c.pesoLiquido > 0) {
      if (c.pesoLiquido < 10) {
        // 3.4.2
        add({
          id: `${c.id}-peso-minusculo`,
          codigo: '3.4.2',
          severidade: 'erro',
          regra: 'Peso menor que 10 kg (3.4.2)',
          detalhe: `Carga ${c.id}: peso líquido de ${kg(c.pesoLiquido)} é praticamente zero.`,
          aba: abaCarga,
          cargaId: c.id,
        })
      } else if (c.pesoLiquido > 100000) {
        // 3.4.3
        add({
          id: `${c.id}-peso-absurdo`,
          codigo: '3.4.3',
          severidade: 'erro',
          regra: 'Peso acima de 100.000 kg (3.4.3)',
          detalhe: `Carga ${c.id}: peso líquido de ${kg(c.pesoLiquido)} está fora de qualquer capacidade de caminhão.`,
          aba: abaCarga,
          cargaId: c.id,
        })
      } else if (c.pesoLiquido > 55000) {
        // 3.4.1
        add({
          id: `${c.id}-peso-tara`,
          codigo: '3.4.1',
          severidade: 'atencao',
          regra: 'Peso acima de 55.000 kg — possível tara (3.4.1)',
          detalhe: `Carga ${c.id}: peso líquido de ${kg(c.pesoLiquido)} sugere que a tara não foi descontada.`,
          aba: abaCarga,
          cargaId: c.id,
        })
      } else if (PESOS_FICTICIOS.has(Math.round(c.pesoLiquido / 1000) * 1000) || PESOS_FICTICIOS.has(c.pesoLiquido)) {
        // 3.4.6
        add({
          id: `${c.id}-peso-ficticio`,
          codigo: '3.4.6',
          severidade: 'atencao',
          regra: 'Possível peso fictício (3.4.6)',
          detalhe: `Carga ${c.id}: peso líquido de ${kg(c.pesoLiquido)} é um valor redondo comum de preenchimento de teste.`,
          aba: abaCarga,
          cargaId: c.id,
        })
      }
    }

    if (!c.romaneio.trim() && !campoNaoInformado(c, 'romaneio')) {
      // 3.2.2
      add({
        id: `${c.id}-sem-romaneio`,
        codigo: '3.2.2',
        severidade: 'erro',
        regra: 'Carga sem romaneio (3.2.2)',
        detalhe: `Carga ${c.id} (placa ${c.placa}) foi lançada sem número de romaneio.`,
        aba: abaCarga,
        cargaId: c.id,
      })
    } else {
      if (!/^\d+$/.test(c.romaneio.trim())) {
        // 3.6.1 — letras/prefixo fora do padrão numérico
        add({
          id: `${c.id}-romaneio-fora-padrao`,
        codigo: '3.6.1',
        severidade: 'erro',
          regra: 'Romaneio fora do padrão (3.6.1)',
          detalhe: `Carga ${c.id}: romaneio "${c.romaneio}" tem letras ou prefixo diferente do padrão numérico da unidade.`,
          aba: abaCarga,
          cargaId: c.id,
        })
      }
      const lista = romaneios.get(c.romaneio) ?? []
      lista.push(c)
      romaneios.set(c.romaneio, lista)
    }

    const placa = c.placa.replace(/[^A-Za-z0-9]/g, '')
    if (!placa && !campoNaoInformado(c, 'placa')) {
      // 3.2.1 / 3.3.1
      add({
        id: `${c.id}-sem-placa`,
        codigo: '3.2.1',
        severidade: 'erro',
        regra: 'Carga sem placa (3.2.1/3.3.1)',
        detalhe: `Carga ${c.id} foi lançada sem placa do caminhão.`,
        aba: abaCarga,
        cargaId: c.id,
      })
    } else if (placa.length < MIN_DIGITOS_PLACA) {
      // 3.3.2
      add({
        id: `${c.id}-placa-curta`,
        codigo: '3.3.2',
        severidade: 'erro',
        regra: `Placa com menos de ${MIN_DIGITOS_PLACA} caracteres (3.3.2)`,
        detalhe: `Carga ${c.id}: a placa "${c.placa}" tem ${placa.length} caracteres — provável digitação incompleta.`,
        aba: abaCarga,
        cargaId: c.id,
        valor: c.placa,
      })
    } else if (PLACAS_FICTICIAS.test(placa)) {
      // 3.3.3 (opcional/alerta)
      add({
        id: `${c.id}-placa-ficticia`,
        codigo: '3.3.3',
        severidade: 'atencao',
        regra: 'Possível placa fictícia (3.3.3)',
        detalhe: `Carga ${c.id}: a placa "${c.placa}" segue um padrão comum de preenchimento de teste.`,
        aba: abaCarga,
        cargaId: c.id,
      })
    }

    if (c.pesoLiquido <= 0 && c.pesoComDesconto > 0 && !campoNaoInformado(c, 'pesoLiquido')) {
      add({
        id: `${c.id}-peso-zero`,
        codigo: '3.4.8',
        severidade: 'erro',
        regra: 'Peso líquido zerado',
        detalhe: `Carga ${c.id} (placa ${c.placa}) está sem peso líquido.`,
        aba: abaCarga,
        cargaId: c.id,
      })
    }

    if (c.tecnologiaTestada === false) {
      // 3.7.1
      add({
        id: `${c.id}-tecnologia-nao-testada`,
        codigo: '3.7.1',
        severidade: 'erro',
        regra: 'Tecnologia marcada como não testada (3.7.1)',
        detalhe: `Carga ${c.id} (placa ${c.placa}) está com a tecnologia da semente sem teste de laboratório.`,
        aba: abaCarga,
        cargaId: c.id,
      })
    }

    const pesoChave = `${c.pesoLiquido}|${c.pesoComDesconto}`
    if (c.pesoLiquido > 0) {
      const lista = pesos.get(pesoChave) ?? []
      lista.push(c)
      pesos.set(pesoChave, lista)
    }
  })

  // 3.4.5 — todas as cargas da visita sem peso com desconto informado
  const semDesconto = visita.cargas.filter((c) => !campoNaoInformado(c, 'pesoComDesconto'))
  if (semDesconto.length > 0 && semDesconto.every((c) => c.pesoComDesconto <= 0)) {
    add({
      id: 'v-sem-peso-desconto',
      codigo: '3.4.5',
      severidade: 'erro',
      regra: 'Nenhuma carga com peso com desconto informado (3.4.5)',
      detalhe: 'Todas as cargas da visita estão sem o peso com desconto preenchido.',
      aba: 'visita',
    })
  }

  // 3.6.2 — romaneio duplicado quando o rateio é NÃO (dentro do mesmo grupo acompanhada/não)
  romaneios.forEach((cargas, romaneio) => {
    const semRateio = cargas.filter((c) => !c.rateio)
    if (semRateio.length < 2) return
    add({
      id: `romaneio-${romaneio}`,
      codigo: '3.6.2',
      severidade: 'erro',
      regra: 'Romaneio duplicado (3.6.2)',
      detalhe: `O romaneio ${romaneio} aparece em ${semRateio.length} cargas sem rateio: ${semRateio.map((c) => c.id).join(', ')}.`,
      aba: abaCarga,
      cargaId: semRateio[0].id,
      valor: `${semRateio.length}×`,
    })
  })

  // 4.8 — peso duplicado entre cargas (aviso se alguma estiver em rateio, erro se nenhuma estiver)
  pesos.forEach((cargas) => {
    if (cargas.length < 2) return
    const algumRateio = cargas.some((c) => c.rateio)
    add({
      id: `peso-dup-${cargas[0].id}`,
      codigo: '4.8',
      severidade: algumRateio ? 'atencao' : 'erro',
      regra: 'Peso duplicado entre cargas (4.8)',
      detalhe: `${cargas.length} cargas com o mesmo peso líquido/com desconto: ${cargas.map((c) => c.id).join(', ')}.`,
      aba: abaCarga,
      cargaId: cargas[0].id,
    })
  })

  // salto grande entre romaneios consecutivos da mesma visita (3.6.1)
  const sequencia = visita.cargas
    .filter((c) => /^\d+$/.test(c.romaneio.trim()))
    .map((c) => ({ carga: c, numero: Number(c.romaneio) }))
    .sort((a, b) => a.numero - b.numero)

  for (let i = 1; i < sequencia.length; i++) {
    const salto = sequencia[i].numero - sequencia[i - 1].numero
    if (salto <= SALTO_MAX_ROMANEIO) continue
    add({
      id: `salto-${sequencia[i].carga.id}`,
      codigo: '3.6.1',
      severidade: 'erro',
      regra: `Salto de romaneio acima de ${SALTO_MAX_ROMANEIO} (3.6.1)`,
      detalhe: `Do romaneio ${sequencia[i - 1].numero} (carga ${sequencia[i - 1].carga.id}) para ${sequencia[i].numero} (carga ${sequencia[i].carga.id}) há um salto de ${salto.toLocaleString('pt-BR')} números.`,
      aba: abaCarga,
      cargaId: sequencia[i].carga.id,
      valor: `+${salto.toLocaleString('pt-BR')}`,
    })
  }

  /* ================================================================ *
   * 5. Cargas Não Acompanhadas — 5.1 e 5.3 aqui; 5.2 (não acompanhada
   * dentro da janela) e 3.1.1 (fora da janela) rodam no laço das cargas.
   * ================================================================ */
  const acompanhadas = visita.cargas.filter((c) => c.acompanhada)
  const naoAcompanhadas = visita.cargas.filter((c) => !c.acompanhada)

  naoAcompanhadas.forEach((nc) => {
    // 5.1 — mesma carga inserida também como acompanhada (mesmo romaneio)
    const duplicadaAcompanhada = acompanhadas.find(
      (c) => c.romaneio && c.romaneio === nc.romaneio && c.placa === nc.placa,
    )
    if (duplicadaAcompanhada) {
      add({
        id: `${nc.id}-dup-acompanhada`,
        codigo: '5.1',
        severidade: 'erro',
        regra: 'Carga lançada como acompanhada e não acompanhada (5.1)',
        detalhe: `Romaneio ${nc.romaneio} (placa ${nc.placa}) aparece tanto em Não Acompanhadas (${nc.id}) quanto em Acompanhadas (${duplicadaAcompanhada.id}).`,
        aba: abaCarga,
        cargaId: nc.id,
      })
    } else if (nc.romaneio && acompanhadas.some((c) => c.romaneio === nc.romaneio)) {
      // 5.3 — romaneio duplicado com as cargas acompanhadas (placas diferentes)
      add({
        id: `${nc.id}-romaneio-cruzado`,
        codigo: '5.3',
        severidade: 'erro',
        regra: 'Romaneio duplicado com carga acompanhada (5.3)',
        detalhe: `O romaneio ${nc.romaneio} da carga não acompanhada ${nc.id} já é usado por uma carga acompanhada.`,
        aba: abaCarga,
        cargaId: nc.id,
      })
    }
  })

  /* ================================================================ *
   * 4. Rateio
   * ================================================================ */
  gruposDeRateio(visita.cargas).forEach((g) => {
    const placas = new Set(g.cargas.map((c) => c.placa))
    if (placas.size > 1) {
      add({
        id: `${g.id}-placas`,
        codigo: '4.9',
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
        codigo: '4.10',
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
        codigo: '4.11',
        severidade: 'erro',
        regra: 'Rateio com uma única carga',
        detalhe: `O grupo ${g.id} ficou com apenas uma carga.`,
        aba: 'divergencias',
        cargaId: g.cargas[0].id,
      })
    }

    if (!g.cargas.every((c) => c.grupoRateio)) {
      // 4.1 — marcado como rateio mas sem grupo/parceiro associado
      add({
        id: `${g.id}-sem-parceiro`,
        codigo: '4.1',
        severidade: 'erro',
        regra: 'Rateio sem parceiro informado (4.1)',
        detalhe: `O grupo ${g.id} tem carga marcada como rateio sem grupo associado.`,
        aba: 'divergencias',
        cargaId: g.cargas[0].id,
      })
    }

    const pesoLiquidoGrupo = g.cargas.reduce((s, c) => s + c.pesoLiquido, 0)
    const pesoDescontoGrupo = g.cargas.reduce((s, c) => s + c.pesoComDesconto, 0)

    if (pesoDescontoGrupo > pesoLiquidoGrupo) {
      // 4.2
      add({
        id: `${g.id}-peso-invertido`,
        codigo: '4.2',
        severidade: 'erro',
        regra: 'Peso com desconto do grupo maior que o líquido (4.2)',
        detalhe: `O grupo ${g.id} soma ${kg(pesoDescontoGrupo)} com desconto contra ${kg(pesoLiquidoGrupo)} líquido.`,
        aba: 'divergencias',
        cargaId: g.cargas[0].id,
      })
    } else if (pesoLiquidoGrupo > 0) {
      const descontoGrupo = ((pesoLiquidoGrupo - pesoDescontoGrupo) / pesoLiquidoGrupo) * 100
      if (descontoGrupo > LIMITE_DESCONTO_ERRO) {
        // 4.3
        add({
          id: `${g.id}-desconto-grupo`,
          codigo: '4.3',
          severidade: 'erro',
          regra: `Desconto do grupo acima de ${LIMITE_DESCONTO_ERRO}% (4.3)`,
          detalhe: `O grupo ${g.id} tem desconto médio de ${pct(descontoGrupo)}.`,
          aba: 'divergencias',
          cargaId: g.cargas[0].id,
          valor: pct(descontoGrupo),
        })
      }
    }

    if (pesoLiquidoGrupo > 70000) {
      // 4.4
      add({
        id: `${g.id}-peso-total`,
        codigo: '4.4',
        severidade: 'atencao',
        regra: 'Peso total do grupo acima de 70.000 kg (4.4)',
        detalhe: `O grupo ${g.id} soma ${kg(pesoLiquidoGrupo)} de peso líquido.`,
        aba: 'divergencias',
        cargaId: g.cargas[0].id,
      })
    }

    if (g.cargas.some((c) => c.pesoLiquido <= 0)) {
      // 4.5
      add({
        id: `${g.id}-sem-peso`,
        codigo: '4.5',
        severidade: 'erro',
        regra: 'Grupo de rateio com carga sem peso líquido (4.5)',
        detalhe: `Ao menos uma carga do grupo ${g.id} está sem peso líquido informado.`,
        aba: 'divergencias',
        cargaId: g.cargas[0].id,
      })
    }

    if (g.cargas.some((c) => c.classificacao === 'Participante')) {
      // 4.7
      add({
        id: `${g.id}-tecnologia-participante`,
        codigo: '4.7',
        severidade: 'erro',
        regra: 'Rateio com tecnologia do participante (4.7)',
        detalhe: `O grupo ${g.id} tem carga classificada como Participante — confirme a tecnologia antes de certificar.`,
        aba: 'divergencias',
        cargaId: g.cargas[0].id,
      })
    }
  })

  // 4.6 — mesma placa em menos de 10 minutos fora de um grupo de rateio já identificado
  const porPlaca = new Map<string, Carga[]>()
  visita.cargas.forEach((c) => {
    if (c.rateio) return
    const lista = porPlaca.get(c.placa) ?? []
    lista.push(c)
    porPlaca.set(c.placa, lista)
  })
  porPlaca.forEach((cargas) => {
    if (cargas.length < 2) return
    for (let i = 0; i < cargas.length; i++) {
      for (let j = i + 1; j < cargas.length; j++) {
        if (cargas[i].data !== cargas[j].data) continue
        if (diferencaMinutos(cargas[i].hora, cargas[j].hora) >= 10) continue
        add({
          id: `${cargas[i].id}-${cargas[j].id}-possivel-rateio`,
          codigo: '4.6',
          severidade: 'atencao',
          regra: 'Mesma placa em menos de 10 minutos — possível rateio (4.6)',
          detalhe: `Cargas ${cargas[i].id} e ${cargas[j].id} (placa ${cargas[i].placa}) foram lançadas com ${diferencaMinutos(cargas[i].hora, cargas[j].hora)} min de diferença, sem estarem marcadas como rateio.`,
          aba: abaCarga,
          cargaId: cargas[i].id,
        })
        return
      }
    }
  })

  /* ================================================================ *
   * 1. Formulário (bloco 2 — Dados da Visita)
   * ================================================================ */
  const d = visita.dadosVisita
  /** recebimento de soja = tem carga acompanhada; não acompanhada não conta */
  const temAcompanhadas = visita.cargas.some((c) => c.acompanhada)

  // 1.1 — visita deve estar marcada como iniciada
  if (d.visitaIniciada !== 'Sim') {
    add({
      id: 'r1-1-visita-nao-iniciada',
      codigo: '1.1',
      severidade: 'erro',
      regra: 'Visita não marcada como iniciada (1.1)',
      detalhe: 'A pergunta 2.1 (Visita foi iniciada?) não está em "Sim".',
      aba: 'visita',
      responsavel: 'analista',
    })
  }

  // 1.2 — coerência entre "Houve Recebimento" e cargas acompanhadas
  if (d.recebimentoCargas === 'Não' && temAcompanhadas) {
    add({
      id: 'b2-recebimento',
      codigo: '1.2',
      severidade: 'erro',
      regra: 'Recebimento de cargas incoerente (1.2)',
      detalhe: `A pergunta 2.2 está "Não", mas a visita tem ${visita.cargas.filter((c) => c.acompanhada).length} carga(s) acompanhada(s). Cargas não acompanhadas não contam como recebimento.`,
      aba: 'visita',
      responsavel: 'analista',
    })
  }
  if (d.recebimentoCargas === 'Sim' && !temAcompanhadas) {
    add({
      id: 'b2-sem-cargas',
      codigo: '1.2',
      severidade: 'erro',
      regra: 'Recebimento sem cargas lançadas (1.2)',
      detalhe: visita.cargas.length
        ? 'A pergunta 2.2 está "Sim", mas só há cargas não acompanhadas — recebimento vale só para acompanhadas.'
        : 'A pergunta 2.2 está "Sim", mas nenhuma carga acompanhada foi registrada.',
      aba: 'visita',
      responsavel: 'analista',
    })
  }

  // 1.3 — "Realiza testes" deve ser coerente com o resultado (caixa de fita) informado
  if (d.realizouTestes === 'Sim' && d.caixaFitaTeste === 0) {
    add({
      id: 'b2-caixa-zero',
      codigo: '1.3',
      severidade: 'erro',
      regra: 'Testes realizados sem resultado informado (1.3)',
      detalhe: 'Foram realizados testes (2.3) mas a caixa de fita teste (2.6) está zerada.',
      aba: 'visita',
      responsavel: 'analista',
    })
  }

  // 1.4 — PDR guarda as fitas testadas de forma associável às cargas?
  if (d.fitasAssociaveisCargas === 'Não') {
    add({
      id: 'r1-4-fitas-nao-associaveis',
      codigo: '1.4',
      severidade: 'erro',
      regra: 'Fitas testadas não associáveis às cargas (1.4)',
      detalhe: 'O PDR não guarda as fitas testadas de forma que seja possível associá-las às cargas.',
      aba: 'visita',
      responsavel: 'operacao',
    })
  }

  // 1.5 — reteste realizado precisa de solicitante e motivo
  if (d.houveReteste === 'Sim' && (!d.retesteSolicitante.trim() || !d.retesteMotivo.trim())) {
    add({
      id: 'b2-reteste',
      codigo: '1.5',
      severidade: 'erro',
      regra: 'Reteste sem justificativa (1.5)',
      detalhe: 'A pergunta 2.4 está "Sim" mas falta informar quem pediu o reteste e/ou o motivo.',
      aba: 'visita',
      responsavel: 'operacao',
    })
  }

  if (d.houveOcorrencia === 'Sim' && visita.ocorrencias.length === 0) {
    add({
      id: 'b2-ocorrencia-sem-registro',
      codigo: '6.1',
      severidade: 'erro',
      regra: 'Ocorrência sem registro',
      detalhe: 'A pergunta 2.5 está "Sim" mas não há ocorrência cadastrada na aba 6.',
      aba: 'ocorrencias',
    })
  }
  if (d.houveOcorrencia === 'Não' && visita.ocorrencias.length > 0) {
    add({
      id: 'b2-ocorrencia-nao',
      codigo: '6.2',
      severidade: 'erro',
      regra: 'Ocorrência não declarada',
      detalhe: `A pergunta 2.5 está "Não" mas existem ${visita.ocorrencias.length} ocorrências registradas.`,
      aba: 'visita',
    })
  }

  // 1.6 — quantidade de caixas dentro da faixa (0 = não preenchido, isento)
  if (
    d.caixaFitaTeste !== 0 &&
    (d.caixaFitaTeste < CAIXA_FITA_MIN ||
      d.caixaFitaTeste > CAIXA_FITA_MAX ||
      !Number.isInteger(d.caixaFitaTeste))
  ) {
    add({
      id: 'b2-caixa',
      codigo: '1.6',
      severidade: 'erro',
      regra: 'Caixa de fita fora da faixa (1.6)',
      detalhe: `O número da caixa de fita teste deve ficar entre ${CAIXA_FITA_MIN} e ${CAIXA_FITA_MAX}.`,
      aba: 'visita',
      valor: String(d.caixaFitaTeste),
      responsavel: 'operacao',
    })
  }

  /* ================================================================ *
   * 2. Acumulado (bloco 3 — Histórico de Acumulado)
   * ================================================================ */
  const a = visita.acumulado
  const totalAcumulado = CLASSIFICACOES.reduce((s, c) => s + a.valores[c], 0)

  // 2.1 — houve recebimento (carga acompanhada) mas não há dados de acumulado.
  // 0-0-0-0 com "não informado" é um lançamento válido, não um esquecimento.
  if (temAcompanhadas && totalAcumulado === 0 && a.informadoPeloPdr === 'Sim') {
    add({
      id: 'r2-1-recebimento-sem-acumulado',
      codigo: '2.1',
      severidade: 'erro',
      regra: 'Recebimento sem dados de acumulado (2.1)',
      detalhe:
        'A visita tem carga acompanhada, mas o acumulado (bloco 3) está zerado. Cargas não acompanhadas não caracterizam recebimento.',
      aba: 'acumulado',
      responsavel: 'analista',
    })
  }

  // 2.2 — não houve recebimento acompanhado mas há dados de acumulado
  if (!temAcompanhadas && totalAcumulado > 0) {
    add({
      id: 'r2-2-sem-recebimento-com-acumulado',
      codigo: '2.2',
      severidade: 'erro',
      regra: 'Acumulado informado sem recebimento (2.2)',
      detalhe:
        'Não há carga acompanhada (2.2 = Não), mas o acumulado (bloco 3) tem valores lançados.',
      aba: 'acumulado',
      responsavel: 'analista',
    })
  }

  if (a.origem === 'PDR' && a.informadoPeloPdr === 'Sim' && totalAcumulado === 0) {
    add({
      id: 'b3-zerado',
      codigo: '2.7',
      severidade: 'erro',
      regra: 'Acumulado informado e zerado',
      detalhe: 'O PDR informou o acumulado (3.1) mas todos os valores estão em zero.',
      aba: 'acumulado',
    })
  }

  if (CLASSIFICACOES.some((c) => a.valores[c] < 0)) {
    add({
      id: 'b3-negativo',
      codigo: '2.8',
      severidade: 'erro',
      regra: 'Acumulado com valor negativo',
      detalhe: 'Há classificação com tonelagem negativa no acumulado.',
      aba: 'acumulado',
    })
  }

  // 2.3 — acumulado inferior a 100 kg (informado, mas irrisório)
  if (totalAcumulado > 0 && totalAcumulado < 100) {
    add({
      id: 'r2-3-acumulado-baixo',
      codigo: '2.3',
      severidade: 'erro',
      regra: 'Acumulado inferior a 100 kg (2.3)',
      detalhe: `O acumulado total informado é de apenas ${kg(totalAcumulado)}.`,
      aba: 'acumulado',
      responsavel: 'operacao',
    })
  }

  /**
   * A série só tem dias com visita (ou import de acumulado). dias[0] é o próprio
   * dia auditado quando existe; o ponto de comparação é o último dia com
   * acumulado informado — dias zerados no meio não contam como véspera.
   */
  const historico = historicoAcumuladoUnidade(visita.pdr.cnpj, dataParaDate(visita.data))
  const vespera = historico.dias.find((d, i) => i > 0 && !periodoZerado(d))

  // 2.4 — crescimento diário de uma classificação acima de 2.000.000 kg
  if (vespera) {
    CLASSIFICACOES.forEach((c) => {
      const anterior = vespera[CAMPO_PERIODO[c]]
      const crescimento = a.valores[c] - anterior
      if (crescimento > 2_000_000) {
        add({
          id: `r2-4-crescimento-${c}`,
          codigo: '2.4',
          severidade: 'erro',
          regra: 'Crescimento diário acima de 2.000.000 kg (2.4)',
          detalhe: `${c}: cresceu ${kg(crescimento)} em relação à véspera (${vespera.periodo}).`,
          aba: 'acumulado',
          valor: kg(crescimento),
          responsavel: 'operacao',
        })
      }
    })

    // 2.6 — acumulado duplicado (mesmo total da véspera)
    const totalVespera =
      vespera.negativa + vespera.declarada + vespera.positiva + vespera.participante
    if (totalAcumulado > 0 && totalAcumulado === totalVespera) {
      add({
        id: 'r2-6-acumulado-duplicado',
        codigo: '2.6',
        severidade: 'erro',
        regra: 'Acumulado duplicado (2.6)',
        detalhe: `O total informado é idêntico ao da véspera (${vespera.periodo}) — confira se não foi copiado.`,
        aba: 'acumulado',
        responsavel: 'analista',
      })
    }
  }

  /**
   * No dia da visita, a série passa a valer o que a visita informou — é o que
   * a tela mostra, e a regra tem que enxergar o mesmo número que o analista.
   */
  const diasComVisita = historico.dias.map((dia, i) =>
    i === 0
      ? {
          ...dia,
          origem: a.origem,
          negativa: a.valores.Negativa,
          declarada: a.valores.Declarada,
          positiva: a.valores.Positiva,
          participante: a.valores.Participante,
        }
      : dia,
  )

  conferirSerieAcumulado(diasComVisita, 'Dia').forEach(add)
  conferirSerieAcumulado(historico.meses, 'Mês').forEach(add)

  /* ------------------------------------------------------ dia anterior *
   * Lançamento manual do auditor, então as duas regras aqui protegem o
   * erro de digitação: valor fora de escala e o mesmo dia lançado duas vezes.
   * ------------------------------------------------------------------- */
  visita.diaAnterior.forEach((d) => {
    // 2.9 — teto por tecnologia
    const acima = CLASSIFICACOES.filter((c) => d.valores[c] > LIMITE_DIA_ANTERIOR)
    if (acima.length > 0) {
      add({
        id: `${d.id}-acima-do-teto`,
        codigo: '2.9',
        severidade: 'erro',
        regra: 'Dia Anterior acima do teto por tecnologia (2.9)',
        detalhe: `Lançamento de ${d.data}: ${acima
          .map((c) => `${c} com ${kg(d.valores[c])}`)
          .join(', ')} — acima do teto de ${kg(LIMITE_DIA_ANTERIOR)} por tecnologia.`,
        aba: 'dia-anterior',
      })
    }
  })

  // 2.10 — duas linhas para a mesma data
  const porData = new Map<string, number>()
  visita.diaAnterior.forEach((d) => porData.set(d.data, (porData.get(d.data) ?? 0) + 1))
  porData.forEach((quantidade, data) => {
    if (quantidade < 2) return
    add({
      id: `dia-anterior-duplicado-${data}`,
      codigo: '2.10',
      severidade: 'erro',
      regra: 'Dia Anterior duplicado na mesma data (2.10)',
      detalhe: `Existem ${quantidade} lançamentos de Dia Anterior para ${data}. Só pode haver um por data.`,
      aba: 'dia-anterior',
    })
  })

  /* ------------------------------------------------------- ocorrências */
  visita.ocorrencias.forEach((o) => {
    if (o.cargaId && !visita.cargas.some((c) => c.id === o.cargaId)) {
      add({
        id: `${o.id}-carga-inexistente`,
        codigo: '6.3',
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
