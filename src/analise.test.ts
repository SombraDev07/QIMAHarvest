import { beforeEach, describe, expect, it } from 'vitest'
import { analisarVisita, conferirSerieAcumulado } from './analise'
import { obterParametros, salvarParametros } from './store'
import { VISITAS_INICIAIS } from './data/mock'
import type { AcumuladoPeriodo, Carga, Visita } from './types'

/**
 * Testes do motor de regras. Montar uma Visita inteira à mão seria ruído — o
 * que cada caso quer dizer está nas cargas —, então partimos de uma visita real
 * da base e trocamos só o que a regra sob teste enxerga.
 */
const BASE = VISITAS_INICIAIS[0]

const carga = (patch: Partial<Carga> = {}): Carga => ({
  id: '900001',
  data: BASE.data,
  hora: '10:00',
  placa: 'ABC1D23',
  produtor: 'FAZENDA TESTE',
  cpfCnpjProdutor: '123.456.789-00',
  romaneio: '150001',
  pesoLiquido: 40000,
  pesoComDesconto: 39000,
  classificacao: 'Participante',
  rateio: false,
  acompanhada: true,
  ...patch,
})

const visitaCom = (cargas: Carga[], patch: Partial<Visita> = {}): Visita => ({
  ...BASE,
  horaInicio: '15:00',
  horaFim: '17:00',
  cargas,
  ...patch,
})

/** só os códigos, que é o que identifica a regra no catálogo */
const codigos = (v: Visita) => analisarVisita(v).map((a) => a.codigo)

const PADRAO = obterParametros()
beforeEach(() => {
  // analisarVisita lê os parâmetros do store; um teste não pode vazar no outro
  salvarParametros(PADRAO)
})

describe('3.1.1 — carga fora do horário da visita', () => {
  it('não acusa dentro da janela', () => {
    expect(codigos(visitaCom([carga({ hora: '16:00' })]))).not.toContain('3.1.1')
  })

  it('não acusa dentro da tolerância de 60 min', () => {
    // janela 15:00–17:00: 14:20 está 40 min antes, 17:45 está 45 min depois
    expect(codigos(visitaCom([carga({ hora: '14:20' })]))).not.toContain('3.1.1')
    expect(codigos(visitaCom([carga({ hora: '17:45' })]))).not.toContain('3.1.1')
  })

  it('acusa passada a tolerância', () => {
    expect(codigos(visitaCom([carga({ hora: '09:13' })]))).toContain('3.1.1')
    expect(codigos(visitaCom([carga({ hora: '18:25' })]))).toContain('3.1.1')
  })

  it('trata a borda exata como dentro', () => {
    // 14:00 é exatamente 60 min antes do início
    expect(codigos(visitaCom([carga({ hora: '14:00' })]))).not.toContain('3.1.1')
    expect(codigos(visitaCom([carga({ hora: '13:59' })]))).toContain('3.1.1')
  })

  it('respeita a tolerância configurada em Parâmetros', () => {
    salvarParametros({ ...PADRAO, toleranciaHorarioMin: 0 })
    expect(codigos(visitaCom([carga({ hora: '14:20' })]))).toContain('3.1.1')

    salvarParametros({ ...PADRAO, toleranciaHorarioMin: 120 })
    expect(codigos(visitaCom([carga({ hora: '13:30' })]))).not.toContain('3.1.1')
  })

  it('cita a tolerância no detalhe, para o analista saber o critério', () => {
    const alerta = analisarVisita(visitaCom([carga({ hora: '09:13' })])).find(
      (a) => a.codigo === '3.1.1',
    )
    expect(alerta?.detalhe).toContain('tolerância de 60 min')
  })
})

describe('3.1.2 — data da carga diferente da visita', () => {
  it('acusa data divergente', () => {
    expect(codigos(visitaCom([carga({ data: '01/01/2020' })]))).toContain('3.1.2')
  })

  it('não acusa na mesma data', () => {
    expect(codigos(visitaCom([carga({ data: BASE.data })]))).not.toContain('3.1.2')
  })
})

describe('3.2 — campos obrigatórios da carga', () => {
  it('acusa carga sem placa', () => {
    expect(codigos(visitaCom([carga({ placa: '' })]))).toContain('3.2.1')
  })

  it('acusa carga sem romaneio', () => {
    expect(codigos(visitaCom([carga({ romaneio: '' })]))).toContain('3.2.2')
  })

  it('acusa carga sem produtor', () => {
    expect(codigos(visitaCom([carga({ produtor: '' })]))).toContain('3.2.3')
  })

  it('não acusa campos marcados como não informados', () => {
    const c = codigos(
      visitaCom([
        carga({
          placa: '',
          romaneio: '',
          produtor: '',
          pesoLiquido: 0,
          pesoComDesconto: 0,
          naoInformado: {
            placa: true,
            romaneio: true,
            produtor: true,
            pesoLiquido: true,
            pesoComDesconto: true,
          },
        }),
      ]),
    )
    expect(c).not.toContain('3.2.1')
    expect(c).not.toContain('3.2.2')
    expect(c).not.toContain('3.2.3')
    expect(c).not.toContain('3.2.4')
  })
})

describe('3.4 — pesos', () => {
  it('acusa peso com desconto maior que o líquido', () => {
    expect(codigos(visitaCom([carga({ pesoLiquido: 30000, pesoComDesconto: 31000 })]))).toContain(
      '3.4.4',
    )
  })

  it('acusa desconto acima do limite configurado', () => {
    // 40.000 → 25.000 é 37,5% de desconto, acima do padrão de 25%
    const alertas = codigos(visitaCom([carga({ pesoLiquido: 40000, pesoComDesconto: 25000 })]))
    expect(alertas.some((c) => c.startsWith('3.4'))).toBe(true)
  })
})

describe('liga/desliga de regra em Parâmetros', () => {
  it('regra desligada some da análise', () => {
    const v = visitaCom([carga({ hora: '09:13' })])
    expect(codigos(v)).toContain('3.1.1')

    salvarParametros({ ...PADRAO, regrasAtivas: { ...PADRAO.regrasAtivas, '3.1.1': false } })
    expect(codigos(v)).not.toContain('3.1.1')
  })

  it('desligar uma regra não afeta as outras', () => {
    const v = visitaCom([carga({ hora: '09:13', romaneio: '' })])
    salvarParametros({ ...PADRAO, regrasAtivas: { ...PADRAO.regrasAtivas, '3.1.1': false } })
    const resultado = codigos(v)
    expect(resultado).not.toContain('3.1.1')
    expect(resultado).toContain('3.2.2')
  })
})

describe('2.5 — acumulado não pode diminuir', () => {
  const dia = (
    periodo: string,
    v: Partial<Record<'negativa' | 'declarada' | 'positiva' | 'participante', number>>,
  ): AcumuladoPeriodo => ({
    periodo,
    origem: 'PDR',
    negativa: 0,
    declarada: 0,
    positiva: 0,
    participante: 0,
    cargas: 0,
    visitas: 0,
    ...v,
  })

  /** a série chega da mais nova para a mais antiga, como o histórico devolve */
  const comSerie = (dias: AcumuladoPeriodo[]) =>
    conferirSerieAcumulado(dias, 'Dia').map((a) => a.codigo)

  it('não acusa quando repete o valor', () => {
    expect(
      comSerie([dia('02/06/2026', { negativa: 100 }), dia('01/06/2026', { negativa: 100 })]),
    ).not.toContain('2.5')
  })

  it('não acusa quando cresce', () => {
    expect(
      comSerie([dia('02/06/2026', { negativa: 150 }), dia('01/06/2026', { negativa: 100 })]),
    ).not.toContain('2.5')
  })

  it('acusa quando uma tecnologia diminui', () => {
    expect(
      comSerie([dia('02/06/2026', { negativa: 90 }), dia('01/06/2026', { negativa: 100 })]),
    ).toContain('2.5')
  })

  /**
   * O ponto que motivou a regra: dia inteiro zerado é dia não informado. Antes
   * a comparação era pelo total, então um dia sem informação virava "queda".
   */
  it('não acusa período inteiro zerado — é não informado, não é queda', () => {
    expect(
      comSerie([dia('02/06/2026', {}), dia('01/06/2026', { negativa: 100, positiva: 50 })]),
    ).not.toContain('2.5')
  })

  it('não acusa tecnologia zerada isoladamente', () => {
    // Negativa veio zerada, mas Positiva cresceu: aquela tecnologia não foi informada
    expect(
      comSerie([
        dia('02/06/2026', { negativa: 0, positiva: 80 }),
        dia('01/06/2026', { negativa: 100, positiva: 50 }),
      ]),
    ).not.toContain('2.5')
  })

  it('acusa mesmo quando o total sobe, se uma tecnologia caiu', () => {
    // total vai de 150 para 190, mas Negativa caiu de 100 para 20
    const codigos = comSerie([
      dia('02/06/2026', { negativa: 20, positiva: 170 }),
      dia('01/06/2026', { negativa: 100, positiva: 50 }),
    ])
    expect(codigos).toContain('2.5')
  })

  it('cita no detalhe qual tecnologia caiu, e só ela', () => {
    const alerta = conferirSerieAcumulado(
      [
        dia('02/06/2026', { negativa: 20, positiva: 170 }),
        dia('01/06/2026', { negativa: 100, positiva: 50 }),
      ],
      'Dia',
    )[0]

    expect(alerta.detalhe).toContain('Negativa caiu')
    expect(alerta.detalhe).toContain('kg')
    expect(alerta.detalhe).not.toContain('Positiva caiu')
    expect(alerta.valor).toBe('Negativa')
  })
})

describe('Dia Anterior não tem regra de crescimento', () => {
  const lanc = (data: string, valores: Partial<Record<string, number>>) => ({
    id: `DA-${data}`,
    data,
    informouDiaAnterior: 'Sim' as const,
    valores: {
      Negativa: 0,
      Declarada: 0,
      Positiva: 0,
      Participante: 0,
      ...valores,
    } as Record<'Negativa' | 'Declarada' | 'Positiva' | 'Participante', number>,
  })

  it('valor menor que o do dia anterior não acrescenta nenhum alerta', () => {
    /**
     * O Dia Anterior é o movimento do dia: sobe e desce conforme o recebimento.
     * A comparação é contra a mesma visita sem lançamento nenhum — assim o teste
     * isola o efeito do Dia Anterior e não se confunde com as regras do
     * acumulado, que rodam de qualquer jeito.
     */
    const semLancamento = codigos(visitaCom([], { diaAnterior: [] }))
    const decrescente = codigos(
      visitaCom([], {
        diaAnterior: [
          lanc('01/06/2026', { Negativa: 500_000 }),
          lanc('02/06/2026', { Negativa: 10_000 }),
          lanc('03/06/2026', { Negativa: 250_000 }),
        ],
      }),
    )

    expect(decrescente).toEqual(semLancamento)
  })
})

describe('2.9 / 2.10 — Dia Anterior', () => {
  const lancamento = (id: string, data: string, valores: Partial<Record<string, number>> = {}) => ({
    id,
    data,
    // um lançamento com valor só existe depois do "Sim"
    informouDiaAnterior: (Object.keys(valores).length ? 'Sim' : 'Não') as 'Sim' | 'Não',
    valores: {
      Negativa: 0,
      Declarada: 0,
      Positiva: 0,
      Participante: 0,
      ...valores,
    } as Record<'Negativa' | 'Declarada' | 'Positiva' | 'Participante', number>,
  })

  const comDiaAnterior = (lista: ReturnType<typeof lancamento>[]) =>
    codigos(visitaCom([], { diaAnterior: lista }))

  it('não acusa lançamento dentro do teto', () => {
    expect(comDiaAnterior([lancamento('DA1', '01/06/2026', { Positiva: 2_999_999 })])).not.toContain(
      '2.9',
    )
  })

  it('trata o teto exato como válido', () => {
    expect(comDiaAnterior([lancamento('DA1', '01/06/2026', { Positiva: 3_000_000 })])).not.toContain(
      '2.9',
    )
  })

  it('acusa tecnologia acima de 3 milhões', () => {
    expect(comDiaAnterior([lancamento('DA1', '01/06/2026', { Positiva: 3_000_001 })])).toContain(
      '2.9',
    )
  })

  it('cita quais tecnologias estouraram', () => {
    const alerta = analisarVisita(
      visitaCom([], {
        diaAnterior: [lancamento('DA1', '01/06/2026', { Positiva: 4e6, Negativa: 5e6 })],
      }),
    ).find((a) => a.codigo === '2.9')

    expect(alerta?.detalhe).toContain('Negativa')
    expect(alerta?.detalhe).toContain('Positiva')
    expect(alerta?.detalhe).not.toContain('Declarada')
  })

  it('não acusa duplicidade com datas diferentes', () => {
    expect(
      comDiaAnterior([lancamento('DA1', '01/06/2026'), lancamento('DA2', '02/06/2026')]),
    ).not.toContain('2.10')
  })

  it('acusa duas linhas na mesma data', () => {
    expect(
      comDiaAnterior([lancamento('DA1', '01/06/2026'), lancamento('DA2', '01/06/2026')]),
    ).toContain('2.10')
  })

  it('acusa uma vez só por data repetida, não uma por linha', () => {
    const alertas = analisarVisita(
      visitaCom([], {
        diaAnterior: [
          lancamento('DA1', '01/06/2026'),
          lancamento('DA2', '01/06/2026'),
          lancamento('DA3', '01/06/2026'),
        ],
      }),
    ).filter((a) => a.codigo === '2.10')

    expect(alertas).toHaveLength(1)
    expect(alertas[0].detalhe).toContain('3 lançamentos')
  })

  it('manda o analista para a aba Dia Anterior', () => {
    const alerta = analisarVisita(
      visitaCom([], { diaAnterior: [lancamento('DA1', '01/06/2026', { Positiva: 4e6 })] }),
    ).find((a) => a.codigo === '2.9')
    expect(alerta?.aba).toBe('dia-anterior')
  })

  it('respeita o teto configurado em Parâmetros', () => {
    salvarParametros({ ...PADRAO, limiteDiaAnteriorTecnologia: 1_000_000 })
    expect(comDiaAnterior([lancamento('DA1', '01/06/2026', { Positiva: 2e6 })])).toContain('2.9')
  })

  it('some quando a regra é desligada', () => {
    salvarParametros({ ...PADRAO, regrasAtivas: { ...PADRAO.regrasAtivas, '2.9': false } })
    expect(comDiaAnterior([lancamento('DA1', '01/06/2026', { Positiva: 4e6 })])).not.toContain('2.9')
  })
})

describe('formato do alerta', () => {
  it('todo alerta aponta para onde o analista deve ir', () => {
    for (const a of analisarVisita(visitaCom([carga({ hora: '09:13', romaneio: '' })]))) {
      expect(a.id).toBeTruthy()
      expect(a.codigo).toBeTruthy()
      expect(a.detalhe).toBeTruthy()
      expect(a.aba).toBeTruthy()
      expect(['erro', 'atencao']).toContain(a.severidade)
    }
  })

  it('não repete id de alerta na mesma visita', () => {
    const ids = analisarVisita(BASE).map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('1.2 / 2.1 — recebimento só conta carga acompanhada', () => {
  const zerado = {
    ...BASE.acumulado,
    valores: { Negativa: 0, Declarada: 0, Positiva: 0, Participante: 0 },
  }

  it('não acusa 1.2 quando 2.2 é Não e só há não acompanhadas', () => {
    expect(
      codigos(
        visitaCom([carga({ acompanhada: false })], {
          dadosVisita: { ...BASE.dadosVisita, recebimentoCargas: 'Não' },
          acumulado: zerado,
        }),
      ),
    ).not.toContain('1.2')
  })

  it('não acusa 2.1 quando só há não acompanhadas e o acumulado está zerado', () => {
    expect(
      codigos(
        visitaCom([carga({ acompanhada: false })], {
          dadosVisita: { ...BASE.dadosVisita, recebimentoCargas: 'Não' },
          acumulado: zerado,
        }),
      ),
    ).not.toContain('2.1')
  })

  it('acusa 2.1 quando há acompanhada, o PDR informou e o acumulado está zerado', () => {
    expect(
      codigos(
        visitaCom([carga({ acompanhada: true })], {
          dadosVisita: { ...BASE.dadosVisita, recebimentoCargas: 'Sim' },
          acumulado: { ...zerado, informadoPeloPdr: 'Sim' },
        }),
      ),
    ).toContain('2.1')
  })

  it('não acusa 2.1 nem 2.7 quando o acumulado é 0-0-0-0 e não informado', () => {
    const c = codigos(
      visitaCom([carga({ acompanhada: true })], {
        dadosVisita: { ...BASE.dadosVisita, recebimentoCargas: 'Sim' },
        acumulado: { ...zerado, informadoPeloPdr: 'Não' },
      }),
    )
    expect(c).not.toContain('2.1')
    expect(c).not.toContain('2.7')
  })
})

/**
 * Rede de segurança contra mudança acidental de comportamento: se um ajuste
 * numa regra mexer no total da base inteira, este teste avisa. Ao mudar uma
 * regra de propósito, atualize o número — de propósito.
 */
describe('base completa', () => {
  it('mantém o total de alertas da safra', () => {
    const total = VISITAS_INICIAIS.reduce((s, v) => s + analisarVisita(v).length, 0)
    expect(total).toBe(4792)
  })
})
