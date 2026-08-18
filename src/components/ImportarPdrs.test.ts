import { describe, expect, it } from 'vitest'
import { analisarPlanilhaPdrs } from './ImportarPdrs'

const CABECALHO = 'Nome PDR;CPF/CNPJ;Situação'
const planilha = (...linhas: string[]) => [CABECALHO, ...linhas].join('\r\n')
const primeira = (linha: string) => analisarPlanilhaPdrs(planilha(linha))[0]

describe('leitura da planilha', () => {
  it('reconhece e descarta o cabeçalho', () => {
    const linhas = analisarPlanilhaPdrs(planilha('COOPERALFA LTDA;02.595.222/0005-53;Ativo'))
    expect(linhas).toHaveLength(1)
    expect(linhas[0].linha).toBe(2)
  })

  it('lê planilha sem cabeçalho', () => {
    const linhas = analisarPlanilhaPdrs('COOPERALFA LTDA;02.595.222/0005-53;Ativo')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].pdr?.nome).toBe('COOPERALFA LTDA')
  })

  it('aceita separador por tabulação', () => {
    const texto = 'COOPERALFA LTDA\t02.595.222/0005-53\tAtivo'
    expect(analisarPlanilhaPdrs(texto)[0].pdr).not.toBeNull()
  })

  it('devolve vazio para texto vazio', () => {
    expect(analisarPlanilhaPdrs('')).toEqual([])
  })
})

describe('normalização', () => {
  it('aplica as mesmas máscaras do cadastro manual', () => {
    const { pdr, erros } = primeira('Cooperalfa  Agroindl Ltda.;02595222000553;Ativo')

    expect(erros).toEqual([])
    expect(pdr?.nome).toBe('COOPERALFA AGROINDL LTDA')
    expect(pdr?.cnpj).toBe('02.595.222/0005-53')
  })

  it('formata CPF quando vêm 11 dígitos', () => {
    expect(primeira('JOAO DA SILVA;12345678900;Ativo').pdr?.cnpj).toBe('123.456.789-00')
  })
})

describe('situação', () => {
  it('aceita as formas usuais de Ativo', () => {
    for (const v of ['Ativo', 'ATIVO', 'S', 'sim', '1', 'true']) {
      expect(primeira(`PDR TESTE;02.595.222/0005-53;${v}`).pdr?.situacao).toBe('Ativo')
    }
  })

  it('aceita as formas usuais de Inativo', () => {
    for (const v of ['Inativo', 'INATIVO', 'N', 'não', 'nao', '0', 'false']) {
      expect(primeira(`PDR TESTE;02.595.222/0005-53;${v}`).pdr?.situacao).toBe('Inativo')
    }
  })

  it('sem a coluna, entra como Ativo', () => {
    expect(primeira('PDR TESTE;02.595.222/0005-53').pdr?.situacao).toBe('Ativo')
  })

  it('recusa valor desconhecido em vez de assumir Ativo', () => {
    // assumir Ativo no escuro colocaria em operação uma unidade desativada
    const { pdr, erros } = primeira('PDR TESTE;02.595.222/0005-53;talvez')
    expect(pdr).toBeNull()
    expect(erros.join()).toContain('Situação inválida')
  })
})

describe('validação do documento', () => {
  it('recusa CPF/CNPJ incompleto', () => {
    const { pdr, erros } = primeira('PDR TESTE;123456;Ativo')
    expect(pdr).toBeNull()
    expect(erros.join()).toContain('11 ou 14 dígitos')
  })

  it('recusa linha sem documento', () => {
    expect(primeira('PDR TESTE;;Ativo').erros.join()).toContain('CPF/CNPJ vazio')
  })

  it('recusa nome que ficou vazio depois da máscara', () => {
    expect(primeira('...;02.595.222/0005-53;Ativo').erros.join()).toContain('Nome do PDR vazio')
  })
})

describe('duplicidade dentro da própria planilha', () => {
  it('acusa a segunda ocorrência do mesmo documento', () => {
    const linhas = analisarPlanilhaPdrs(
      planilha(
        'PDR UM;02.595.222/0005-53;Ativo',
        'PDR DOIS;02.595.222/0005-53;Inativo',
      ),
    )

    expect(linhas[0].pdr).not.toBeNull()
    expect(linhas[1].pdr).toBeNull()
    expect(linhas[1].erros.join()).toContain('repetido na planilha')
  })

  it('não confunde documentos diferentes', () => {
    const linhas = analisarPlanilhaPdrs(
      planilha(
        'PDR UM;02.595.222/0005-53;Ativo',
        'PDR DOIS;88.879.473/0001-51;Ativo',
      ),
    )
    expect(linhas.every((l) => l.pdr !== null)).toBe(true)
  })

  it('enxerga o mesmo documento escrito com e sem pontuação', () => {
    const linhas = analisarPlanilhaPdrs(
      planilha('PDR UM;02.595.222/0005-53;Ativo', 'PDR DOIS;02595222000553;Ativo'),
    )
    expect(linhas[1].erros.join()).toContain('repetido na planilha')
  })
})
