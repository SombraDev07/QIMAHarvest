import { describe, expect, it } from 'vitest'
import { fluxoDeVisitas, kpiDeVisitas, resumoDeVisita } from './backend/consultas'
import { montarCsvDeObjetos } from './relatorios/planilhas'
import { VISITAS_INICIAIS } from './data/mock'
import { pesoVolumeLiquido } from './types'

describe('kpiDeVisitas', () => {
  it('conta visitas, certificadas e correção', () => {
    const k = kpiDeVisitas(VISITAS_INICIAIS)
    expect(k.total).toBe(VISITAS_INICIAIS.length)
    expect(k.certificadas + k.emCorrecao).toBeLessThanOrEqual(k.total)
    expect(k.certificadas).toBe(VISITAS_INICIAIS.filter((v) => v.situacao === 'certificada').length)
  })

  it('volume líquido só das acompanhadas, com a regra de desconto', () => {
    const k = kpiDeVisitas(VISITAS_INICIAIS)
    const esperado = VISITAS_INICIAIS.flatMap((v) => v.cargas.filter((c) => c.acompanhada)).reduce(
      (s, c) => s + pesoVolumeLiquido(c),
      0,
    )
    expect(k.volumeKg).toBe(esperado)
  })
})

describe('fluxoDeVisitas', () => {
  it('separa 1ª e 2ª passagem', () => {
    const q = fluxoDeVisitas(VISITAS_INICIAIS)
    const soma = q.c1 + q.o1 + q.c2 + q.o2 + q.canc + q.cert
    expect(soma).toBe(VISITAS_INICIAIS.length)
  })
})

describe('resumoDeVisita', () => {
  it('expõe PDR e quantidade de cargas sem o array inteiro', () => {
    const v = VISITAS_INICIAIS[0]
    const r = resumoDeVisita(v, 'ninguém')
    expect(r.cod).toBe(v.cod)
    expect(r.pdr.nome).toBe(v.pdr.nome)
    expect(r.qtdCargas).toBe(v.cargas.length)
  })
})

describe('montarCsvDeObjetos', () => {
  it('usa os cabeçalhos como chaves', () => {
    const csv = montarCsvDeObjetos(
      ['Visit ID', 'Nome PDR'],
      [{ 'Visit ID': 10, 'Nome PDR': 'PDR TESTE' }],
    )
    expect(csv.split('\r\n')[0]).toBe('Visit ID;Nome PDR')
    expect(csv.split('\r\n')[1]).toBe('10;PDR TESTE')
  })

  it('junta fatias sem repetir o cabeçalho', () => {
    const a = montarCsvDeObjetos(['Visit ID'], [{ 'Visit ID': 1 }], true)
    const b = montarCsvDeObjetos(['Visit ID'], [{ 'Visit ID': 2 }], false)
    expect([a, b].filter(Boolean).join('\r\n')).toBe('Visit ID\r\n1\r\n2')
  })
})
