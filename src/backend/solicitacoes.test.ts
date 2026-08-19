import { describe, expect, it } from 'vitest'
import { caminhoAnexo } from './solicitacoes'

describe('caminhoAnexo', () => {
  it('guarda o arquivo numa pasta da solicitação, sem barra no nome', () => {
    expect(
      caminhoAnexo(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        'laudo/umidade.xlsx',
      ),
    ).toBe(
      'solicitacoes/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/laudo_umidade.xlsx',
    )
  })
})
