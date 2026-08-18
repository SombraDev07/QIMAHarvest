/**
 * Leitura das duas planilhas reais de campo — uma de visitas, outra de cargas —
 * e montagem das visitas do sistema. As duas se ligam pelo código da visita.
 *
 * Fica fora de components/ porque é lógica pura: a tela só exibe o preview que
 * estas funções produzem, e os testes exercitam tudo sem renderizar nada.
 */
import {
  mascaraCpfCnpj,
  mascaraPlaca,
  mascaraProdutor,
  mascaraRomaneio,
  normalizarHoraPlanilha,
  numeroPlanilha,
  semAcento,
  ufDoEstado,
  vespera,
} from '../format'
import {
  CLASSIFICACOES,
  PESO_LIQUIDO_MAX,
  type Carga,
  type Classificacao,
  type DiaAnterior,
  type Visita,
} from '../types'

/* ------------------------------------------------------------------ *
 * Leitura crua: cabeçalho + linhas, tolerante a separador e a acento
 * ------------------------------------------------------------------ */
export type Linha = Record<string, string>

const limpar = (v: string) => (v ?? '').trim().replace(/^"|"$/g, '')

/** chave normalizada: sem acento, sem espaço duplo, em minúsculas */
const chave = (v: string) => semAcento(limpar(v)).toLowerCase().replace(/\s+/g, ' ')

function detectarSeparador(primeira: string): string {
  const candidatos = [';', '\t', ','] as const
  return candidatos.reduce(
    (melhor, sep) => (primeira.split(sep).length > primeira.split(melhor).length ? sep : melhor),
    ';',
  )
}

export function lerPlanilha(texto: string): Linha[] {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())

  if (linhas.length < 2) return []

  const sep = detectarSeparador(linhas[0])
  const cabecalho = linhas[0].split(sep).map(chave)

  return linhas.slice(1).map((l) => {
    const col = l.split(sep)
    const registro: Linha = {}
    cabecalho.forEach((c, i) => {
      registro[c] = limpar(col[i] ?? '')
    })
    return registro
  })
}

/** primeira coluna cujo nome bate — a planilha varia entre "Distritor" e "Distrito" */
export const campo = (l: Linha, ...nomes: string[]): string => {
  for (const n of nomes) {
    const v = l[chave(n)]
    if (v !== undefined && v !== '') return v
  }
  return ''
}

const simNao = (v: string): 'Sim' | 'Não' => (/^s/i.test(semAcento(v).trim()) ? 'Sim' : 'Não')

/** Dia Anterior vem do bloco A da planilha de visitas, por tecnologia. */
function diaAnteriorDaPlanilha(l: Linha, cod: number, data: string): DiaAnterior[] {
  const informou = simNao(campo(l, 'PDR forneceu dados do dia anterior?'))
  const valores: Record<Classificacao, number> = {
    Negativa: numeroPlanilha(campo(l, 'A: VOLUME TESTADA NEGATIVA (Kg)')),
    Declarada: numeroPlanilha(campo(l, 'A: VOLUME DECLARADA (Kg)')),
    Positiva: numeroPlanilha(
      campo(l, 'A: VOLUME TESTADA POSITVA (Kg)', 'A: VOLUME TESTADA POSITIVA (Kg)'),
    ),
    Participante: numeroPlanilha(campo(l, 'A: VOLUME PARTICIPANTES (Kg)')),
  }
  const temValor = CLASSIFICACOES.some((c) => valores[c] > 0)
  // Sim entra mesmo zerado: 0-0-0-0 é lançamento válido, não ausência.
  // Sem a marca, ainda anexa se o bloco A trouxe alguma tonelagem.
  if (informou !== 'Sim' && !temValor) return []
  const dia = vespera(data)
  return [
    {
      id: `DA-${cod}-${dia.replace(/\//g, '')}`,
      data: dia,
      informouDiaAnterior: 'Sim',
      valores,
    },
  ]
}

/* ------------------------------------------------------------------ *
 * Planilha de cargas
 * ------------------------------------------------------------------ */
export interface CargaImportada {
  linha: number
  codVisita: number
  carga: Carga | null
  erros: string[]
}

const CLASSIFICACAO_POR_TESTE: Record<string, Classificacao> = {
  negativa: 'Negativa',
  'testada negativa': 'Negativa',
  declarada: 'Declarada',
  positiva: 'Positiva',
  'testada positiva': 'Positiva',
  participante: 'Participante',
}

/**
 * Id de carga aleatório e único. Aleatório porque um id sequencial denuncia
 * ordem e volume de importação, e único de verdade porque é chave: o store
 * casa carga por id, e um repetido faria uma sobrescrever a outra.
 *
 * Seis dígitos cabem na coluna da tabela e ficam abaixo da faixa da base
 * (8 dígitos, 30414000+), então não colidem com o que já existe. O Set
 * garante o resto dentro do lote.
 */
function criarGeradorDeId() {
  const usados = new Set<string>()
  return (): string => {
    for (;;) {
      const n = Math.floor(Math.random() * 900_000) + 100_000
      const id = String(n)
      if (usados.has(id)) continue
      usados.add(id)
      return id
    }
  }
}

export function analisarPlanilhaCargas(texto: string): CargaImportada[] {
  const linhas = lerPlanilha(texto)
  const novoId = criarGeradorDeId()

  return linhas.map((l, i) => {
    const erros: string[] = []
    const numeroLinha = i + 2

    const codVisita = Number(campo(l, 'ID Visita', 'Visit ID', 'Id Visita'))
    if (!Number.isFinite(codVisita) || codVisita <= 0) erros.push('ID da visita ausente ou inválido.')

    const horaBruta = campo(l, 'Hora')
    const hora = normalizarHoraPlanilha(horaBruta)
    if (horaBruta && !hora) erros.push(`Hora inválida: "${horaBruta}".`)

    const placa = mascaraPlaca(campo(l, 'Placa Caminhão', 'Placa Caminhao', 'Placa'))
    const produtor = mascaraProdutor(campo(l, 'Produtor Nome', 'Produtor'))
    const romaneio = mascaraRomaneio(campo(l, 'Numero Documento', 'Número Documento', 'Romaneio'))

    const brutoLiquido = campo(l, 'Peso Líquido', 'Peso Liquido')
    const brutoDesconto = campo(l, 'Peso Líquido com Desconto', 'Peso Liquido com Desconto')
    const liquidoVazio = !brutoLiquido
    const descontoVazio = !brutoDesconto
    const pesoLiquido = liquidoVazio ? 0 : numeroPlanilha(brutoLiquido)
    const pesoComDesconto = descontoVazio ? 0 : numeroPlanilha(brutoDesconto)

    if (!liquidoVazio) {
      if (!Number.isFinite(pesoLiquido) || pesoLiquido <= 0) erros.push('Peso líquido inválido.')
      else if (pesoLiquido > PESO_LIQUIDO_MAX)
        erros.push(`Peso líquido acima do máximo de ${PESO_LIQUIDO_MAX.toLocaleString('pt-BR')} kg.`)
    }
    if (!descontoVazio && !Number.isFinite(pesoComDesconto)) erros.push('Peso com desconto inválido.')
    if (!liquidoVazio && !descontoVazio && pesoComDesconto > pesoLiquido)
      erros.push('Peso com desconto maior que o líquido.')

    const testeBruto = campo(l, 'Teste Resultado Monitorado', 'Classificação', 'Classificacao')
    const classificacao = CLASSIFICACAO_POR_TESTE[semAcento(testeBruto).toLowerCase()]
    if (!classificacao) erros.push(`Classificação desconhecida: "${testeBruto}".`)

    const rateio = simNao(campo(l, 'RATEIO', 'Rateio')) === 'Sim'

    return {
      linha: numeroLinha,
      codVisita,
      erros,
      carga:
        erros.length > 0
          ? null
          : {
              id: novoId(),
              data: campo(l, 'Data'),
              hora: hora ?? '00:00',
              placa,
              produtor,
              cpfCnpjProdutor: mascaraCpfCnpj(campo(l, 'Produtor CPF/CNPJ', 'CPF/CNPJ')),
              romaneio,
              pesoLiquido,
              pesoComDesconto,
              classificacao: classificacao!,
              rateio,
              acompanhada: simNao(campo(l, 'Carga Acompanhada')) === 'Sim',
              ...(liquidoVazio || descontoVazio
                ? {
                    naoInformado: {
                      ...(liquidoVazio ? { pesoLiquido: true as const } : {}),
                      ...(descontoVazio ? { pesoComDesconto: true as const } : {}),
                    },
                  }
                : {}),
            },
    }
  })
}

/* ------------------------------------------------------------------ *
 * Planilha de visitas
 * ------------------------------------------------------------------ */
export interface VisitaImportada {
  linha: number
  cod: number
  visita: Visita | null
  erros: string[]
  /** quantas cargas da outra planilha vieram para esta visita */
  cargas: number
}

const MODALIDADES = ['1H', '2H', '4H', '8H'] as const
type Modalidade = (typeof MODALIDADES)[number]

const DADOS_VISITA_VAZIOS = {
  visitaIniciada: 'Sim' as const,
  recebimentoCargas: 'Não' as const,
  realizouTestes: 'Não' as const,
  houveReteste: 'Não' as const,
  retesteSolicitante: '',
  retesteMotivo: '',
  houveOcorrencia: 'Não' as const,
  caixaFitaTeste: 0,
  fitasAssociaveisCargas: 'Não' as const,
}

export function analisarPlanilhaVisitas(
  texto: string,
  cargasPorVisita: Map<number, Carga[]> = new Map(),
): VisitaImportada[] {
  const linhas = lerPlanilha(texto)
  const vistos = new Set<number>()

  return linhas.map((l, i) => {
    const erros: string[] = []
    const numeroLinha = i + 2

    const cod = Number(campo(l, 'Visit ID', 'ID Visita', 'Codigo', 'Código'))
    if (!Number.isFinite(cod) || cod <= 0) erros.push('Visit ID ausente ou inválido.')
    else if (vistos.has(cod)) erros.push(`Visit ID repetido na planilha: ${cod}.`)
    else vistos.add(cod)

    const data = campo(l, 'Data Visita', 'Data')
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data)) erros.push(`Data da visita inválida: "${data}".`)

    const entrada = normalizarHoraPlanilha(campo(l, 'Entrada'))
    const saida = normalizarHoraPlanilha(campo(l, 'Saída', 'Saida'))
    if (!entrada) erros.push('Hora de entrada inválida.')
    if (!saida) erros.push('Hora de saída inválida.')

    const uf = ufDoEstado(campo(l, 'Estado PDR', 'Estado'))
    if (!uf) erros.push(`Estado não reconhecido: "${campo(l, 'Estado PDR', 'Estado')}".`)

    const cnpj = mascaraCpfCnpj(campo(l, 'CNPJ PDR', 'CNPJ'))
    if (!cnpj) erros.push('CNPJ do PDR ausente.')

    const moduloBruto = semAcento(campo(l, 'Modulo', 'Módulo')).toUpperCase().replace(/\s/g, '')
    const modalidade = MODALIDADES.find((m) => m === moduloBruto)
    if (!modalidade) erros.push(`Módulo desconhecido: "${moduloBruto}" — use ${MODALIDADES.join(', ')}.`)

    const tipoBruto = semAcento(campo(l, 'Tipo Visita', 'Tipo')).toLowerCase()
    const tipoVisita = /remot/.test(tipoBruto) ? 'REMOTA' : 'PRESENCIAL'

    /**
     * Acumulado da safra vem do bloco B. A Declarada não existe nesse recorte
     * — a planilha separa por patente, não por declaração —, então fica zerada.
     */
    const acumuladoValores: Record<Classificacao, number> = {
      Negativa: numeroPlanilha(campo(l, 'B: VOLUME BIOTECNOLOGIA PATENTE INVALIDA')),
      Positiva: numeroPlanilha(campo(l, 'B: VOLUME BIOTECNOLOGIA PATENTE VALIDA')),
      Participante: numeroPlanilha(campo(l, 'B: VOLUME PARTICIPANTES')),
      Declarada: 0,
    }
    for (const [c, v] of Object.entries(acumuladoValores)) {
      if (!Number.isFinite(v)) erros.push(`Volume do acumulado inválido em ${c}.`)
    }

    const cargas = cargasPorVisita.get(cod) ?? []
    const temAcompanhada = cargas.some((c) => c.acompanhada)
    const recebimentoCargas: 'Sim' | 'Não' = temAcompanhada
      ? 'Sim'
      : cargas.length > 0
        ? 'Não'
        : simNao(campo(l, 'Houve recebimento de soja?'))

    return {
      linha: numeroLinha,
      cod,
      erros,
      cargas: cargas.length,
      visita:
        erros.length > 0
          ? null
          : {
              cod,
              data,
              envioTablet: data,
              pdr: {
                nome: mascaraProdutor(campo(l, 'Nome PDR')),
                cnpj,
                cidade: mascaraProdutor(campo(l, 'Cidade PDR', 'Cidade')),
                uf: uf!,
                regiao: campo(l, 'Regional PDR', 'Regional'),
                distrito: campo(l, 'Distritor PDR', 'Distrito PDR', 'Distrito'),
                endereco: '',
                telefone: '',
                responsavel: campo(l, 'Nome responsável acompanhamento', 'Nome responsavel acompanhamento'),
                capacidadeEstatica: 0,
                tipoUnidade: 'ARMAZÉM',
              },
              numeroVisitas: 1,
              // a fila real é decidida depois, pelo resultado da análise
              situacao: 'central-correcao',
              // visita que acaba de chegar está na primeira passagem
              rodada: 1,
              consultor: campo(l, 'Inspetor', 'Consultor'),
              lider: campo(l, 'Líder', 'Lider'),
              liderFocal: '',
              supervisor: '',
              tipoVisita,
              modalidade: modalidade as Modalidade,
              horaInicio: entrada!,
              horaFim: saida!,
              duracao: modalidade ?? '',
              primeiraVisita: false,
              pdrMista: false,
              cincoEstrelas: false,
              dadosVisita: {
                ...DADOS_VISITA_VAZIOS,
                recebimentoCargas,
                realizouTestes: simNao(campo(l, 'Testes executados em conformidade?')),
                fitasAssociaveisCargas: simNao(campo(l, 'Armazenamento correto de fitas teste?')),
                houveReteste: simNao(campo(l, 'Houve solicitação de reteste?', 'Houve solicitacao de reteste?')),
                houveOcorrencia: simNao(campo(l, 'Ocorrencias', 'Ocorrências')),
                caixaFitaTeste: numeroPlanilha(
                  campo(l, 'Número de caixas de fita teste disponíveis', 'Numero de caixas de fita teste disponiveis'),
                ),
              },
              acumulado: {
                informadoPeloPdr: simNao(
                  campo(l, 'PDR forneceu dados do acumulado da safra?'),
                ),
                origem: 'PDR',
                valores: acumuladoValores,
              },
              // Dia Anterior = bloco A, por tecnologia, quando o PDR informou
              diaAnterior: diaAnteriorDaPlanilha(l, cod, data),
              procedimentos: [],
              historico: [],
              cargas,
              ocorrencias: [],
              mensagens: [],
              errosLiberados: [],
              logAlteracoes: [],
            },
    }
  })
}

/** agrupa as cargas válidas por visita, para o casamento pelo código */
export function agruparCargas(importadas: CargaImportada[]): Map<number, Carga[]> {
  const mapa = new Map<number, Carga[]>()
  for (const c of importadas) {
    if (!c.carga) continue
    mapa.set(c.codVisita, [...(mapa.get(c.codVisita) ?? []), c.carga])
  }
  return mapa
}
