/**
 * Relatórios em planilha — a via de saída do mesmo formato que a importação lê.
 * Os cabeçalhos são os da planilha de campo de propósito: o arquivo exportado
 * volta para o sistema pelo importador sem tradução no meio, e o teste de ida e
 * volta prova isso.
 *
 * O que não existe no modelo sai em branco em vez de ser inventado — coluna
 * vazia é honesta, número chutado não.
 */
import { CLASSIFICACOES, type Carga, type Classificacao, type Visita } from '../types'
import { situacaoPorId } from '../data/mock'

type Coluna<T> = { cabecalho: string; valor: (item: T) => string | number }

const SEPARADOR = ';'

/** dd/mm/aaaa → semana ISO, que a planilha de campo traz na coluna "Semana" */
function semanaIso(data: string): number | '' {
  const [d, m, a] = data.split('/').map(Number)
  if (!d || !m || !a) return ''
  const dt = new Date(a, m - 1, d)
  // quinta-feira da mesma semana define o ano ISO
  const quinta = new Date(dt)
  quinta.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7))
  const primeira = new Date(quinta.getFullYear(), 0, 4)
  return 1 + Math.round(((quinta.getTime() - primeira.getTime()) / 86400000 - 3) / 7)
}

const somaPorClassificacao = (cargas: Carga[], c: Classificacao) =>
  cargas.filter((x) => x.classificacao === c).reduce((s, x) => s + x.pesoLiquido, 0)

const contaPorClassificacao = (cargas: Carga[], c: Classificacao) =>
  cargas.filter((x) => x.classificacao === c).length

/** sem participante: o bloco da planilha separa o participante do resto */
const semParticipante = (cargas: Carga[]) => cargas.filter((c) => c.classificacao !== 'Participante')

export const COLUNAS_VISITA: Coluna<Visita>[] = [
  { cabecalho: 'Visit ID', valor: (v) => v.cod },
  { cabecalho: 'Regional PDR', valor: (v) => v.pdr.regiao },
  { cabecalho: 'Distritor PDR', valor: (v) => v.pdr.distrito },
  // a UF volta como sigla; o importador aceita sigla e nome por extenso
  { cabecalho: 'Estado PDR', valor: (v) => v.pdr.uf },
  { cabecalho: 'Cidade PDR', valor: (v) => v.pdr.cidade },
  { cabecalho: 'Nome PDR', valor: (v) => v.pdr.nome },
  { cabecalho: 'CNPJ PDR', valor: (v) => v.pdr.cnpj },
  { cabecalho: 'Líder', valor: (v) => v.lider },
  { cabecalho: 'Inspetor', valor: (v) => v.consultor },
  { cabecalho: 'Semana', valor: (v) => semanaIso(v.data) },
  { cabecalho: 'Modulo', valor: (v) => v.modalidade },
  { cabecalho: 'Data Visita', valor: (v) => v.data },
  { cabecalho: 'Entrada', valor: (v) => v.horaInicio },
  { cabecalho: 'Saída', valor: (v) => v.horaFim },
  { cabecalho: 'Houve recebimento de soja?', valor: (v) => v.dadosVisita.recebimentoCargas },
  {
    cabecalho: 'Testes executados em conformidade?',
    valor: (v) => v.dadosVisita.realizouTestes,
  },
  {
    cabecalho: 'Armazenamento correto de fitas teste?',
    valor: (v) => v.dadosVisita.fitasAssociaveisCargas,
  },
  { cabecalho: 'Houve solicitação de reteste?', valor: (v) => v.dadosVisita.houveReteste },
  // o sistema não guarda divergência de reteste, só solicitante e motivo
  { cabecalho: 'Houve divergência no reteste?', valor: () => '' },
  {
    cabecalho: 'Número de caixas de fita teste disponíveis',
    valor: (v) => v.dadosVisita.caixaFitaTeste,
  },
  {
    cabecalho: 'PDR forneceu dados do dia anterior?',
    valor: (v) => (v.diaAnterior.some((d) => d.informouDiaAnterior === 'Sim') ? 'Sim' : 'Não'),
  },
  {
    cabecalho: 'PDR forneceu dados do acumulado da safra?',
    valor: (v) => v.acumulado.informadoPeloPdr,
  },

  /* Bloco A — o movimento do dia, somado das cargas da própria visita */
  {
    cabecalho: 'A: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg)',
    valor: (v) => semParticipante(v.cargas).reduce((s, c) => s + c.pesoLiquido, 0),
  },
  { cabecalho: 'A: VOLUME TESTADA NEGATIVA (Kg)', valor: (v) => somaPorClassificacao(v.cargas, 'Negativa') },
  { cabecalho: 'A: VOLUME DECLARADA (Kg)', valor: (v) => somaPorClassificacao(v.cargas, 'Declarada') },
  { cabecalho: 'A: VOLUME TESTADA POSITVA (Kg)', valor: (v) => somaPorClassificacao(v.cargas, 'Positiva') },
  {
    cabecalho: 'A: VOLUME PARTICIPANTES (Kg)',
    valor: (v) => somaPorClassificacao(v.cargas, 'Participante'),
  },

  /* Bloco B — o acumulado da safra, que é o que o sistema guarda */
  {
    cabecalho: 'B: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg)',
    valor: (v) => v.acumulado.valores.Negativa + v.acumulado.valores.Positiva,
  },
  {
    cabecalho: 'B: VOLUME BIOTECNOLOGIA PATENTE INVALIDA',
    valor: (v) => v.acumulado.valores.Negativa,
  },
  {
    cabecalho: 'B: VOLUME BIOTECNOLOGIA PATENTE VALIDA',
    valor: (v) => v.acumulado.valores.Positiva,
  },
  { cabecalho: 'B: VOLUME PARTICIPANTES', valor: (v) => v.acumulado.valores.Participante },

  /* Bloco C — recorte que nunca foi definido; sai vazio */
  { cabecalho: 'C: VOLUME TOTAL RECEBIDO SEM PARTICIPANTE (Kg)', valor: () => '' },
  { cabecalho: 'C: VOLUME BIOTECNOLOGIA PATENTE VALIDA', valor: () => '' },
  { cabecalho: 'C: VOLUME TOTAL TESTADO NEGATIVO (Kg)', valor: () => '' },
  { cabecalho: 'C: VOLUME PARTICIPANTES (Kg)', valor: () => '' },

  /* Bloco E — contagem de cargas, contada das cargas da visita */
  {
    cabecalho: 'E: Nº TOTAL DE CARGAS RECEBIDAS SEM PARTICIPANTE',
    valor: (v) => semParticipante(v.cargas).length,
  },
  { cabecalho: 'E: Nº CARGAS TESTADA NEGATIVA', valor: (v) => contaPorClassificacao(v.cargas, 'Negativa') },
  { cabecalho: 'E: Nº CARGAS TOTAL DECLARADA', valor: (v) => contaPorClassificacao(v.cargas, 'Declarada') },
  { cabecalho: 'E: Nº CARGAS TESTADA POSITIVA', valor: (v) => contaPorClassificacao(v.cargas, 'Positiva') },
  {
    cabecalho: 'E: Nº CARGAS PARTICIPANTES',
    valor: (v) => contaPorClassificacao(v.cargas, 'Participante'),
  },

  { cabecalho: 'HORAS', valor: (v) => Number(v.modalidade.replace(/\D/g, '')) || '' },
  { cabecalho: 'Tipo Visita', valor: (v) => (v.tipoVisita === 'REMOTA' ? 'Remote' : 'On-Site') },
  { cabecalho: 'Nome responsável acompanhamento', valor: (v) => v.pdr.responsavel },
  // aqui sai a fila do sistema, e não o status de origem: é a informação útil
  { cabecalho: 'Situação', valor: (v) => situacaoPorId(v.situacao).label },
  { cabecalho: 'Rodada', valor: (v) => v.rodada },
  { cabecalho: 'Ocorrencias', valor: (v) => v.dadosVisita.houveOcorrencia },
]

/** a carga não guarda a visita; o relatório precisa dos dois juntos */
type CargaDaVisita = { visita: Visita; carga: Carga }

export const COLUNAS_CARGA: Coluna<CargaDaVisita>[] = [
  { cabecalho: 'ID Visita', valor: ({ visita }) => visita.cod },
  { cabecalho: 'Regional PDR', valor: ({ visita }) => visita.pdr.regiao },
  { cabecalho: 'Distrito PDR', valor: ({ visita }) => visita.pdr.distrito },
  { cabecalho: 'Estado PDR', valor: ({ visita }) => visita.pdr.uf },
  { cabecalho: 'Cidade PDR', valor: ({ visita }) => visita.pdr.cidade },
  { cabecalho: 'Nome PDR', valor: ({ visita }) => visita.pdr.nome },
  { cabecalho: 'CNPJ PDR', valor: ({ visita }) => visita.pdr.cnpj },
  { cabecalho: 'Data', valor: ({ carga }) => carga.data },
  { cabecalho: 'Hora', valor: ({ carga }) => carga.hora },
  // o sistema guarda o número do documento, não o tipo; romaneio é o único em uso
  { cabecalho: 'Tipo Documento', valor: () => 'ROMANEIO' },
  { cabecalho: 'Numero Documento', valor: ({ carga }) => carga.romaneio },
  { cabecalho: 'Peso Líquido', valor: ({ carga }) => carga.pesoLiquido },
  { cabecalho: 'Peso Líquido com Desconto', valor: ({ carga }) => carga.pesoComDesconto },
  { cabecalho: 'Teste Resultado Monitorado', valor: ({ carga }) => carga.classificacao },
  { cabecalho: 'Produtor Nome', valor: ({ carga }) => carga.produtor },
  { cabecalho: 'Produtor CPF/CNPJ', valor: ({ carga }) => carga.cpfCnpjProdutor },
  { cabecalho: 'Placa Caminhão', valor: ({ carga }) => carga.placa },
  { cabecalho: 'Carga Acompanhada', valor: ({ carga }) => (carga.acompanhada ? 'Sim' : 'Não') },
  { cabecalho: 'RATEIO', valor: ({ carga }) => (carga.rateio ? 'SIM' : 'NAO') },
  { cabecalho: 'Grupo Rateio', valor: ({ carga }) => carga.grupoRateio ?? '' },
  { cabecalho: 'ID Carga', valor: ({ carga }) => carga.id },
]

/**
 * Escapa o campo só quando precisa. O separador é `;`, então valor com `;`,
 * aspas ou quebra de linha vai entre aspas — senão a coluna se parte e o
 * arquivo volta torto na reimportação.
 */
function campoCsv(valor: string | number): string {
  const s = String(valor ?? '')
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function montarCsv<T>(colunas: Coluna<T>[], itens: T[]): string {
  const linhas = [colunas.map((c) => c.cabecalho).join(SEPARADOR)]
  for (const item of itens) {
    linhas.push(colunas.map((c) => campoCsv(c.valor(item))).join(SEPARADOR))
  }
  return linhas.join('\r\n')
}

/** CSV a partir de objetos cujas chaves são os cabeçalhos (relatório montado no Postgres) */
export function montarCsvDeObjetos(
  cabecalhos: string[],
  linhas: Record<string, unknown>[],
  comCabecalho = true,
): string {
  const corpo = linhas.map((l) =>
    cabecalhos.map((c) => campoCsv((l[c] as string | number | null | undefined) ?? '')).join(SEPARADOR),
  )
  return (comCabecalho ? [cabecalhos.join(SEPARADOR), ...corpo] : corpo).join('\r\n')
}

export const cabecalhosVisita = COLUNAS_VISITA.map((c) => c.cabecalho)
export const cabecalhosCarga = COLUNAS_CARGA.map((c) => c.cabecalho)

export const relatorioVisitas = (visitas: Visita[]): string =>
  montarCsv(COLUNAS_VISITA, visitas)

export const relatorioCargas = (visitas: Visita[]): string =>
  montarCsv(
    COLUNAS_CARGA,
    visitas.flatMap((visita) => visita.cargas.map((carga) => ({ visita, carga }))),
  )

/** resumo para a tela mostrar o tamanho antes de baixar */
export function resumoRelatorio(visitas: Visita[]) {
  const cargas = visitas.reduce((s, v) => s + v.cargas.length, 0)
  const porClassificacao = CLASSIFICACOES.map((c) => ({
    classificacao: c,
    cargas: visitas.reduce((s, v) => s + contaPorClassificacao(v.cargas, c), 0),
  }))
  return { visitas: visitas.length, cargas, porClassificacao }
}
