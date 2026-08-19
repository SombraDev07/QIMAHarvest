import { describe, expect, it } from 'vitest'
import { cargaDeLinha, cargaParaLinha } from './persistir'

const carga = {
  id: '99',
  data: '01/06/2026',
  hora: '10:00',
  placa: 'ABC1D23',
  produtor: 'FAZENDA',
  cpfCnpjProdutor: '123.456.789-00',
  romaneio: '150001',
  pesoLiquido: 30000,
  pesoComDesconto: 29000,
  classificacao: 'Participante' as const,
  rateio: false,
  acompanhada: true,
  fotoPath: 'cargas/8/99/a.jpg',
  fotoUrl: 'https://cdn.exemplo/a.jpg',
  fotoConferidaPor: 'Ana',
  fotoConferidaEm: Date.parse('2026-08-19T12:00:00.000Z'),
}

describe('cargaParaLinha / cargaDeLinha', () => {
  it('grava path, storage e conferência da foto', () => {
    const linha = cargaParaLinha(8, carga)
    expect(linha.foto_path).toBe('cargas/8/99/a.jpg')
    expect(linha.foto_url).toBe('storage:cargas/8/99/a.jpg')
    expect(linha.foto_conferida_por).toBe('Ana')
    expect(linha.foto_conferida_ts).toBe('2026-08-19T12:00:00.000Z')

    const volta = cargaDeLinha(linha)
    expect(volta.fotoPath).toBe('cargas/8/99/a.jpg')
    expect(volta.fotoConferidaPor).toBe('Ana')
    expect(volta.fotoConferidaEm).toBe(carga.fotoConferidaEm)
  })
})
