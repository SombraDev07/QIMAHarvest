import { describe, expect, it } from 'vitest'
import {
  analisarCorrecaoAcumulado,
  analisarCorrecaoCargas,
  analisarCorrecaoDiaAnterior,
  aplicarPatchCarga,
  aplicarPatches,
  conferirAcumulado,
  conferirCargas,
  conferirDiaAnterior,
} from './correcao'
import type { Carga, Visita } from '../types'

const carga = (patch: Partial<Carga> = {}): Carga => ({
  id: '30414001',
  data: '15/03/2026',
  hora: '08:30',
  placa: 'ABC1D23',
  produtor: 'FAZENDA ANTIGA',
  cpfCnpjProdutor: '123.456.789-00',
  romaneio: '111',
  pesoLiquido: 40000,
  pesoComDesconto: 39000,
  classificacao: 'Declarada',
  rateio: false,
  acompanhada: true,
  ...patch,
})

const visita = (patch: Partial<Visita> = {}): Visita =>
  ({
    cod: 1670376,
    data: '16/01/2026',
    cargas: [carga()],
    diaAnterior: [],
    acumulado: {
      informadoPeloPdr: 'Não',
      origem: 'PDR',
      valores: { Negativa: 1, Declarada: 2, Positiva: 3, Participante: 4 },
    },
    ...patch,
  }) as Visita

const planilha = (cab: string, ...linhas: string[]) => [cab, ...linhas].join('\r\n')

const CAB_CARGA =
  'ID;Produtor;Romaneio;Peso Líquido;Peso com Desconto;Tecnologia;Data;Hora'
const CAB_VOL = 'Visit ID;Dia;Negativa;Declarada;Positiva;Participante'

describe('planilha de correção de cargas', () => {
  it('lê só os campos preenchidos', () => {
    const [r] = analisarCorrecaoCargas(
      planilha(CAB_CARGA, '30414001;FAZENDA NOVA;;42500;;;15/03/2026;9:5'),
    )
    expect(r.erros).toEqual([])
    expect(r.patch).toMatchObject({
      id: '30414001',
      produtor: 'FAZENDA NOVA',
      pesoLiquido: 42500,
      data: '15/03/2026',
      hora: '09:05',
    })
    expect(r.patch?.romaneio).toBeUndefined()
    expect(r.patch?.classificacao).toBeUndefined()
  })

  it('aceita Não informado em produtor, romaneio e pesos', () => {
    const [r] = analisarCorrecaoCargas(
      planilha(CAB_CARGA, '30414001;Não informado;NI;Não informado;NI;;;'),
    )
    expect(r.erros).toEqual([])
    expect(r.patch).toMatchObject({
      produtorNI: true,
      romaneioNI: true,
      pesoLiquidoNI: true,
      pesoComDescontoNI: true,
    })
  })

  it('recusa linha só com o ID', () => {
    const [r] = analisarCorrecaoCargas(planilha(CAB_CARGA, '30414001;;;;;;;'))
    expect(r.patch).toBeNull()
    expect(r.erros.join()).toContain('Nenhum campo')
  })

  it('recusa ID repetido', () => {
    const rs = analisarCorrecaoCargas(
      planilha(CAB_CARGA, '30414001;A;;;;;;', '30414001;B;;;;;;'),
    )
    expect(rs[1].erros.join()).toContain('repetido')
  })
})

describe('planilha de dia anterior / acumulado', () => {
  it('lê o bloco A por tecnologia, inclusive zero', () => {
    const [r] = analisarCorrecaoDiaAnterior(planilha(CAB_VOL, '1670376;15/01/2026;0;600144;31508;0'))
    expect(r.erros).toEqual([])
    expect(r.patch).toEqual({
      cod: 1670376,
      dia: '15/01/2026',
      valores: { Negativa: 0, Declarada: 600144, Positiva: 31508, Participante: 0 },
    })
  })

  it('aceita só algumas tecnologias', () => {
    const [r] = analisarCorrecaoAcumulado(planilha(CAB_VOL, '1670376;16/01/2026;;0;;'))
    expect(r.patch?.valores).toEqual({ Declarada: 0 })
  })

  it('recusa linha sem tecnologia', () => {
    const [r] = analisarCorrecaoDiaAnterior(planilha(CAB_VOL, '1670376;15/01/2026;;;;'))
    expect(r.patch).toBeNull()
  })
})

describe('conferência', () => {
  it('acusa carga inexistente', () => {
    const [r] = conferirCargas(
      analisarCorrecaoCargas(planilha(CAB_CARGA, '999;X;;;;;;')),
      [visita()],
    )
    expect(r.erros.join()).toContain('não encontrada')
  })

  it('casa a carga com a visita', () => {
    const [r] = conferirCargas(
      analisarCorrecaoCargas(planilha(CAB_CARGA, '30414001;X;;;;;;')),
      [visita()],
    )
    expect(r.visitaCod).toBe(1670376)
  })

  it('acusa acumulado cujo dia não é o da visita', () => {
    const [r] = conferirAcumulado(
      analisarCorrecaoAcumulado(planilha(CAB_VOL, '1670376;01/01/2026;1;1;1;1')),
      [visita()],
    )
    expect(r.erros.join()).toContain('não é o da visita')
  })

  it('aceita dia anterior de qualquer data da unidade', () => {
    const [r] = conferirDiaAnterior(
      analisarCorrecaoDiaAnterior(planilha(CAB_VOL, '1670376;15/01/2026;0;0;0;0')),
      [visita()],
    )
    expect(r.erros).toEqual([])
  })
})

describe('aplicar patches', () => {
  it('mexe só no campo enviado e preserva o resto', () => {
    const c = aplicarPatchCarga(carga(), { id: '30414001', produtor: 'NOVA' })
    expect(c.produtor).toBe('NOVA')
    expect(c.romaneio).toBe('111')
    expect(c.pesoLiquido).toBe(40000)
  })

  it('marca peso como não informado', () => {
    const c = aplicarPatchCarga(carga(), { id: '30414001', pesoLiquidoNI: true })
    expect(c.pesoLiquido).toBe(0)
    expect(c.naoInformado?.pesoLiquido).toBe(true)
  })

  it('grava dia anterior 0-0-0-0 como informado', () => {
    const { visitas, resumo } = aplicarPatches([visita()], {
      diasAnteriores: [
        {
          cod: 1670376,
          dia: '15/01/2026',
          valores: { Negativa: 0, Declarada: 0, Positiva: 0, Participante: 0 },
        },
      ],
    })
    expect(resumo.diasAnteriores).toBe(1)
    expect(visitas[0].diaAnterior[0]).toMatchObject({
      data: '15/01/2026',
      informouDiaAnterior: 'Sim',
      valores: { Negativa: 0, Declarada: 0, Positiva: 0, Participante: 0 },
    })
  })

  it('atualiza o acumulado da visita e marca como informado', () => {
    const { visitas } = aplicarPatches([visita()], {
      acumulados: [{ cod: 1670376, dia: '16/01/2026', valores: { Positiva: 9 } }],
    })
    expect(visitas[0].acumulado.informadoPeloPdr).toBe('Sim')
    expect(visitas[0].acumulado.valores).toMatchObject({ Positiva: 9, Negativa: 1 })
  })
})
