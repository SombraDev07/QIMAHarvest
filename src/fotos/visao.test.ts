import { describe, expect, it } from 'vitest'
import {
  configVisaoDe,
  numeroKg,
  parseRespostaVisao,
  visaoLigada,
  visaoProvedorDe,
} from './visao'
import type { ParametrosRegras } from '../types'

function params(patch: Partial<ParametrosRegras> = {}): ParametrosRegras {
  return {
    limiteDescontoErro: 25,
    minDigitosPlaca: 6,
    saltoMaxRomaneio: 500,
    limiteDiaAnteriorTecnologia: 3_000_000,
    toleranciaHorarioMin: 60,
    caixaFitaMin: 1,
    caixaFitaMax: 100,
    mensagemErroChat: '',
    regrasAtivas: {},
    visaoProvedor: 'desligado',
    visaoChave: '',
    visaoModelo: '',
    visaoEndpoint: '',
    visaoPrompt: '',
    ...patch,
  }
}

describe('parseRespostaVisao', () => {
  it('aceita JSON cru e cerca de markdown', () => {
    const a = parseRespostaVisao('```json\n{"placa":"ABC1D23","romaneio":"150001","notasFiscais":["141000"]}\n```')
    expect(a.placa).toBe('ABC1D23')
    expect(a.romaneio).toBe('150001')
    expect(a.notasFiscais).toEqual(['150001', '141000'])
  })

  it('normaliza data, hora e peso BR', () => {
    const a = parseRespostaVisao(
      JSON.stringify({
        data: '1/6/26',
        hora: '9:05',
        pesoLiquido: '30.000 kg',
        pesoComDesconto: '29.500,0',
        notasFiscais: [],
      }),
    )
    expect(a.data).toBe('01/06/2026')
    expect(a.hora).toBe('09:05')
    expect(a.pesoLiquido).toBe(30000)
    expect(a.pesoComDesconto).toBe(29500)
  })
})

describe('numeroKg', () => {
  it('lê número, string BR e toneladas pequenas', () => {
    expect(numeroKg(29000)).toBe(29000)
    expect(numeroKg('29.000')).toBe(29000)
    expect(numeroKg('30 t')).toBe(30000)
  })
})

describe('configVisaoDe', () => {
  it('desligado sem chave não liga', () => {
    expect(visaoLigada(configVisaoDe(params()))).toBe(false)
  })

  it('gemini com chave no parâmetro liga', () => {
    const c = configVisaoDe(params({ visaoProvedor: 'gemini', visaoChave: 'k' }))
    expect(visaoLigada(c)).toBe(true)
    expect(c.provedor).toBe('gemini')
    expect(c.modelo).toContain('gemini')
  })

  it('webhook liga pela URL, mesmo sem chave', () => {
    const c = configVisaoDe(
      params({ visaoProvedor: 'webhook', visaoEndpoint: 'https://x.test/v' }),
    )
    expect(visaoLigada(c)).toBe(true)
  })

  it('visaoProvedorDe ignora lixo', () => {
    expect(visaoProvedorDe('GEMINI')).toBe('gemini')
    expect(visaoProvedorDe('foo')).toBe('desligado')
  })
})
