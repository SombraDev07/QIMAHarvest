import { afterEach, describe, expect, it } from 'vitest'
import type { Carga, Visita } from '../types'
import {
  conferirCargaComFoto,
  filaAnaliseFotos,
  gerarFotoMock,
  lerEvidencia,
  lerEvidenciaAsync,
  lerFilaEmMassa,
  notasFiscaisSimuladas,
  resumirLeituraMassa,
} from './evidencia'
import { limparCacheVisao, type ConfigVisao } from './visao'

const extra = {
  data: '01/06/2026',
  hora: '10:00',
  produtor: 'FAZENDA',
  pesoLiquido: 30000,
  pesoComDesconto: 29000,
}

const base: Carga = {
  id: '42',
  data: extra.data,
  hora: extra.hora,
  placa: 'ABC1D23',
  produtor: extra.produtor,
  cpfCnpjProdutor: '123.456.789-00',
  romaneio: '150001',
  pesoLiquido: extra.pesoLiquido,
  pesoComDesconto: extra.pesoComDesconto,
  classificacao: 'Participante',
  rateio: false,
  acompanhada: true,
}

const fotoOk = () => gerarFotoMock(base.id, base.placa, base.romaneio, extra)

describe('gerarFotoMock / lerEvidencia', () => {
  it('grava placa, ID, NFs e os campos de conferência no SVG', () => {
    const lida = lerEvidencia(fotoOk())
    expect(lida.fonte).toBe('svg-mock')
    expect(lida.cargaId).toBe('42')
    expect(lida.placa).toBe('ABC1D23')
    expect(lida.data).toBe('01/06/2026')
    expect(lida.hora).toBe('10:00')
    expect(lida.produtor).toBe('FAZENDA')
    expect(lida.pesoLiquido).toBe(30000)
    expect(lida.pesoComDesconto).toBe(29000)
    expect(lida.notasFiscais).toEqual(notasFiscaisSimuladas('42', '150001'))
    expect(lida.notasFiscais).toContain('150001')
  })

  it('ainda lê o SVG antigo, sem data-attrs', () => {
    const svg = `<svg><text font-size="42">XYZ9K88</text><text>Carga 7 · romaneio 149000</text></svg>`
    const lida = lerEvidencia(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
    expect(lida).toMatchObject({
      fonte: 'svg-mock',
      cargaId: '7',
      placa: 'XYZ9K88',
      notasFiscais: ['149000'],
    })
  })

  it('jpeg/png pedem API de visão', () => {
    expect(lerEvidencia('https://cdn.exemplo/carga.jpg').fonte).toBe('requer-visao')
  })
})

describe('conferirCargaComFoto', () => {
  it('bate data/hora, placa, produtor, romaneio e pesos', () => {
    const carga = { ...base, fotoUrl: fotoOk() }
    const r = conferirCargaComFoto(carga)
    expect(r.status).toBe('ok')
    expect(r.checagens.map((c) => c.campo)).toEqual([
      'dataHora',
      'placa',
      'produtor',
      'romaneio',
      'pesoLiquido',
      'pesoComDesconto',
    ])
    expect(r.checagens.every((c) => c.ok === true)).toBe(true)
  })

  it('diverge se o analista mudou a placa depois da foto', () => {
    const carga = {
      ...base,
      placa: 'QWE1A11',
      fotoUrl: fotoOk(),
    }
    const r = conferirCargaComFoto(carga)
    expect(r.status).toBe('divergente')
    expect(r.checagens.find((c) => c.campo === 'placa')?.ok).toBe(false)
  })

  it('diverge se o romaneio lançado não está entre as NFs da foto', () => {
    const carga = {
      ...base,
      romaneio: '999999',
      fotoUrl: gerarFotoMock(base.id, base.placa, '150001', extra),
    }
    const r = conferirCargaComFoto(carga)
    expect(r.status).toBe('divergente')
    expect(r.checagens.find((c) => c.campo === 'romaneio')?.ok).toBe(false)
  })

  it('aceita romaneio que só aparece como uma das NFs, com outro número no ticket', () => {
    const carga = { ...base, romaneio: '150001', fotoUrl: fotoOk() }
    const rom = conferirCargaComFoto(carga).checagens.find((c) => c.campo === 'romaneio')
    expect(rom?.ok).toBe(true)
    expect(rom?.naFoto).toContain('150001')
  })

  it('carga sem foto fica fora da conferência automática', () => {
    expect(conferirCargaComFoto(base).status).toBe('sem-foto')
  })
})

describe('filaAnaliseFotos', () => {
  it('só inclui visitas certificadas e põe divergente na frente', () => {
    const ok = { ...base, id: '1', fotoUrl: gerarFotoMock('1', 'ABC1D23', '150001', extra) }
    const div = {
      ...base,
      id: '2',
      placa: 'ZZZ1Z11',
      fotoUrl: gerarFotoMock('2', 'ABC1D23', '150001', extra),
    }
    const fila = filaAnaliseFotos([
      {
        cod: 1,
        situacao: 'central-correcao',
        pdr: { nome: 'A' },
        cargas: [ok],
      },
      {
        cod: 9,
        situacao: 'certificada',
        data: '01/06/2026',
        pdr: { nome: 'B' },
        cargas: [ok, div],
      },
    ] as unknown as Visita[])
    expect(fila).toHaveLength(2)
    expect(fila[0].carga.id).toBe('2')
    expect(fila[0].conferencia.status).toBe('divergente')
    expect(fila[1].conferencia.status).toBe('ok')
  })
})

describe('leitura em massa', () => {
  it('separa lidas localmente, divergentes e o que pede API', () => {
    const ok = { ...base, id: '1', fotoUrl: gerarFotoMock('1', 'ABC1D23', '150001', extra) }
    const div = {
      ...base,
      id: '2',
      placa: 'ZZZ1Z11',
      fotoUrl: gerarFotoMock('2', 'ABC1D23', '150001', extra),
    }
    const jpeg = { ...base, id: '3', fotoUrl: 'https://cdn.exemplo/carga.jpg' }
    const sem = { ...base, id: '4' }
    const fila = filaAnaliseFotos([
      {
        cod: 9,
        situacao: 'certificada',
        data: '01/06/2026',
        pdr: { nome: 'B' },
        cargas: [ok, div, jpeg, sem],
      },
    ] as unknown as Visita[])
    expect(resumirLeituraMassa(fila)).toMatchObject({
      total: 4,
      comFoto: 3,
      lidasLocal: 2,
      lidasApi: 0,
      ok: 1,
      divergente: 1,
      pendenteApi: 1,
      semFoto: 1,
    })
  })

  it('percorre a fila e devolve o mesmo resumo', async () => {
    const ok = { ...base, id: '1', fotoUrl: gerarFotoMock('1', 'ABC1D23', '150001', extra) }
    const fila = filaAnaliseFotos([
      {
        cod: 9,
        situacao: 'certificada',
        data: '01/06/2026',
        pdr: { nome: 'B' },
        cargas: [ok],
      },
    ] as unknown as Visita[])
    const passos: number[] = []
    const r = await lerFilaEmMassa(fila, (feitos, total) => passos.push(feitos / total))
    expect(r.resumo.lidasLocal).toBe(1)
    expect(passos.at(-1)).toBe(1)
  })

  it('jpeg vai ao webhook e preenche o lado da foto', async () => {
    limparCacheVisao()
    const jpeg = { ...base, id: '3', fotoUrl: 'data:image/jpeg;base64,AAAA' }
    const fila = filaAnaliseFotos([
      {
        cod: 9,
        situacao: 'certificada',
        data: extra.data,
        pdr: { nome: 'B' },
        cargas: [jpeg],
      },
    ] as unknown as Visita[])
    const cfg: ConfigVisao = {
      provedor: 'webhook',
      chave: '',
      modelo: '',
      endpoint: 'https://exemplo.test/visao',
      prompt: 'x',
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            data: extra.data,
            hora: extra.hora,
            placa: base.placa,
            produtor: base.produtor,
            romaneio: base.romaneio,
            notasFiscais: [base.romaneio],
            pesoLiquido: extra.pesoLiquido,
            pesoComDesconto: extra.pesoComDesconto,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )) as typeof fetch,
    }
    const r = await lerFilaEmMassa(fila, () => undefined, cfg)
    expect(r.fila[0].conferencia.status).toBe('ok')
    expect(r.fila[0].conferencia.fonte).toBe('visao')
    expect(r.resumo.lidasApi).toBe(1)
    const placa = r.fila[0].conferencia.checagens.find((c) => c.campo === 'placa')
    expect(placa?.lancado).toBe('ABC1D23')
    expect(placa?.naFoto).toBe('ABC1D23')
  })
})

describe('lerEvidenciaAsync', () => {
  afterEach(() => limparCacheVisao())

  it('sem API continua pendente no jpeg', async () => {
    const lida = await lerEvidenciaAsync('https://cdn.exemplo/carga.jpg', {
      provedor: 'desligado',
      chave: '',
      modelo: '',
      endpoint: '',
      prompt: '',
    })
    expect(lida.fonte).toBe('requer-visao')
  })
})
