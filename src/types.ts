export type SituacaoId =
  | 'central-correcao'
  | 'operacao-correcao'
  | 'certificada'
  | 'cancelada'

export interface Situacao {
  id: SituacaoId
  label: string
  short: string
  color: string
  descricao: string
}

export type SimNao = 'Sim' | 'Não'

/** abas da tela de detalhe da visita */
export type AbaVisita =
  | 'analise'
  | 'unidade'
  | 'visita'
  | 'acumulado'
  | 'cargas'
  | 'divergencias'
  | 'nao-acompanhadas'
  | 'ocorrencias'
  | 'resumo'

/** Classificações usadas no acompanhamento e no acumulado */
export type Classificacao = 'Negativa' | 'Declarada' | 'Positiva' | 'Participante'

export const CLASSIFICACOES: Classificacao[] = [
  'Negativa',
  'Declarada',
  'Positiva',
  'Participante',
]

export interface Pdr {
  nome: string
  cnpj: string
  cidade: string
  uf: string
  regiao: string
  distrito: string
  endereco: string
  telefone: string
  responsavel: string
  capacidadeEstatica: number
  tipoUnidade: 'ARMAZÉM' | 'COOPERATIVA' | 'ESMAGADORA' | 'TERMINAL'
}

export interface Carga {
  id: string
  data: string
  hora: string
  placa: string
  produtor: string
  cpfCnpjProdutor: string
  romaneio: string
  /** peso líquido do romaneio, em kg */
  pesoLiquido: number
  /** peso após descontos de impureza/umidade, em kg */
  pesoComDesconto: number
  classificacao: Classificacao
  rateio: boolean
  /** identificador do grupo quando a carga é rateada */
  grupoRateio?: string
  observacao?: string
  /** false = carga não acompanhada pelo consultor */
  acompanhada: boolean
  /** evidência fotográfica da carga (placa/romaneio), quando enviada pelo tablet */
  fotoUrl?: string
}

/** Bloco 2 — Dados da Visita */
export interface DadosVisita {
  /** 2.1 — travado em "Sim" quando existem cargas lançadas */
  visitaIniciada: SimNao
  /** 2.2 */
  recebimentoCargas: SimNao
  realizouTestes: SimNao
  houveReteste: SimNao
  retesteSolicitante: string
  retesteMotivo: string
  houveOcorrencia: SimNao
  /** número da caixa de fita teste — 0 a 300 */
  caixaFitaTeste: number
}

/** mensagem da conversa entre os analistas sobre a visita */
export interface Mensagem {
  id: string
  autor: string
  papel: string
  texto: string
  /** epoch ms — ordenação cronológica */
  ts: number
  tipo: 'mensagem' | 'sistema'
  /** membro da equipe apontado como responsável pelo problema */
  responsavel?: string
}

/** erro que o analista liberou manualmente para permitir a certificação */
export interface ErroLiberado {
  alertaId: string
  regra: string
  justificativa: string
  por: string
  ts: number
}

export interface Validacao {
  por: string
  ts: number
  erros: number
  atencoes: number
}

export const CAIXA_FITA_MIN = 0
export const CAIXA_FITA_MAX = 300

/** Origem do acumulado registrado para a unidade */
export type OrigemAcumulado = 'PDR' | 'RTV' | 'B2B'

export const ORIGENS_ACUMULADO: OrigemAcumulado[] = ['PDR', 'RTV', 'B2B']

/** Bloco 3 — Histórico de Acumulado */
export interface Acumulado {
  /** 3.1 */
  informadoPeloPdr: SimNao
  /** só a origem PDR permite digitação; RTV e B2B chegam prontos da base */
  origem: OrigemAcumulado
  valores: Record<Classificacao, number>
}

export interface AcumuladoPeriodo {
  /** dd/mm/aaaa no histórico diário, mmm/aaaa no mensal */
  periodo: string
  origem: OrigemAcumulado
  negativa: number
  declarada: number
  positiva: number
  participante: number
  cargas: number
  visitas: number
}

export interface HistoricoAcumulado {
  dias: AcumuladoPeriodo[]
  meses: AcumuladoPeriodo[]
}

export interface Procedimento {
  item: string
  resposta: 'Sim' | 'Não' | 'N/A'
  obs?: string
}

export interface RecebimentoMes {
  mes: string
  toneladas: number
  fornecedores: number
  cargas: number
}

export interface Ocorrencia {
  id: string
  tipo: string
  gravidade: 'Baixa' | 'Média' | 'Alta'
  descricao: string
  data: string
  status: 'Aberta' | 'Em análise' | 'Resolvida'
  /** carga que originou a ocorrência, quando aplicável */
  cargaId?: string
}

export interface Visita {
  cod: number
  data: string
  envioTablet: string
  pdr: Pdr
  numeroVisitas: number
  situacao: SituacaoId
  consultor: string
  lider: string
  liderFocal: string
  supervisor: string
  tipoVisita: 'PRESENCIAL' | 'REMOTA'
  modalidade: '1H' | '2H' | '4H'
  horaInicio: string
  horaFim: string
  duracao: string
  primeiraVisita: boolean
  pdrMista: boolean
  cincoEstrelas: boolean
  dadosVisita: DadosVisita
  acumulado: Acumulado
  procedimentos: Procedimento[]
  historico: RecebimentoMes[]
  cargas: Carga[]
  ocorrencias: Ocorrencia[]
  mensagens: Mensagem[]
  errosLiberados: ErroLiberado[]
  ultimaValidacao?: Validacao
  motivo?: string
}

export interface GrupoRateio {
  id: string
  cargas: Carga[]
  /** soma dos pesos líquidos de romaneio do grupo */
  pesoLiquidoTotal: number
  /** soma dos pesos já descontados do grupo */
  pesoComDescontoTotal: number
  /** data, hora, placa e classificação são herdadas por todas as cargas do grupo */
  data: string
  hora: string
  placa: string
  classificacao: Classificacao
}

/** Registro do catálogo de PDRs cadastrados */
export interface PdrCatalogo {
  nome: string
  cnpj: string
  cidade: string
  uf: string
}

/** Linha importada da planilha de acumulado */
export interface AcumuladoImportado {
  nomePdr: string
  cnpj: string
  uf: string
  municipio: string
  dtLancamento: string
  kgNegativa: number
  kgDeclarada: number
  kgPositiva: number
  kgParticipante: number
}

/** categoria de severidade de uma linha importada de acumulado */
export type SeveridadeAcumulado = 'sucesso' | 'alerta' | 'vermelho'

/** um item já gravado no sistema a partir da importação de acumulado */
export interface DetalheAcumuladoImportado {
  item: AcumuladoImportado
  cod: number
  motivo: string
  /** true = criou uma visita nova (fake) no sistema; false = atualizou uma existente */
  criouRegistro: boolean
}

/** relatório de uma importação de acumulado, guardado para consulta posterior */
export interface RelatorioAcumulado {
  id: string
  ts: number
  nomeArquivo: string
  /** quem executou a importação */
  importadoPor: string
  sucesso: DetalheAcumuladoImportado[]
  alerta: DetalheAcumuladoImportado[]
  vermelho: DetalheAcumuladoImportado[]
}

/* ================================================================= *
 * Solicitações — pedidos de exclusão de carga, inserção de dados e
 * acumulado, tratados em um quadro kanban com chat e anexos.
 * ================================================================= */
export type StatusSolicitacao = 'pendente' | 'analise' | 'feito'

export type TipoSolicitacao = 'exclusao-carga' | 'insercao-dados' | 'acumulado'

/** arquivo anexado a uma mensagem do chat da solicitação */
export interface AnexoArquivo {
  id: string
  nome: string
  /** em bytes */
  tamanho: number
  tipo: string
  /** URL local (object URL) — válida enquanto a aba estiver aberta */
  url: string
}

export interface MensagemSolicitacao {
  id: string
  autor: string
  texto: string
  ts: number
  anexos: AnexoArquivo[]
}

export interface Solicitacao {
  id: string
  /** número curto exibido no card, ex.: #1042 */
  numero: number
  tipo: TipoSolicitacao
  titulo: string
  descricao: string
  /** motivo da exclusão — usado no tipo "exclusao-carga" */
  motivo?: string
  /** código da visita relacionada, quando informado */
  visitaCod?: number
  /** id da carga relacionada, quando informado */
  cargaId?: string
  status: StatusSolicitacao
  solicitante: string
  /** pessoas anexadas ao chat, além do solicitante e de quem responde */
  participantes: string[]
  criadoEm: number
  atualizadoEm: number
  mensagens: MensagemSolicitacao[]
}
