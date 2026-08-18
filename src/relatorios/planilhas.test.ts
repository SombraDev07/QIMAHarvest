import { describe, expect, it } from 'vitest'
import { relatorioCargas, relatorioVisitas, resumoRelatorio, COLUNAS_VISITA } from './planilhas'
import {
  agruparCargas,
  analisarPlanilhaCargas,
  analisarPlanilhaVisitas,
} from '../importacao/planilhaVisitas'
import { VISITAS_INICIAIS } from '../data/mock'
import type { Visita } from '../types'

const cabecalho = (csv: string) => csv.split('\r\n')[0].split(';')
const linhas = (csv: string) => csv.split('\r\n').slice(1)

/** visita da base com cargas, para o relatório ter conteúdo de verdade */
const COM_CARGAS = VISITAS_INICIAIS.filter((v) => v.cargas.length >= 2).slice(0, 5)

describe('relatório de visitas', () => {
  it('tem uma linha por visita, mais o cabeçalho', () => {
    const csv = relatorioVisitas(COM_CARGAS)
    expect(linhas(csv)).toHaveLength(COM_CARGAS.length)
    expect(cabecalho(csv)[0]).toBe('Visit ID')
  })

  it('soma o bloco A das cargas da própria visita', () => {
    const v = COM_CARGAS[0]
    const csv = relatorioVisitas([v])
    const col = cabecalho(csv)
    const valores = linhas(csv)[0].split(';')

    const negativa = v.cargas
      .filter((c) => c.classificacao === 'Negativa')
      .reduce((s, c) => s + c.pesoLiquido, 0)

    expect(valores[col.indexOf('A: VOLUME TESTADA NEGATIVA (Kg)')]).toBe(String(negativa))
  })

  it('conta o bloco E das cargas da própria visita', () => {
    const v = COM_CARGAS[0]
    const col = cabecalho(relatorioVisitas([v]))
    const valores = linhas(relatorioVisitas([v]))[0].split(';')
    const declaradas = v.cargas.filter((c) => c.classificacao === 'Declarada').length

    expect(valores[col.indexOf('E: Nº CARGAS TOTAL DECLARADA')]).toBe(String(declaradas))
  })

  it('leva o acumulado da safra para o bloco B', () => {
    const v = COM_CARGAS[0]
    const col = cabecalho(relatorioVisitas([v]))
    const valores = linhas(relatorioVisitas([v]))[0].split(';')

    expect(valores[col.indexOf('B: VOLUME BIOTECNOLOGIA PATENTE INVALIDA')]).toBe(
      String(v.acumulado.valores.Negativa),
    )
    expect(valores[col.indexOf('B: VOLUME BIOTECNOLOGIA PATENTE VALIDA')]).toBe(
      String(v.acumulado.valores.Positiva),
    )
  })

  it('deixa em branco o que o modelo não guarda, em vez de inventar', () => {
    const col = cabecalho(relatorioVisitas(COM_CARGAS))
    const valores = linhas(relatorioVisitas(COM_CARGAS))[0].split(';')

    for (const c of [
      'Houve divergência no reteste?',
      'C: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg)',
      'C: VOLUME BIOTECNOLOGIA PATENTE VALIDA',
      'C: VOLUME TOTAL TESTADO NEGATIVO (Kg)',
    ]) {
      expect(valores[col.indexOf(c)], c).toBe('')
    }
  })

  it('protege o separador dentro do campo', () => {
    const v: Visita = {
      ...COM_CARGAS[0],
      pdr: { ...COM_CARGAS[0].pdr, nome: 'COOP; ARMAZEM "CENTRAL"' },
    }
    const linha = linhas(relatorioVisitas([v]))[0]
    // o nome vai entre aspas, com as aspas internas dobradas
    expect(linha).toContain('"COOP; ARMAZEM ""CENTRAL"""')
    // e a linha continua com o número certo de colunas
    expect(cabecalho(relatorioVisitas([v]))).toHaveLength(COLUNAS_VISITA.length)
  })
})

describe('relatório de cargas', () => {
  it('tem uma linha por carga de todas as visitas', () => {
    const total = COM_CARGAS.reduce((s, v) => s + v.cargas.length, 0)
    expect(linhas(relatorioCargas(COM_CARGAS))).toHaveLength(total)
  })

  it('repete o código da visita em cada carga dela', () => {
    const csv = relatorioCargas([COM_CARGAS[0]])
    const col = cabecalho(csv)
    for (const l of linhas(csv)) {
      expect(l.split(';')[col.indexOf('ID Visita')]).toBe(String(COM_CARGAS[0].cod))
    }
  })

  it('não perde a visita de origem quando há mais de uma', () => {
    const csv = relatorioCargas(COM_CARGAS)
    const col = cabecalho(csv)
    const cods = new Set(linhas(csv).map((l) => l.split(';')[col.indexOf('ID Visita')]))
    expect(cods.size).toBe(COM_CARGAS.length)
  })
})

/**
 * O que dá sentido ao relatório: o arquivo exportado precisa voltar pelo
 * importador sem tradução no meio. Se um cabeçalho ou formato divergir, é aqui
 * que aparece — e não num arquivo real do cliente sendo recusado.
 */
describe('ida e volta: exportar e reimportar', () => {
  const idaEVolta = (visitas: Visita[]) => {
    const cargas = analisarPlanilhaCargas(relatorioCargas(visitas))
    const importadas = analisarPlanilhaVisitas(relatorioVisitas(visitas), agruparCargas(cargas))
    return { cargas, importadas }
  }

  it('o relatório de visitas é aceito de volta, sem erro', () => {
    const { importadas } = idaEVolta(COM_CARGAS)
    const comErro = importadas.filter((v) => v.erros.length > 0)

    expect(comErro.map((v) => v.erros)).toEqual([])
    expect(importadas).toHaveLength(COM_CARGAS.length)
  })

  it('o relatório de cargas é aceito de volta, sem erro', () => {
    const { cargas } = idaEVolta(COM_CARGAS)
    const comErro = cargas.filter((c) => c.erros.length > 0)

    expect(comErro.map((c) => c.erros)).toEqual([])
  })

  it('os campos da visita sobrevivem à volta', () => {
    const original = COM_CARGAS[0]
    const { importadas } = idaEVolta([original])
    const volta = importadas[0].visita!

    expect(volta.cod).toBe(original.cod)
    expect(volta.data).toBe(original.data)
    expect(volta.horaInicio).toBe(original.horaInicio)
    expect(volta.horaFim).toBe(original.horaFim)
    expect(volta.modalidade).toBe(original.modalidade)
    expect(volta.tipoVisita).toBe(original.tipoVisita)
    expect(volta.pdr.cnpj).toBe(original.pdr.cnpj)
    expect(volta.pdr.uf).toBe(original.pdr.uf)
    expect(volta.pdr.regiao).toBe(original.pdr.regiao)
    expect(volta.lider).toBe(original.lider)
    expect(volta.consultor).toBe(original.consultor)
  })

  it('o acumulado sobrevive à volta', () => {
    const original = COM_CARGAS[0]
    const volta = idaEVolta([original]).importadas[0].visita!

    expect(volta.acumulado.valores.Negativa).toBe(original.acumulado.valores.Negativa)
    expect(volta.acumulado.valores.Positiva).toBe(original.acumulado.valores.Positiva)
    expect(volta.acumulado.valores.Participante).toBe(original.acumulado.valores.Participante)
    // a Declarada não existe no recorte da planilha e volta zerada, por definição
    expect(volta.acumulado.valores.Declarada).toBe(0)
  })

  it('as respostas do formulário sobrevivem à volta', () => {
    const original = COM_CARGAS[0]
    const volta = idaEVolta([original]).importadas[0].visita!

    expect(volta.dadosVisita.recebimentoCargas).toBe(original.dadosVisita.recebimentoCargas)
    expect(volta.dadosVisita.realizouTestes).toBe(original.dadosVisita.realizouTestes)
    expect(volta.dadosVisita.houveReteste).toBe(original.dadosVisita.houveReteste)
    expect(volta.dadosVisita.caixaFitaTeste).toBe(original.dadosVisita.caixaFitaTeste)
  })

  it('as cargas voltam vinculadas à visita certa, com os pesos intactos', () => {
    const { importadas } = idaEVolta(COM_CARGAS)

    for (const [i, original] of COM_CARGAS.entries()) {
      const volta = importadas[i].visita!
      expect(volta.cargas, `visita ${original.cod}`).toHaveLength(original.cargas.length)

      const pesosOriginais = original.cargas.map((c) => c.pesoLiquido).sort((a, b) => a - b)
      const pesosVolta = volta.cargas.map((c) => c.pesoLiquido).sort((a, b) => a - b)
      expect(pesosVolta).toEqual(pesosOriginais)
    }
  })

  it('romaneio, placa e classificação sobrevivem à volta', () => {
    const original = COM_CARGAS[0]
    const volta = idaEVolta([original]).importadas[0].visita!

    const chave = (c: { romaneio: string; placa: string; classificacao: string }) =>
      `${c.romaneio}|${c.placa}|${c.classificacao}`

    expect(volta.cargas.map(chave).sort()).toEqual(original.cargas.map(chave).sort())
  })

  it('a carga ganha id novo na volta — o id é do sistema, não do arquivo', () => {
    const original = COM_CARGAS[0]
    const volta = idaEVolta([original]).importadas[0].visita!
    const antigos = new Set(original.cargas.map((c) => c.id))

    for (const c of volta.cargas) expect(antigos.has(c.id)).toBe(false)
  })
})

describe('resumo mostrado na tela', () => {
  it('conta visitas, cargas e a divisão por classificação', () => {
    const r = resumoRelatorio(COM_CARGAS)
    expect(r.visitas).toBe(COM_CARGAS.length)
    expect(r.cargas).toBe(COM_CARGAS.reduce((s, v) => s + v.cargas.length, 0))
    expect(r.porClassificacao.reduce((s, c) => s + c.cargas, 0)).toBe(r.cargas)
  })

  it('não quebra com base vazia', () => {
    expect(resumoRelatorio([])).toMatchObject({ visitas: 0, cargas: 0 })
  })
})
