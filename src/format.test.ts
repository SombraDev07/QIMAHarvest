import { describe, expect, it } from 'vitest'
import {
  dataComparavel,
  dataIsoComparavel,
  horaValida,
  mascaraCpfCnpj,
  mascaraHora,
  mascaraPlaca,
  mascaraProdutor,
  mascaraRomaneio,
  normalizarHora,
  numeroDigitado,
  vespera,
} from './format'

/**
 * As máscaras rodam no onChange, então precisam se comportar tanto com o valor
 * completo quanto com o parcial de quem ainda está digitando.
 */
describe('mascaraHora — valor sendo digitado', () => {
  it('monta hh:mm conforme os dígitos entram', () => {
    expect(mascaraHora('1')).toBe('1')
    expect(mascaraHora('13')).toBe('13')
    expect(mascaraHora('133')).toBe('13:3')
    expect(mascaraHora('1313')).toBe('13:13')
  })

  it('descarta letras e pontuação', () => {
    expect(mascaraHora('abcd')).toBe('')
    expect(mascaraHora('1a3b3c3')).toBe('13:33')
  })

  it('trava hora em 23 e minuto em 59', () => {
    expect(mascaraHora('9999')).toBe('23:59')
  })

  it('ignora dígitos além do quarto', () => {
    expect(mascaraHora('13333333')).toBe('13:33')
  })

  it('é reversível ao apagar', () => {
    expect(mascaraHora('13:3')).toBe('13:3')
    expect(mascaraHora('13:')).toBe('13')
  })
})

describe('normalizarHora — valor completo, vindo de planilha', () => {
  it('completa a hora de um dígito', () => {
    expect(normalizarHora('8:30')).toBe('08:30')
    expect(normalizarHora('0830')).toBe('08:30')
    expect(normalizarHora('8h30')).toBe('08:30')
  })

  it('mantém a hora já formatada', () => {
    expect(normalizarHora('23:59')).toBe('23:59')
    expect(normalizarHora('00:00')).toBe('00:00')
  })

  it('recusa em vez de corrigir no escuro', () => {
    // o perigo aqui é aceitar silenciosamente: uma planilha entraria com hora inventada
    expect(normalizarHora('99:99')).toBeNull()
    expect(normalizarHora('24:00')).toBeNull()
    expect(normalizarHora('12:60')).toBeNull()
    expect(normalizarHora('abc')).toBeNull()
    expect(normalizarHora('')).toBeNull()
  })

  it('recusa minuto ambíguo de um dígito', () => {
    // "9:5" tanto pode ser 09:05 quanto 09:50
    expect(normalizarHora('9:5')).toBeNull()
  })
})

describe('horaValida', () => {
  it('aceita só hh:mm dentro do relógio', () => {
    expect(horaValida('00:00')).toBe(true)
    expect(horaValida('23:59')).toBe(true)
    expect(horaValida('24:00')).toBe(false)
    expect(horaValida('8:30')).toBe(false)
    expect(horaValida('')).toBe(false)
  })
})

describe('mascaraPlaca', () => {
  it('sobe para caixa alta e tira separador', () => {
    expect(mascaraPlaca('abc1d23')).toBe('ABC1D23')
    expect(mascaraPlaca('ab-c 1d2')).toBe('ABC1D2')
  })

  it('corta em 7 caracteres', () => {
    expect(mascaraPlaca('abc1d234567')).toBe('ABC1D23')
  })
})

describe('mascaraProdutor', () => {
  it('sobe para caixa alta e remove acento', () => {
    expect(mascaraProdutor('Agropecuária Céu Azul')).toBe('AGROPECUARIA CEU AZUL')
    expect(mascaraProdutor("José D'Ávila Ção")).toBe('JOSE DAVILA CAO')
  })

  it('remove ponto e colapsa espaço duplo', () => {
    expect(mascaraProdutor('Sítio  São  João Ltda.')).toBe('SITIO SAO JOAO LTDA')
  })

  it('preserva & / - de razão social', () => {
    expect(mascaraProdutor('Coop. Agrária S/A & Cia')).toBe('COOP AGRARIA S/A & CIA')
  })
})

describe('mascaraRomaneio', () => {
  it('tira traço, pontuação e caractere especial', () => {
    expect(mascaraRomaneio('152-422')).toBe('152422')
    expect(mascaraRomaneio('rom#123*')).toBe('ROM123')
    expect(mascaraRomaneio('ROM_2026-01')).toBe('ROM202601')
  })

  it('colapsa espaço duplo mas mantém o simples', () => {
    expect(mascaraRomaneio('AB  12/34.5')).toBe('AB 12345')
    expect(mascaraRomaneio('15 24 22')).toBe('15 24 22')
  })
})

describe('mascaraCpfCnpj', () => {
  it('formata como CPF até 11 dígitos', () => {
    expect(mascaraCpfCnpj('12345678901')).toBe('123.456.789-01')
    expect(mascaraCpfCnpj('123456')).toBe('123.456')
  })

  it('formata como CNPJ acima de 11 dígitos', () => {
    expect(mascaraCpfCnpj('12345678000190')).toBe('12.345.678/0001-90')
  })

  it('reaplica sobre valor já formatado sem duplicar separador', () => {
    expect(mascaraCpfCnpj('123.456.789-01')).toBe('123.456.789-01')
  })

  it('ignora dígitos além de 14', () => {
    expect(mascaraCpfCnpj('123456780001909999')).toBe('12.345.678/0001-90')
  })
})

describe('vespera', () => {
  it('volta um dia', () => {
    expect(vespera('15/03/2026')).toBe('14/03/2026')
  })

  it('atravessa a virada de mês', () => {
    expect(vespera('01/03/2026')).toBe('28/02/2026')
  })

  it('atravessa a virada de ano', () => {
    expect(vespera('01/01/2026')).toBe('31/12/2025')
  })

  it('acerta o ano bissexto', () => {
    expect(vespera('01/03/2024')).toBe('29/02/2024')
  })
})

describe('data comparável — filtro por janela de dias', () => {
  it('converte os dois formatos para o mesmo número', () => {
    expect(dataComparavel('25/06/2026')).toBe(20260625)
    expect(dataIsoComparavel('2026-06-25')).toBe(20260625)
  })

  /**
   * O bug que isto tranca: comparando com Date, o input vem como meia-noite UTC
   * e a data da visita como meia-noite local. No Brasil são 3 horas de
   * diferença, e o limite superior passava a excluir o próprio dia escolhido.
   */
  it('um intervalo de um único dia inclui aquele dia', () => {
    const dia = dataComparavel('25/06/2026')
    const de = dataIsoComparavel('2026-06-25')
    const ate = dataIsoComparavel('2026-06-25')

    expect(dia >= de).toBe(true)
    expect(dia <= ate).toBe(true)
  })

  it('ordena corretamente na virada de mês e de ano', () => {
    expect(dataComparavel('31/12/2025')).toBeLessThan(dataComparavel('01/01/2026'))
    expect(dataComparavel('28/02/2026')).toBeLessThan(dataComparavel('01/03/2026'))
  })

  it('exclui o que está fora da janela', () => {
    const de = dataIsoComparavel('2026-06-10')
    const ate = dataIsoComparavel('2026-06-20')

    expect(dataComparavel('09/06/2026') >= de).toBe(false)
    expect(dataComparavel('21/06/2026') <= ate).toBe(false)
    expect(dataComparavel('10/06/2026') >= de).toBe(true)
    expect(dataComparavel('20/06/2026') <= ate).toBe(true)
  })

  it('devolve 0 para data vazia ou inválida, sem quebrar', () => {
    // NaN aqui vazaria para a comparação e o filtro passaria a excluir tudo
    for (const v of ['', 'abc', '25/06', '2026-06-25']) expect(dataComparavel(v), v).toBe(0)
    for (const v of ['', 'abc', '2026-06']) expect(dataIsoComparavel(v), v).toBe(0)
  })
})

describe('numeroDigitado', () => {
  it('extrai só os dígitos', () => {
    expect(numeroDigitado('42.500')).toBe(42500)
    expect(numeroDigitado('abc123')).toBe(123)
    expect(numeroDigitado('')).toBe(0)
  })
})

/**
 * O store aplica as máscaras à base inteira a cada carregamento, e a
 * importação as aplica sobre dado que pode já estar limpo — se não fossem
 * idempotentes, o valor mudaria a cada passagem.
 */
describe('idempotência', () => {
  const casos: [string, (v: string) => string][] = [
    ['Agropecuária  Céu Azul Ltda.', mascaraProdutor],
    ['152-422', mascaraRomaneio],
    ['abc-1d23', mascaraPlaca],
    ['12345678000190', mascaraCpfCnpj],
  ]

  it.each(casos)('aplicar duas vezes em "%s" dá o mesmo resultado', (entrada, fn) => {
    const umaVez = fn(entrada)
    expect(fn(umaVez)).toBe(umaVez)
  })
})
