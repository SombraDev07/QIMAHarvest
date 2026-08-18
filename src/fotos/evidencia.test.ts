import { describe, expect, it } from 'vitest'
import type { Carga, Visita } from '../types'
import {
  conferirCargaComFoto,
  filaAnaliseFotos,
  gerarFotoMock,
  lerEvidencia,
  lerFilaEmMassa,
  notasFiscaisSimuladas,
  resumirLeituraMassa,
} from './evidencia'

const base: Carga = {
  id: '42',
  data: '01/06/2026',
  hora: '10:00',
  placa: 'ABC1D23',
  produtor: 'FAZENDA',
  cpfCnpjProdutor: '123.456.789-00',
  romaneio: '150001',
  pesoLiquido: 30000,
  pesoComDesconto: 29000,
  classificacao: 'Participante',
  rateio: false,
  acompanhada: true,
}

describe('gerarFotoMock / lerEvidencia', () => {
  it('grava placa, ID e várias NFs no SVG, incluindo o romaneio da carga', () => {
    const url = gerarFotoMock('42', 'ABC1D23', '150001')
    const lida = lerEvidencia(url)
    expect(lida.fonte).toBe('svg-mock')
    expect(lida.cargaId).toBe('42')
    expect(lida.placa).toBe('ABC1D23')
    expect(lida.notasFiscais).toEqual(notasFiscaisSimuladas('42', '150001'))
    expect(lida.notasFiscais).toContain('150001')
    expect(lida.notasFiscais.length).toBeGreaterThan(1)
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
  it('bate quando ID, placa e romaneio estão na foto (romaneio entre várias NFs)', () => {
    const carga = { ...base, fotoUrl: gerarFotoMock(base.id, base.placa, base.romaneio) }
    const r = conferirCargaComFoto(carga)
    expect(r.status).toBe('ok')
    expect(r.checagens.every((c) => c.ok === true)).toBe(true)
  })

  it('diverge se o analista mudou a placa depois da foto', () => {
    const carga = {
      ...base,
      placa: 'QWE1A11',
      fotoUrl: gerarFotoMock(base.id, base.placa, base.romaneio),
    }
    const r = conferirCargaComFoto(carga)
    expect(r.status).toBe('divergente')
    expect(r.checagens.find((c) => c.campo === 'placa')?.ok).toBe(false)
  })

  it('diverge se o romaneio lançado não está entre as NFs da foto', () => {
    const carga = {
      ...base,
      romaneio: '999999',
      fotoUrl: gerarFotoMock(base.id, base.placa, '150001'),
    }
    const r = conferirCargaComFoto(carga)
    expect(r.status).toBe('divergente')
    expect(r.checagens.find((c) => c.campo === 'romaneio')?.ok).toBe(false)
  })

  it('carga sem foto fica fora da conferência automática', () => {
    expect(conferirCargaComFoto(base).status).toBe('sem-foto')
  })
})

describe('filaAnaliseFotos', () => {
  it('só inclui visitas certificadas e põe divergente na frente', () => {
    const ok = { ...base, id: '1', fotoUrl: gerarFotoMock('1', 'ABC1D23', '150001') }
    const div = {
      ...base,
      id: '2',
      placa: 'ZZZ1Z11',
      fotoUrl: gerarFotoMock('2', 'ABC1D23', '150001'),
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
    const ok = { ...base, id: '1', fotoUrl: gerarFotoMock('1', 'ABC1D23', '150001') }
    const div = {
      ...base,
      id: '2',
      placa: 'ZZZ1Z11',
      fotoUrl: gerarFotoMock('2', 'ABC1D23', '150001'),
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
      ok: 1,
      divergente: 1,
      pendenteApi: 1,
      semFoto: 1,
    })
  })

  it('percorre a fila e devolve o mesmo resumo', async () => {
    const ok = { ...base, id: '1', fotoUrl: gerarFotoMock('1', 'ABC1D23', '150001') }
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
    expect(r.lidasLocal).toBe(1)
    expect(passos.at(-1)).toBe(1)
  })
})
