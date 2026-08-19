import { describe, expect, it } from 'vitest'
import {
  configVisaoDe,
  extracaoVisaoVazia,
  listarModelosGemini,
  MODELO_GEMINI,
  MODELOS_GEMINI,
  numeroKg,
  parseRespostaVisao,
  textoDaRespostaGemini,
  visaoLigada,
  visaoProvedorDe,
  visaoProvedorOuPadrao,
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

  it('aceita chave em snake_case e ticket no lugar de romaneio', () => {
    const a = parseRespostaVisao(
      JSON.stringify({
        placa: 'ICK7081',
        ticket: '36404',
        peso_liquido: '4.810',
        produtor: 'AMARILDO SCHNEIDER',
      }),
    )
    expect(a.placa).toBe('ICK7081')
    expect(a.romaneio).toBe('36404')
    expect(a.pesoLiquido).toBe(4810)
    expect(a.produtor).toBe('AMARILDO SCHNEIDER')
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

  it('ausente vira Gemini padrão', () => {
    expect(visaoProvedorOuPadrao('')).toBe('gemini')
    expect(visaoProvedorOuPadrao('desligado')).toBe('desligado')
  })

  it('lista os Gemini para o select e inclui o padrão', () => {
    expect(MODELOS_GEMINI.some((m) => m.id === MODELO_GEMINI)).toBe(true)
    expect(MODELOS_GEMINI.map((m) => m.id)).toContain('gemini-flash-lite-latest')
  })
})

describe('listarModelosGemini', () => {
  it('fica só com generateContent e ignora embedding/imagem', async () => {
    const lista = await listarModelosGemini('chave-teste', async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-2.5-flash',
              displayName: 'Gemini 2.5 Flash',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-embedding-001',
              displayName: 'Embedding',
              supportedGenerationMethods: ['embedContent'],
            },
            {
              name: 'models/gemini-2.5-flash-image',
              displayName: 'Image',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/imagen-4.0-generate',
              displayName: 'Imagen',
              supportedGenerationMethods: ['predict'],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    expect(lista).toEqual([{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }])
  })
})

describe('textoDaRespostaGemini / extracaoVisaoVazia', () => {
  it('ignora parte de pensamento e lê o JSON', () => {
    const texto = textoDaRespostaGemini({
      candidates: [
        {
          content: {
            parts: [{ thought: true, text: 'vou ler' }, { text: '{"placa":"ICK7081"}' }],
          },
        },
      ],
    })
    expect(texto).toBe('{"placa":"ICK7081"}')
  })

  it('marca extração vazia', () => {
    expect(extracaoVisaoVazia({ notasFiscais: [] })).toBe(true)
    expect(extracaoVisaoVazia({ notasFiscais: [], placa: 'ICK7081' })).toBe(false)
  })
})
