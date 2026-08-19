import { describe, expect, it } from 'vitest'
import {
  adicionarCargas,
  adicionarPdr,
  aplicarCorrecoesEmMassa,
  atualizarPdr,
  definirInformouDiaAnterior,
  definirSituacaoPdr,
  diaAnteriorDe,
  documentoJaCadastrado,
  importarPdrs,
  obterPdrsCatalogo,
  removerPdr,
  excluirCarga,
  certificarVisita,
  gruposDeRateio,
  historicoAcumuladoUnidade,
  migrarCargas,
  obterVisita,
  salvarCarga,
  salvarDadosVisita,
  marcarAnaliseFinal,
  visitaNaAnaliseFinal,
  salvarAcumulado,
  salvarDiaAnterior,
  visitaPorCnpjEData,
} from './store'
import { PDRS_CATALOGO_INICIAIS, VISITAS_INICIAIS } from './data/mock'
import { mascaraProdutor, vespera } from './format'
import { analisarVisita } from './analise'
import { pesoVolumeLiquido, type Carga, type PdrCatalogo } from './types'

const COD = VISITAS_INICIAIS[0].cod

/**
 * O store é um singleton compartilhado entre os testes, então cada caso cria o
 * próprio grupo com ids exclusivos em vez de depender do estado deixado pelo
 * anterior.
 */
let contador = 0
const proximoGrupo = () => `RT-TESTE-${String(++contador).padStart(2, '0')}`

function criarGrupo(quantidade: number): { grupo: string; ids: string[] } {
  const grupo = proximoGrupo()
  const cargas: Carga[] = Array.from({ length: quantidade }, (_, i) => ({
    id: `${grupo}-C${i}`,
    data: '01/06/2026',
    hora: '10:00',
    placa: 'TST1D23',
    produtor: 'FAZENDA TESTE',
    cpfCnpjProdutor: '123.456.789-00',
    romaneio: `9${contador}${i}`,
    pesoLiquido: 30000,
    pesoComDesconto: 29000,
    classificacao: 'Participante',
    rateio: true,
    grupoRateio: grupo,
    acompanhada: true,
  }))
  adicionarCargas(COD, cargas)
  return { grupo, ids: cargas.map((c) => c.id) }
}

const cargasDoGrupo = (grupo: string) =>
  (obterVisita(COD)?.cargas ?? []).filter((c) => c.grupoRateio === grupo)

const buscarCarga = (id: string) => obterVisita(COD)?.cargas.find((c) => c.id === id)

describe('excluirCarga', () => {
  it('remove a carga da visita', () => {
    const { ids } = criarGrupo(3)
    excluirCarga(COD, ids[0])
    expect(buscarCarga(ids[0])).toBeUndefined()
  })

  it('mantém o grupo quando ainda sobram duas cargas', () => {
    const { grupo, ids } = criarGrupo(3)
    excluirCarga(COD, ids[0])
    expect(cargasDoGrupo(grupo)).toHaveLength(2)
  })

  it('dissolve o grupo que ficaria com uma carga só', () => {
    const { grupo, ids } = criarGrupo(2)
    excluirCarga(COD, ids[0])

    expect(cargasDoGrupo(grupo)).toHaveLength(0)
    const sobrou = buscarCarga(ids[1])
    expect(sobrou?.rateio).toBe(false)
    expect(sobrou?.grupoRateio).toBeUndefined()
  })
})

describe('migrarCargas', () => {
  it('move a carga avulsa para o outro lado', () => {
    const id = `MIG-AVULSA-${++contador}`
    adicionarCargas(COD, [
      {
        id,
        data: '01/06/2026',
        hora: '10:00',
        placa: 'TST1D23',
        produtor: 'FAZENDA TESTE',
        cpfCnpjProdutor: '123.456.789-00',
        romaneio: `8${contador}0`,
        pesoLiquido: 30000,
        pesoComDesconto: 29000,
        classificacao: 'Participante',
        rateio: false,
        acompanhada: true,
      },
    ])

    migrarCargas(COD, [id], false)

    expect(buscarCarga(id)?.acompanhada).toBe(false)

    migrarCargas(COD, [id], true)
    expect(buscarCarga(id)?.acompanhada).toBe(true)
  })

  it('migra o grupo inteiro sem desfazer o rateio', () => {
    const { grupo, ids } = criarGrupo(3)
    migrarCargas(COD, ids, false)

    expect(cargasDoGrupo(grupo)).toHaveLength(3)
    for (const id of ids) {
      expect(buscarCarga(id)?.acompanhada).toBe(false)
      expect(buscarCarga(id)?.rateio).toBe(true)
    }
  })

  it('tira do rateio só a carga que muda de lado e dissolve o resto unitário', () => {
    const { grupo, ids } = criarGrupo(2)
    migrarCargas(COD, [ids[0]], false)

    expect(buscarCarga(ids[0])).toMatchObject({
      acompanhada: false,
      rateio: false,
      grupoRateio: undefined,
    })
    expect(buscarCarga(ids[1])).toMatchObject({
      acompanhada: true,
      rateio: false,
      grupoRateio: undefined,
    })
    expect(cargasDoGrupo(grupo)).toHaveLength(0)
  })

  it('mantém o grupo quando ainda sobram duas cargas no mesmo lado', () => {
    const { grupo, ids } = criarGrupo(3)
    migrarCargas(COD, [ids[0]], false)

    expect(buscarCarga(ids[0])?.rateio).toBe(false)
    expect(cargasDoGrupo(grupo)).toHaveLength(2)
  })

  it('zera o recebimento 2.2 quando a visita fica só com não acompanhadas', () => {
    const visita = obterVisita(COD)!
    const acompanhadas = visita.cargas.filter((c) => c.acompanhada)
    migrarCargas(
      COD,
      acompanhadas.map((c) => c.id),
      false,
    )

    expect(obterVisita(COD)?.cargas.some((c) => c.acompanhada)).toBe(false)
    expect(obterVisita(COD)?.dadosVisita.recebimentoCargas).toBe('Não')
  })
})

describe('salvarCarga — saída do rateio', () => {
  /**
   * O bug era este: a dissolução do grupo unitário existia só no excluirCarga.
   * Tirar uma carga pelo modal ("Rateio: Não") deixava para trás um grupo de
   * rateio com uma carga só, que a tela não tinha como desfazer.
   */
  it('dissolve o grupo de origem que ficaria com uma carga só', () => {
    const { grupo, ids } = criarGrupo(2)
    const carga = buscarCarga(ids[0])!
    salvarCarga(COD, { ...carga, rateio: false, grupoRateio: undefined })

    expect(cargasDoGrupo(grupo)).toHaveLength(0)
    expect(buscarCarga(ids[1])?.rateio).toBe(false)
  })

  it('mantém o grupo de origem quando ainda sobram duas', () => {
    const { grupo, ids } = criarGrupo(3)
    const carga = buscarCarga(ids[0])!
    salvarCarga(COD, { ...carga, rateio: false, grupoRateio: undefined })
    expect(cargasDoGrupo(grupo)).toHaveLength(2)
  })

  it('não dissolve grupo recém-criado com uma carga só', () => {
    // um grupo novo legitimamente começa com uma carga, esperando a segunda
    const grupo = proximoGrupo()
    const avulsa = buscarCarga(criarGrupo(3).ids[0])!
    salvarCarga(COD, { ...avulsa, rateio: true, grupoRateio: grupo })

    expect(cargasDoGrupo(grupo)).toHaveLength(1)
    expect(buscarCarga(avulsa.id)?.rateio).toBe(true)
  })
})

describe('salvarCarga — log de alterações', () => {
  it('grava no log quando o analista muda a carga na tela', () => {
    const { ids } = criarGrupo(2)
    const carga = buscarCarga(ids[0])!
    const antes = obterVisita(COD)!.logAlteracoes.length

    salvarCarga(COD, { ...carga, placa: 'LOG1A23' })

    const logs = obterVisita(COD)!.logAlteracoes
    expect(logs.length).toBe(antes + 1)
    expect(logs.at(-1)).toMatchObject({
      origem: 'edicao',
      tipo: 'carga',
      chave: carga.id,
      planilha: 'tela',
    })
    expect(logs.at(-1)?.resumo).toContain('placa')
  })

  it('não grava log se a carga foi salva sem mudança', () => {
    const { ids } = criarGrupo(2)
    const carga = buscarCarga(ids[0])!
    const antes = obterVisita(COD)!.logAlteracoes.length
    salvarCarga(COD, { ...carga })
    expect(obterVisita(COD)!.logAlteracoes.length).toBe(antes)
  })
})

describe('salvarCarga — campos compartilhados do rateio', () => {
  it('propaga data, hora, placa e classificação para o grupo inteiro', () => {
    const { grupo, ids } = criarGrupo(3)
    const carga = buscarCarga(ids[0])!
    salvarCarga(COD, { ...carga, hora: '16:45', placa: 'XYZ9K88', classificacao: 'Negativa' })

    for (const c of cargasDoGrupo(grupo)) {
      expect(c.hora).toBe('16:45')
      expect(c.placa).toBe('XYZ9K88')
      expect(c.classificacao).toBe('Negativa')
    }
  })

  it('não propaga peso, que é próprio de cada carga', () => {
    const { ids } = criarGrupo(2)
    const carga = buscarCarga(ids[0])!
    salvarCarga(COD, { ...carga, pesoLiquido: 12345 })

    expect(buscarCarga(ids[0])?.pesoLiquido).toBe(12345)
    expect(buscarCarga(ids[1])?.pesoLiquido).toBe(30000)
  })
})

describe('Dia Anterior — padrão derivado', () => {
  const DIA = '01/06/2026'

  it('dia sem inserção volta como não informado e zerado', () => {
    const v = obterVisita(COD)!
    const registro = diaAnteriorDe(v, '31/12/1999')

    expect(registro.informouDiaAnterior).toBe('Não')
    expect(registro.valores).toEqual({
      Negativa: 0,
      Declarada: 0,
      Positiva: 0,
      Participante: 0,
    })
  })

  it('a base não guarda nada até o auditor mexer', () => {
    expect(VISITAS_INICIAIS[0].diaAnterior).toEqual([])
  })

  it('visita sem lançamento não gera alerta de Dia Anterior', () => {
    const codigos = analisarVisita(VISITAS_INICIAIS[0]).map((a) => a.codigo)
    expect(codigos).not.toContain('2.9')
    expect(codigos).not.toContain('2.10')
  })

  it('marcar Sim cria o registro daquele dia', () => {
    definirInformouDiaAnterior(COD, DIA, 'Sim')
    expect(diaAnteriorDe(obterVisita(COD)!, DIA).informouDiaAnterior).toBe('Sim')
  })

  it('gravar duas vezes o mesmo dia atualiza, não duplica', () => {
    definirInformouDiaAnterior(COD, DIA, 'Sim')
    salvarDiaAnterior(COD, DIA, { Negativa: 1, Declarada: 2, Positiva: 3, Participante: 4 })
    salvarDiaAnterior(COD, DIA, { Negativa: 9, Declarada: 8, Positiva: 7, Participante: 6 })

    const doDia = obterVisita(COD)!.diaAnterior.filter((d) => d.data === DIA)
    expect(doDia).toHaveLength(1)
    expect(doDia[0].valores.Negativa).toBe(9)
  })

  it('voltar para Não zera as tecnologias', () => {
    definirInformouDiaAnterior(COD, DIA, 'Sim')
    salvarDiaAnterior(COD, DIA, { Negativa: 100, Declarada: 200, Positiva: 300, Participante: 400 })
    definirInformouDiaAnterior(COD, DIA, 'Não')

    const registro = diaAnteriorDe(obterVisita(COD)!, DIA)
    expect(registro.informouDiaAnterior).toBe('Não')
    expect(registro.valores).toEqual({
      Negativa: 0,
      Declarada: 0,
      Positiva: 0,
      Participante: 0,
    })
  })

  it('mexer num dia não afeta o outro', () => {
    const OUTRO = '02/06/2026'
    definirInformouDiaAnterior(COD, DIA, 'Sim')
    salvarDiaAnterior(COD, DIA, { Negativa: 11, Declarada: 0, Positiva: 0, Participante: 0 })
    definirInformouDiaAnterior(COD, OUTRO, 'Sim')
    salvarDiaAnterior(COD, OUTRO, { Negativa: 22, Declarada: 0, Positiva: 0, Participante: 0 })

    expect(diaAnteriorDe(obterVisita(COD)!, DIA).valores.Negativa).toBe(11)
    expect(diaAnteriorDe(obterVisita(COD)!, OUTRO).valores.Negativa).toBe(22)
  })
})

/**
 * A aba Dia Anterior liga um dia à visita daquele dia. Isso só existe se a
 * unidade for visitada mais de uma vez — enquanto cada CNPJ tinha uma visita
 * só, nenhuma linha da tabela virava link.
 */
describe('base — unidades visitadas mais de uma vez', () => {
  const porCnpj = new Map<string, string[]>()
  for (const v of VISITAS_INICIAIS) {
    porCnpj.set(v.pdr.cnpj, [...(porCnpj.get(v.pdr.cnpj) ?? []), v.data])
  }

  it('há bem menos unidades que visitas', () => {
    expect(porCnpj.size).toBeLessThan(VISITAS_INICIAIS.length / 3)
  })

  it('a unidade média é visitada várias vezes', () => {
    const media = VISITAS_INICIAIS.length / porCnpj.size
    expect(media).toBeGreaterThan(3)
  })

  it('nenhuma unidade tem duas visitas no mesmo dia', () => {
    for (const [cnpj, datas] of porCnpj) {
      expect(new Set(datas).size, `unidade ${cnpj}`).toBe(datas.length)
    }
  })

  it('a maioria das visitas acha outra da unidade nos 14 dias anteriores', () => {
    const janela = (data: string) => {
      const dias: string[] = []
      let d = data
      for (let i = 0; i < 14; i++) {
        d = vespera(d)
        dias.push(d)
      }
      return new Set(dias)
    }

    const comLink = VISITAS_INICIAIS.filter((v) => {
      const dias = janela(v.data)
      return (porCnpj.get(v.pdr.cnpj) ?? []).some((d) => dias.has(d))
    }).length

    expect(comLink / VISITAS_INICIAIS.length).toBeGreaterThan(0.6)
  })
})

/**
 * A tela de Administração precisa refletir a operação. Enquanto o cadastro era
 * uma lista à parte, ele mostrava 4 PDRs enquanto as visitas apontavam para
 * dezenas de unidades que não estavam lá.
 */
describe('cadastro cobre as unidades visitadas', () => {
  it('toda unidade com visita está no cadastro', () => {
    const cadastradas = new Set(PDRS_CATALOGO_INICIAIS.map((p) => p.cnpj))
    const orfas = [...new Set(VISITAS_INICIAIS.map((v) => v.pdr.cnpj))].filter(
      (cnpj) => !cadastradas.has(cnpj),
    )
    expect(orfas).toEqual([])
  })

  it('não repete id no cadastro', () => {
    const ids = PDRS_CATALOGO_INICIAIS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a unidade cadastrada guarda nome, cidade e UF da visita', () => {
    const v = VISITAS_INICIAIS[0]
    const cadastrada = PDRS_CATALOGO_INICIAIS.find((p) => p.cnpj === v.pdr.cnpj)

    // normalizado pela mesma máscara do cadastro manual
    expect(cadastrada?.nome).toBe(mascaraProdutor(v.pdr.nome))
    expect(cadastrada?.cidade).toBe(mascaraProdutor(v.pdr.cidade))
    expect(cadastrada?.uf).toBe(v.pdr.uf)
  })

  it('o cadastro inteiro segue a convenção de caixa alta sem acento', () => {
    for (const p of PDRS_CATALOGO_INICIAIS) {
      expect(p.nome, `nome de ${p.cnpj}`).toBe(mascaraProdutor(p.nome))
      expect(p.cidade, `cidade de ${p.cnpj}`).toBe(mascaraProdutor(p.cidade))
    }
  })
})

describe('visitaPorCnpjEData', () => {
  it('encontra a visita da unidade naquele dia', () => {
    const v = VISITAS_INICIAIS[0]
    expect(visitaPorCnpjEData(v.pdr.cnpj, v.data)?.cod).toBe(v.cod)
  })

  it('devolve undefined quando não há visita naquele par CNPJ/data', () => {
    const v = VISITAS_INICIAIS[0]
    expect(visitaPorCnpjEData(v.pdr.cnpj, '31/12/1999')).toBeUndefined()
  })
})


describe('catálogo de PDRs', () => {
  const pdr = (cnpj: string, patch: Partial<PdrCatalogo> = {}): Omit<PdrCatalogo, 'id'> => ({
    nome: 'PDR TESTE',
    cnpj,
    cidade: 'PASSO FUNDO',
    uf: 'RS',
    situacao: 'Ativo',
    ...patch,
  })

  it('inativar mantém o PDR no catálogo', () => {
    const alvo = obterPdrsCatalogo()[0]
    definirSituacaoPdr(alvo.id, 'Inativo')

    const depois = obterPdrsCatalogo().find((p) => p.id === alvo.id)
    expect(depois).toBeDefined()
    expect(depois?.situacao).toBe('Inativo')
  })

  it('reativar volta o PDR para Ativo', () => {
    const alvo = obterPdrsCatalogo()[0]
    definirSituacaoPdr(alvo.id, 'Ativo')
    expect(obterPdrsCatalogo().find((p) => p.id === alvo.id)?.situacao).toBe('Ativo')
  })

  it('importar cadastra o que é novo', () => {
    const antes = obterPdrsCatalogo().length
    const r = importarPdrs([pdr('11.111.111/0001-11'), pdr('22.222.222/0001-22')])

    expect(r).toEqual({ novos: 2, atualizados: 0 })
    expect(obterPdrsCatalogo()).toHaveLength(antes + 2)
  })

  it('importar o mesmo documento atualiza em vez de duplicar', () => {
    importarPdrs([pdr('33.333.333/0001-33', { nome: 'NOME ANTIGO' })])
    const antes = obterPdrsCatalogo().length

    const r = importarPdrs([
      pdr('33.333.333/0001-33', { nome: 'NOME NOVO', situacao: 'Inativo' }),
    ])

    expect(r).toEqual({ novos: 0, atualizados: 1 })
    expect(obterPdrsCatalogo()).toHaveLength(antes)
    const atualizado = obterPdrsCatalogo().find((p) => p.cnpj === '33.333.333/0001-33')
    expect(atualizado?.nome).toBe('NOME NOVO')
    expect(atualizado?.situacao).toBe('Inativo')
  })

  it('atualização preserva cidade e UF, que não vêm na planilha', () => {
    importarPdrs([pdr('44.444.444/0001-44', { cidade: 'SORRISO', uf: 'MT' })])
    importarPdrs([pdr('44.444.444/0001-44', { nome: 'OUTRO NOME', cidade: '', uf: '' })])

    const atualizado = obterPdrsCatalogo().find((p) => p.cnpj === '44.444.444/0001-44')
    expect(atualizado?.cidade).toBe('SORRISO')
    expect(atualizado?.uf).toBe('MT')
  })

  it('cada cadastro nasce com um id próprio e crescente', () => {
    const a = adicionarPdr(pdr('66.666.666/0001-66'))
    const b = adicionarPdr(pdr('77.777.777/0001-77'))

    expect(a.id).not.toBe(b.id)
    expect(Number(b.id)).toBeGreaterThan(Number(a.id))
    expect(a.id).toMatch(/^\d{9}$/)
  })

  /**
   * O documento não é chave: a mesma inscrição aparece em unidades diferentes
   * — no cadastro real do cliente, o CNPJ 17.835.042/0023-50 está em duas
   * cidades. Bloquear aqui impediria de cadastrar a segunda unidade.
   */
  it('permite duas unidades com o mesmo documento, com ids distintos', () => {
    const a = adicionarPdr(pdr('88.888.888/0001-88', { cidade: 'PARANAGUA', uf: 'PR' }))
    const b = adicionarPdr(pdr('88.888.888/0001-88', { cidade: 'MONTE CASTELO', uf: 'SC' }))

    expect(a.id).not.toBe(b.id)
    expect(obterPdrsCatalogo().filter((p) => p.cnpj === '88.888.888/0001-88')).toHaveLength(2)
  })

  it('documentoJaCadastrado avisa, ignorando o próprio registro em edição', () => {
    const a = adicionarPdr(pdr('99.999.999/0001-99'))
    expect(documentoJaCadastrado('99.999.999/0001-99')).toBe(true)
    expect(documentoJaCadastrado('99.999.999/0001-99', a.id)).toBe(false)
  })

  it('editar corrige o documento sem trocar o id do cadastro', () => {
    // é justamente o CPF/CNPJ que pode ter sido digitado errado
    const criado = adicionarPdr(pdr('11.222.333/0001-44', { nome: 'NOME ERRADO' }))
    atualizarPdr(criado.id, { nome: 'NOME CERTO', cnpj: '55.666.777/0001-88' })

    const depois = obterPdrsCatalogo().find((p) => p.id === criado.id)
    expect(depois?.id).toBe(criado.id)
    expect(depois?.nome).toBe('NOME CERTO')
    expect(depois?.cnpj).toBe('55.666.777/0001-88')
    expect(obterPdrsCatalogo().some((p) => p.cnpj === '11.222.333/0001-44')).toBe(false)
  })

  it('editar não mexe nos outros cadastros', () => {
    const a = adicionarPdr(pdr('10.000.000/0001-00', { nome: 'PDR A' }))
    const b = adicionarPdr(pdr('20.000.000/0001-00', { nome: 'PDR B' }))
    atualizarPdr(a.id, { nome: 'PDR A EDITADO' })

    expect(obterPdrsCatalogo().find((p) => p.id === b.id)?.nome).toBe('PDR B')
  })

  it('remover usa o id, não o documento repetido', () => {
    const a = adicionarPdr(pdr('30.000.000/0001-00', { cidade: 'UM' }))
    const b = adicionarPdr(pdr('30.000.000/0001-00', { cidade: 'DOIS' }))
    removerPdr(a.id)

    const restantes = obterPdrsCatalogo().filter((p) => p.cnpj === '30.000.000/0001-00')
    expect(restantes).toHaveLength(1)
    expect(restantes[0].id).toBe(b.id)
  })
})

describe('gruposDeRateio', () => {
  it('agrupa por grupoRateio e soma os pesos', () => {
    const { grupo } = criarGrupo(3)
    const encontrado = gruposDeRateio(obterVisita(COD)!.cargas).find((g) => g.id === grupo)

    expect(encontrado?.cargas).toHaveLength(3)
    expect(encontrado?.pesoLiquidoTotal).toBe(90000)
    expect(encontrado?.pesoComDescontoTotal).toBe(87000)
  })

  it('ignora carga avulsa', () => {
    const cargas = obterVisita(COD)!.cargas
    const idsAgrupados = gruposDeRateio(cargas).flatMap((g) => g.cargas.map((c) => c.id))
    const avulsas = cargas.filter((c) => !c.grupoRateio).map((c) => c.id)
    expect(idsAgrupados.filter((id) => avulsas.includes(id))).toHaveLength(0)
  })
})

describe('aplicarCorrecoesEmMassa', () => {
  const meta = {
    arquivos: { cargas: 'cargas.csv', diaAnterior: 'dia.csv', acumulado: 'acumulado.csv' },
    alertasDe: () => [] as { id: string; regra: string; detalhe: string }[],
  }

  it('corrige carga, dia anterior e acumulado de uma vez', () => {
    const { ids } = criarGrupo(2)
    const id = ids[0]
    const dataVisita = obterVisita(COD)!.data

    const r = aplicarCorrecoesEmMassa(
      {
        cargas: [{ id, produtor: 'PRODUTOR CORRIGIDO' }],
        diasAnteriores: [
          {
            cod: COD,
            dia: '01/01/2026',
            valores: { Negativa: 10, Declarada: 0, Positiva: 0, Participante: 0 },
          },
        ],
        acumulados: [{ cod: COD, dia: dataVisita, valores: { Positiva: 99 } }],
      },
      meta,
    )

    expect(r).toMatchObject({ cargas: 1, diasAnteriores: 1, acumulados: 1, reabertas: [] })
    expect(buscarCarga(id)?.produtor).toBe('PRODUTOR CORRIGIDO')
    expect(diaAnteriorDe(obterVisita(COD)!, '01/01/2026').valores.Negativa).toBe(10)
    expect(obterVisita(COD)!.acumulado.valores.Positiva).toBe(99)
    expect(obterVisita(COD)!.logAlteracoes.length).toBeGreaterThan(0)
  })

  it('reabre na Central 1 e marca aviso de import quando gera erro', () => {
    const { ids } = criarGrupo(2)
    certificarVisita(COD, [])
    expect(obterVisita(COD)!.situacao).toBe('certificada')

    aplicarCorrecoesEmMassa(
      { cargas: [{ id: ids[0], romaneio: 'DUP-99' }] },
      {
        arquivos: { cargas: 'romaneio.csv' },
        alertasDe: () => [
          { id: 'romaneio-DUP-99', regra: 'Romaneio duplicado (3.6.2)', detalhe: 'duplicado' },
        ],
      },
    )

    const v = obterVisita(COD)!
    expect(v.situacao).toBe('central-correcao')
    expect(v.rodada).toBe(1)
    expect(v.avisoImport?.alertaIds).toContain('romaneio-DUP-99')
    expect(v.avisoImport?.arquivos).toEqual(['romaneio.csv'])
    expect(v.logAlteracoes.at(-1)?.resumo).toContain(ids[0])
  })
})

describe('pesoVolumeLiquido', () => {
  const base: Carga = {
    id: 'VOL-1',
    data: '01/06/2026',
    hora: '10:00',
    placa: 'AAA1A11',
    produtor: 'FAZENDA',
    cpfCnpjProdutor: '123.456.789-00',
    romaneio: '1',
    pesoLiquido: 40000,
    pesoComDesconto: 38000,
    classificacao: 'Participante',
    rateio: false,
    acompanhada: true,
  }

  it('usa o peso com desconto quando ele existe', () => {
    expect(pesoVolumeLiquido(base)).toBe(38000)
  })

  it('cai no peso sem desconto quando o com desconto é zero', () => {
    expect(pesoVolumeLiquido({ ...base, pesoComDesconto: 0 })).toBe(40000)
  })

  it('cai no peso sem desconto quando o com desconto não foi informado', () => {
    expect(
      pesoVolumeLiquido({
        ...base,
        pesoComDesconto: 0,
        naoInformado: { pesoComDesconto: true },
      }),
    ).toBe(40000)
  })

  it('zera quando o líquido também não foi informado', () => {
    expect(
      pesoVolumeLiquido({
        ...base,
        pesoLiquido: 0,
        pesoComDesconto: 0,
        naoInformado: { pesoLiquido: true, pesoComDesconto: true },
      }),
    ).toBe(0)
  })
})

describe('histórico de acumulado sem dias inventados', () => {
  it('só lista dias que têm visita da unidade', () => {
    const v = VISITAS_INICIAIS[0]
    const reais = new Set(
      VISITAS_INICIAIS.filter((x) => x.pdr.cnpj === v.pdr.cnpj).map((x) => x.data),
    )
    const h = historicoAcumuladoUnidade(v.pdr.cnpj, new Date(2099, 0, 1))
    expect(h.dias.length).toBeGreaterThan(0)
    for (const d of h.dias) expect(reais.has(d.periodo), d.periodo).toBe(true)
  })

  it('depois de gravar o acumulado, usa os kg novos e não apaga os outros dias', () => {
    const v = obterVisita(COD)!
    const diasAntes = historicoAcumuladoUnidade(v.pdr.cnpj, new Date(2099, 0, 1)).dias.length
    salvarAcumulado(COD, {
      informadoPeloPdr: 'Sim',
      valores: { Negativa: 11, Declarada: 22, Positiva: 33, Participante: 44 },
    })
    const h = historicoAcumuladoUnidade(v.pdr.cnpj, new Date(2099, 0, 1))
    const dia = h.dias.find((d) => d.periodo === v.data)
    expect(dia?.negativa).toBe(11)
    expect(dia?.declarada).toBe(22)
    expect(h.dias.length).toBe(diasAntes)
  })
})

describe('1.4 gera ocorrência e análise final não descertifica', () => {
  it('cria ocorrência de fitas e marca 2.5 como Sim', () => {
    salvarDadosVisita(COD, { fitasAssociaveisCargas: 'Não' })
    const v = obterVisita(COD)!
    expect(v.dadosVisita.houveOcorrencia).toBe('Sim')
    expect(v.ocorrencias.some((o) => o.id === `OC-FITAS-${COD}`)).toBe(true)
  })

  it('análise final marca conferência e a visita segue certificada', () => {
    certificarVisita(COD, [], { erros: 2, atencoes: 1 })
    expect(obterVisita(COD)!.situacao).toBe('certificada')
    expect(visitaNaAnaliseFinal(obterVisita(COD)!)).toBe(true)
    marcarAnaliseFinal(COD, 'conferi as justificativas')
    const v = obterVisita(COD)!
    expect(v.situacao).toBe('certificada')
    expect(v.analiseFinal?.obs).toBe('conferi as justificativas')
  })
})
