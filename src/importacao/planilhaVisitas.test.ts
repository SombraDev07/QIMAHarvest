import { describe, expect, it } from 'vitest'
import {
  agruparCargas,
  analisarPlanilhaCargas,
  analisarPlanilhaVisitas,
} from './planilhaVisitas'
import { numeroPlanilha, normalizarHoraPlanilha, ufDoEstado } from '../format'

/** linha real da planilha de visitas do cliente, com os nomes de coluna dela */
const CAB_VISITA = [
  'Visit ID','Regional PDR','Distritor PDR','Estado PDR','Cidade PDR','Nome PDR','CNPJ PDR',
  'Líder','Inspetor','Semana','Modulo','Data Visita','Entrada','Saída',
  'Houve recebimento de soja?','Testes executados em conformidade?',
  'Armazenamento correto de fitas teste?','Houve solicitação de reteste?',
  'Houve divergência no reteste?','Número de caixas de fita teste disponíveis',
  'PDR forneceu dados do dia anterior?','PDR forneceu dados do acumulado da safra?',
  'A: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg) ','A: VOLUME TESTADA NEGATIVA (Kg)',
  'A: VOLUME DECLARADA (Kg)','A: VOLUME TESTADA POSITVA (Kg)','A: VOLUME PARTICIPANTES (Kg)',
  'B: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg) ','B: VOLUME BIOTECNOLOGIA PATENTE INVALIDA',
  'B: VOLUME BIOTECNOLOGIA PATENTE VALIDA','B: VOLUME PARTICIPANTES',
  'C: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg)','C: VOLUME BIOTECNOLOGIA PATENTE VALIDA',
  'C: VOLUME TOTAL TESTADO NEGATIVO (Kg)','C: VOLUME PARTICIPANTES (Kg)',
  'E: Nº TOTAL DE CARGAS RECEBIDAS SEM PARTICIPANTE','E: Nº CARGAS TESTADA NEGATIVA',
  'E: Nº CARGAS TOTAL DECLARADA','E: Nº CARGAS TESTADA POSITIVA','E: Nº CARGAS PARTICIPANTES',
  'HORAS','Tipo Visita','Nome responsável acompanhamento','Situação','Ocorrencias',
].join(';')

const LINHA_VISITA = [
  '1670376','BCERO','PRIMAVERA','Mato Grosso','Campo Verde',
  'COOPERGRAOS COOPERATIVA DE ARMAZENAGEM','39.341.699/0001-99',
  'Cassio Kluppell','Gleicy Silva','3','8H','16/01/2026','09:00','18:00',
  'Sim','Sim','Sim','Não','N/A (não houve solicitação de Reteste pelo RTV)','27','Sim','Sim',
  '631652','0','600144','31508','0',
  '9239476','37740','9201736','0',
  '11072939','11035199','37740','0',
  '15','0','14','1','0',
  '8','On-Site','Fernando Paulo Silva sousa','COMPLETED','Não',
].join(';')

const planilhaVisita = (...linhas: string[]) => [CAB_VISITA, ...linhas].join('\r\n')

const CAB_CARGA = [
  'ID Visita','Regional PDR','Distrito PDR','Estado PDR','Cidade PDR','Nome PDR','CNPJ PDR',
  'Data','Hora','Tipo Documento','Numero Documento','Peso Líquido','Peso Líquido com Desconto',
  'Teste Resultado Monitorado','Produtor Nome','Produtor CPF/CNPJ','Placa Caminhão',
  'Carga Acompanhada','RATEIO',
].join(';')

const carga = (patch: Partial<Record<string, string>> = {}) => {
  const base: Record<string, string> = {
    id: '1670376', hora: '13:35', doc: '078964', peso: '42.420', desconto: '38.002',
    teste: 'DECLARADA', produtor: 'GEROMIN ANTONIO GUOLO', cpf: '008.418.039-00',
    placa: 'NIZ5450', acompanhada: 'Sim ', rateio: 'NAO',
  }
  const v = { ...base, ...patch }
  return [
    v.id,'BCERO','PRIMAVERA','Mato Grosso','Campo Verde',
    '01-99 COOPERGRAOS COOPERATIVA DE ARMAZENAGEM','39.341.699/0001-99',
    '16/01/2026', v.hora,'ROMANEIO', v.doc, v.peso, v.desconto,
    v.teste, v.produtor, v.cpf, v.placa, v.acompanhada, v.rateio,
  ].join(';')
}

const planilhaCarga = (...linhas: string[]) => [CAB_CARGA, ...linhas].join('\r\n')

describe('parsers de valor da planilha real', () => {
  it('lê peso pt-BR com ponto de milhar', () => {
    // o parser antigo lia "47.780" como 47,78 e importaria 47 toneladas como 47 kg
    expect(numeroPlanilha('47.780')).toBe(47780)
    expect(numeroPlanilha('9.239.476')).toBe(9239476)
    expect(numeroPlanilha('631652')).toBe(631652)
    expect(numeroPlanilha('47.780,50')).toBe(47780.5)
    expect(numeroPlanilha('')).toBe(0)
  })

  it('completa o minuto sem zero à esquerda', () => {
    expect(normalizarHoraPlanilha('13:2')).toBe('13:02')
    expect(normalizarHoraPlanilha('9:5')).toBe('09:05')
    expect(normalizarHoraPlanilha('13:35')).toBe('13:35')
    expect(normalizarHoraPlanilha('09:00')).toBe('09:00')
  })

  it('converte estado por extenso em UF', () => {
    expect(ufDoEstado('Mato Grosso')).toBe('MT')
    expect(ufDoEstado('São Paulo')).toBe('SP')
    expect(ufDoEstado('MT')).toBe('MT')
    expect(ufDoEstado('Nárnia')).toBeNull()
  })
})

describe('planilha de cargas', () => {
  it('lê a linha real inteira', () => {
    const [r] = analisarPlanilhaCargas(planilhaCarga(carga()))

    expect(r.erros).toEqual([])
    expect(r.codVisita).toBe(1670376)
    expect(r.carga).toMatchObject({
      data: '16/01/2026',
      hora: '13:35',
      romaneio: '078964',
      pesoLiquido: 42420,
      pesoComDesconto: 38002,
      classificacao: 'Declarada',
      placa: 'NIZ5450',
      cpfCnpjProdutor: '008.418.039-00',
      rateio: false,
      acompanhada: true,
    })
  })

  it('aceita a hora incompleta 13:2 como 13:02', () => {
    const [r] = analisarPlanilhaCargas(planilhaCarga(carga({ hora: '13:2' })))
    expect(r.carga?.hora).toBe('13:02')
  })

  it('ignora o espaço à direita em "Sim "', () => {
    const [r] = analisarPlanilhaCargas(planilhaCarga(carga({ acompanhada: 'Sim ' })))
    expect(r.carga?.acompanhada).toBe(true)
  })

  it('recusa classificação desconhecida em vez de chutar', () => {
    const [r] = analisarPlanilhaCargas(planilhaCarga(carga({ teste: 'ROXA' })))
    expect(r.carga).toBeNull()
    expect(r.erros.join()).toContain('Classificação desconhecida')
  })

  it('recusa peso acima do teto', () => {
    const [r] = analisarPlanilhaCargas(planilhaCarga(carga({ peso: '130.000' })))
    expect(r.carga).toBeNull()
    expect(r.erros.join()).toContain('acima do máximo')
  })

  it('gera id de 6 dígitos, abaixo da faixa da base', () => {
    const rs = analisarPlanilhaCargas(planilhaCarga(carga(), carga({ doc: '078959' })))
    for (const r of rs) expect(r.carga?.id).toMatch(/^\d{6}$/)
    // a base usa ids de 8 dígitos (30414000+); 6 dígitos nunca alcançam
    expect(Number(rs[0].carga!.id)).toBeLessThan(1_000_000)
  })

  it('não repete id, nem em lote grande', () => {
    const muitas = Array.from({ length: 3000 }, (_, i) => carga({ doc: String(i) }))
    const ids = analisarPlanilhaCargas(planilhaCarga(...muitas))
      .map((r) => r.carga?.id)
      .filter(Boolean)

    expect(ids).toHaveLength(3000)
    expect(new Set(ids).size).toBe(3000)
  })

  it('dois lotes seguidos não geram o mesmo id', () => {
    const a = analisarPlanilhaCargas(planilhaCarga(carga()))[0].carga!.id
    const b = analisarPlanilhaCargas(planilhaCarga(carga()))[0].carga!.id
    expect(a).not.toBe(b)
  })

  it('célula vazia de peso vira não informado, sem recusar a linha', () => {
    const [r] = analisarPlanilhaCargas(planilhaCarga(carga({ peso: '', desconto: '' })))
    expect(r.erros).toEqual([])
    expect(r.carga).toMatchObject({
      pesoLiquido: 0,
      pesoComDesconto: 0,
      naoInformado: { pesoLiquido: true, pesoComDesconto: true },
    })
  })

  it('peso líquido vazio e desconto preenchido não recusa a linha', () => {
    const [r] = analisarPlanilhaCargas(planilhaCarga(carga({ peso: '' })))
    expect(r.erros).toEqual([])
    expect(r.carga?.naoInformado).toEqual({ pesoLiquido: true })
    expect(r.carga?.pesoComDesconto).toBe(38002)
  })
})

describe('planilha de visitas', () => {
  const uma = (linha = LINHA_VISITA) => analisarPlanilhaVisitas(planilhaVisita(linha))[0]

  it('lê a linha real inteira', () => {
    const r = uma()
    expect(r.erros).toEqual([])
    expect(r.visita).toMatchObject({
      cod: 1670376,
      data: '16/01/2026',
      horaInicio: '09:00',
      horaFim: '18:00',
      modalidade: '8H',
      tipoVisita: 'PRESENCIAL',
      consultor: 'Gleicy Silva',
      lider: 'Cassio Kluppell',
    })
    expect(r.visita?.pdr).toMatchObject({
      cnpj: '39.341.699/0001-99',
      uf: 'MT',
      regiao: 'BCERO',
      distrito: 'PRIMAVERA',
      responsavel: 'Fernando Paulo Silva sousa',
    })
  })

  it('monta o acumulado a partir do bloco B, com Declarada zerada', () => {
    expect(uma().visita?.acumulado.valores).toEqual({
      Negativa: 37740, // B: PATENTE INVALIDA
      Positiva: 9201736, // B: PATENTE VALIDA
      Participante: 0, // B: PARTICIPANTES
      Declarada: 0, // não existe nesse recorte
    })
  })

  it('anexa o dia anterior a partir do bloco A, por tecnologia', () => {
    expect(uma().visita?.diaAnterior).toEqual([
      {
        id: 'DA-1670376-15012026',
        data: '15/01/2026',
        informouDiaAnterior: 'Sim',
        valores: {
          Negativa: 0,
          Declarada: 600144,
          Positiva: 31508,
          Participante: 0,
        },
      },
    ])
  })

  it('entra o dia anterior zerado quando o PDR informou 0-0-0-0', () => {
    const zerado = LINHA_VISITA.replace(';631652;0;600144;31508;0;', ';0;0;0;0;0;')
    const r = uma(zerado)
    expect(r.visita?.diaAnterior).toEqual([
      {
        id: 'DA-1670376-15012026',
        data: '15/01/2026',
        informouDiaAnterior: 'Sim',
        valores: { Negativa: 0, Declarada: 0, Positiva: 0, Participante: 0 },
      },
    ])
  })

  it('não anexa dia anterior quando o PDR não informou e o bloco A está vazio', () => {
    const sem = LINHA_VISITA.replace(';27;Sim;Sim;', ';27;Não;Sim;').replace(
      ';631652;0;600144;31508;0;',
      ';0;0;0;0;0;',
    )
    expect(uma(sem).visita?.diaAnterior).toEqual([])
  })

  it('mapeia as perguntas de Sim/Não do formulário', () => {
    const d = uma().visita?.dadosVisita
    expect(d).toMatchObject({
      recebimentoCargas: 'Sim',
      realizouTestes: 'Sim',
      fitasAssociaveisCargas: 'Sim',
      houveReteste: 'Não',
      houveOcorrencia: 'Não',
      caixaFitaTeste: 27,
    })
  })

  it('força 2.2 em Não quando só há carga não acompanhada, mesmo a planilha dizendo Sim', () => {
    const cargas = agruparCargas(
      analisarPlanilhaCargas(planilhaCarga(carga({ acompanhada: 'Não' }))),
    )
    const [r] = analisarPlanilhaVisitas(planilhaVisita(LINHA_VISITA), cargas)
    expect(r.visita?.dadosVisita.recebimentoCargas).toBe('Não')
  })

  it('ignora a coluna Situação — quem decide a fila é a análise', () => {
    // a planilha diz COMPLETED; a visita entra para ser analisada
    expect(uma().visita?.situacao).toBe('central-correcao')
  })

  it('recusa estado desconhecido', () => {
    const r = uma(LINHA_VISITA.replace(';Mato Grosso;', ';Nárnia;'))
    expect(r.visita).toBeNull()
    expect(r.erros.join()).toContain('Estado não reconhecido')
  })

  it('recusa módulo fora da lista', () => {
    const r = uma(LINHA_VISITA.replace(';8H;', ';12H;'))
    expect(r.visita).toBeNull()
    expect(r.erros.join()).toContain('Módulo desconhecido')
  })

  it('recusa Visit ID repetido', () => {
    const rs = analisarPlanilhaVisitas(planilhaVisita(LINHA_VISITA, LINHA_VISITA))
    expect(rs[0].visita).not.toBeNull()
    expect(rs[1].visita).toBeNull()
    expect(rs[1].erros.join()).toContain('repetido')
  })
})

describe('vínculo entre as duas planilhas', () => {
  it('anexa à visita as cargas com o mesmo código', () => {
    const cargas = analisarPlanilhaCargas(
      planilhaCarga(carga(), carga({ doc: '078959', hora: '13:2' })),
    )
    const [r] = analisarPlanilhaVisitas(planilhaVisita(LINHA_VISITA), agruparCargas(cargas))

    expect(r.cargas).toBe(2)
    expect(r.visita?.cargas).toHaveLength(2)
    expect(r.visita?.cargas.map((c) => c.hora)).toEqual(['13:35', '13:02'])
  })

  it('carga de visita inexistente não entra em ninguém', () => {
    const cargas = analisarPlanilhaCargas(planilhaCarga(carga({ id: '9999999' })))
    const [r] = analisarPlanilhaVisitas(planilhaVisita(LINHA_VISITA), agruparCargas(cargas))

    expect(r.cargas).toBe(0)
    expect(r.visita?.cargas).toEqual([])
  })
})
