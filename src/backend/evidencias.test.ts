import { describe, expect, it } from 'vitest'
import { caminhoFotoCarga, fotoDeBanco, fotoUrlParaBanco, validarFotoCarga } from './evidencias'

describe('validarFotoCarga', () => {
  it('aceita jpeg pequeno', () => {
    const f = new File([new Uint8Array(12)], 'romaneio.jpg', { type: 'image/jpeg' })
    expect(validarFotoCarga(f)).toBeNull()
  })

  it('recusa pdf', () => {
    const f = new File([new Uint8Array(12)], 'doc.pdf', { type: 'application/pdf' })
    expect(validarFotoCarga(f)).toBe('Use jpeg, png ou webp.')
  })
})

describe('fotoUrlParaBanco / fotoDeBanco', () => {
  it('grava o path do storage, não a URL assinada', () => {
    expect(fotoUrlParaBanco({ fotoPath: 'cargas/1/2/a.jpg', fotoUrl: 'https://x/a' })).toBe(
      'storage:cargas/1/2/a.jpg',
    )
    expect(fotoDeBanco('storage:cargas/1/2/a.jpg')).toEqual({ fotoPath: 'cargas/1/2/a.jpg' })
  })

  it('mantém data-url local', () => {
    expect(fotoUrlParaBanco({ fotoUrl: 'data:image/jpeg;base64,AA' })).toBe('data:image/jpeg;base64,AA')
    expect(fotoDeBanco('data:image/jpeg;base64,AA')).toEqual({ fotoUrl: 'data:image/jpeg;base64,AA' })
  })

  it('monta o caminho da carga', () => {
    expect(caminhoFotoCarga(9, '42', 'a/b.jpg')).toBe('cargas/9/42/a_b.jpg')
  })
})
