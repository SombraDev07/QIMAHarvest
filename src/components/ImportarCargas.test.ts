import { describe, expect, it } from 'vitest'
import { analisarPlanilha } from './ImportarCargas'

const CABECALHO =
  'Data;Hora;Placa;Produtor;CPF/CNPJ;Romaneio;Peso Líquido;Peso com Desconto;Classificação;Rateio;Grupo Rateio;Observação'

const planilha = (...linhas: string[]) => [CABECALHO, ...linhas].join('\r\n')

/** primeira linha de dados já analisada */
const primeira = (linha: string) => analisarPlanilha(planilha(linha), '15/03/2026')[0]

describe('normalização na importação', () => {
  it('aplica as mesmas máscaras do formulário', () => {
    const { carga, erros } = primeira(
      '15/03/2026;8:30;abc-1d23;Agropecuária  Céu Azul Ltda.;12345678900;152-422;42500;41800;Participante;Não;;',
    )

    expect(erros).toEqual([])
    expect(carga).toMatchObject({
      hora: '08:30',
      placa: 'ABC1D23',
      produtor: 'AGROPECUARIA CEU AZUL LTDA',
      cpfCnpjProdutor: '123.456.789-00',
      romaneio: '152422',
    })
  })

  it('formata CNPJ quando vêm 14 dígitos', () => {
    const { carga } = primeira(
      '15/03/2026;10:00;XYZ4E56;Coop. Agrária S/A;12345678000190;150234;38900;38100;Declarada;Não;;',
    )
    expect(carga?.cpfCnpjProdutor).toBe('12.345.678/0001-90')
    expect(carga?.produtor).toBe('COOP AGRARIA S/A')
  })
})

describe('hora vinda de planilha', () => {
  it('aceita hora de um dígito e formato sem separador', () => {
    expect(primeira('15/03/2026;8:30;ABC1D23;FAZENDA;123;150001;100;90;Declarada;Não;;').carga?.hora)
      .toBe('08:30')
    expect(primeira('15/03/2026;0905;ABC1D23;FAZENDA;123;150001;100;90;Declarada;Não;;').carga?.hora)
      .toBe('09:05')
  })

  it('recusa a linha em vez de inventar um horário', () => {
    // com a máscara de digitação, "99:99" viraria 23:59 e entraria sem ninguém ver
    const { carga, erros } = primeira(
      '15/03/2026;99:99;ABC1D23;FAZENDA;123;150001;100;90;Declarada;Não;;',
    )
    expect(carga).toBeNull()
    expect(erros.join()).toContain('Hora inválida')
  })
})

describe('peso', () => {
  it('recusa peso líquido acima do teto em vez de truncar', () => {
    // truncar em massa mudaria um valor sem ninguém perceber
    const { carga, erros } = primeira(
      '15/03/2026;10:00;ABC1D23;FAZENDA;123;150001;130000;129000;Declarada;Não;;',
    )
    expect(carga).toBeNull()
    expect(erros.join()).toContain('120.000 kg')
  })

  it('aceita exatamente o teto', () => {
    const { carga } = primeira(
      '15/03/2026;10:00;ABC1D23;FAZENDA;123;150001;120000;119000;Declarada;Não;;',
    )
    expect(carga?.pesoLiquido).toBe(120000)
  })

  it('recusa desconto maior que o líquido', () => {
    const { erros } = primeira(
      '15/03/2026;10:00;ABC1D23;FAZENDA;123;150001;30000;31000;Declarada;Não;;',
    )
    expect(erros.join()).toContain('maior que o líquido')
  })
})

describe('campos obrigatórios', () => {
  it('acusa produtor que ficou vazio depois da máscara', () => {
    const { erros } = primeira('15/03/2026;10:00;ABC1D23;...;123;150001;100;90;Declarada;Não;;')
    expect(erros.join()).toContain('Produtor vazio')
  })

  it('acusa romaneio que ficou vazio depois da máscara', () => {
    const { erros } = primeira('15/03/2026;10:00;ABC1D23;FAZENDA;123;###;100;90;Declarada;Não;;')
    expect(erros.join()).toContain('Romaneio vazio')
  })
})

describe('rateio', () => {
  it('exige identificador de grupo quando rateio é Sim', () => {
    const { erros } = primeira(
      '15/03/2026;10:00;ABC1D23;FAZENDA;123;150001;100;90;Declarada;Sim;;',
    )
    expect(erros.join()).toContain('grupo')
  })

  it('vincula a carga ao grupo informado', () => {
    const { carga } = primeira(
      '15/03/2026;10:00;ABC1D23;FAZENDA;123;150001;100;90;Declarada;Sim;RT-01;',
    )
    expect(carga?.rateio).toBe(true)
    expect(carga?.grupoRateio).toBe('RT-01')
  })
})

describe('leitura do arquivo', () => {
  it('reconhece e descarta o cabeçalho', () => {
    const linhas = analisarPlanilha(
      planilha('15/03/2026;10:00;ABC1D23;FAZENDA;123;150001;100;90;Declarada;Não;;'),
      '15/03/2026',
    )
    expect(linhas).toHaveLength(1)
    expect(linhas[0].linha).toBe(2)
  })

  it('usa a data da visita quando a coluna vem vazia', () => {
    const { carga } = primeira(';10:00;ABC1D23;FAZENDA;123;150001;100;90;Declarada;Não;;')
    expect(carga?.data).toBe('15/03/2026')
  })

  it('célula vazia de peso vira não informado', () => {
    const { carga, erros } = primeira('15/03/2026;10:00;ABC1D23;FAZENDA;123;150001;;;Declarada;Não;;')
    expect(erros).toEqual([])
    expect(carga).toMatchObject({
      pesoLiquido: 0,
      pesoComDesconto: 0,
      naoInformado: { pesoLiquido: true, pesoComDesconto: true },
    })
  })

  it('aceita só o líquido vazio, com desconto preenchido', () => {
    const { carga, erros } = primeira(
      '15/03/2026;10:00;ABC1D23;FAZENDA;123;150001;;41800;Declarada;Não;;',
    )
    expect(erros).toEqual([])
    expect(carga?.naoInformado).toEqual({ pesoLiquido: true })
    expect(carga?.pesoComDesconto).toBe(41800)
  })

  it('aceita separador por tabulação', () => {
    const texto = [
      CABECALHO.replace(/;/g, '\t'),
      '15/03/2026\t10:00\tABC1D23\tFAZENDA\t123\t150001\t100\t90\tDeclarada\tNão\t\t',
    ].join('\r\n')
    expect(analisarPlanilha(texto, '15/03/2026')[0].carga).not.toBeNull()
  })
})
