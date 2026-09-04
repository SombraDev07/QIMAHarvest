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
  | 'dia-anterior'
  | 'cargas'
  | 'divergencias'
  | 'nao-acompanhadas'
  | 'ocorrencias'
  | 'resumo'

/** teto de peso líquido aceito numa carga, tanto no formulário quanto na importação */
export const PESO_LIQUIDO_MAX = 120_000

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
  /** caminho no bucket `evidencias` — o que o banco grava; fotoUrl é a URL de exibição */
  fotoPath?: string
  /** analista marcou a conferência da foto (depois de validar com a IA) */
  fotoConferidaPor?: string
  fotoConferidaEm?: number
  /** tecnologia (trait) da semente foi testada em laboratório */
  tecnologiaTestada?: boolean
  /** campos que o analista marcou como não informados — trava o input e, nos pesos, vale 0 */
  naoInformado?: Partial<Record<CampoCargaNaoInformado, boolean>>
}

export type CampoCargaNaoInformado =
  | 'placa'
  | 'romaneio'
  | 'produtor'
  | 'cpfCnpjProdutor'
  | 'pesoLiquido'
  | 'pesoComDesconto'

export const campoNaoInformado = (
  c: Carga,
  campo: CampoCargaNaoInformado,
): boolean => Boolean(c.naoInformado?.[campo])

/**
 * Volume líquido: usa o peso com desconto quando ele existe. Zero, vazio ou
 * "não informado" cai no peso do romaneio (sem desconto).
 */
export function pesoVolumeLiquido(c: Carga): number {
  if (!campoNaoInformado(c, 'pesoComDesconto') && c.pesoComDesconto > 0) return c.pesoComDesconto
  if (campoNaoInformado(c, 'pesoLiquido')) return 0
  return c.pesoLiquido > 0 ? c.pesoLiquido : 0
}

/** Bloco 2 — Dados da Visita */
export interface DadosVisita {
  /** 2.1 — travado em "Sim" quando existem cargas lançadas */
  visitaIniciada: SimNao
  /** 2.2 — Sim só com carga acompanhada; não acompanhada não é recebimento */
  recebimentoCargas: SimNao
  realizouTestes: SimNao
  houveReteste: SimNao
  retesteSolicitante: string
  retesteMotivo: string
  houveOcorrencia: SimNao
  /** número da caixa de fita teste — faixa definida em Administração → Parâmetros */
  caixaFitaTeste: number
  /** o PDR guarda as fitas testadas de forma associável às cargas? */
  fitasAssociaveisCargas: SimNao
}

/** quem deve tratar o alerta — usado para decidir a fila de correção */
export type Responsavel = 'analista' | 'operacao'

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

/** garimpo depois da certificação — não mexe na situação da visita */
export interface AnaliseFinal {
  por: string
  ts: number
  obs: string
}

export const TIPO_OCORRENCIA_FITAS = 'Fitas não associáveis às cargas'

/** import em massa que reabriu a visita na Central */
export interface AvisoImport {
  por: string
  ts: number
  arquivos: string[]
  alertaIds: string[]
}

export interface LogAlteracao {
  id: string
  ts: number
  por: string
  origem: 'import-correcao' | 'edicao'
  /** nome do arquivo no import; "tela" quando a alteração veio do formulário */
  planilha: string
  tipo: 'carga' | 'dia-anterior' | 'acumulado'
  chave: string
  resumo: string
}

export const CAIXA_FITA_MIN = 1
export const CAIXA_FITA_MAX = 100

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

/**
 * Bloco 3.2 — acumulado do dia anterior. Ao contrário do histórico, que chega
 * consolidado da base (PDR/RTV/B2B), este é lançado à mão pelo auditor durante
 * a visita, e por isso não tem origem.
 */
export interface DiaAnterior {
  id: string
  /** dd/mm/aaaa — herdada da visita (a véspera), não digitada */
  data: string
  /** "Não" é o padrão: a visita já nasce com o registro, zerado e travado */
  informouDiaAnterior: SimNao
  valores: Record<Classificacao, number>
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
  /**
   * Quantas vezes a visita já passou pela Central de Correção. Começa em 1 e
   * só sobe quando a Operação devolve. É o que separa a 1ª da 2ª passagem no
   * fluxo — sem isso, os cards da 2ª repetiam a contagem da 1ª.
   */
  rodada: number
  consultor: string
  lider: string
  liderFocal: string
  supervisor: string
  tipoVisita: 'PRESENCIAL' | 'REMOTA'
  modalidade: '1H' | '2H' | '4H' | '8H'
  horaInicio: string
  horaFim: string
  duracao: string
  primeiraVisita: boolean
  pdrMista: boolean
  cincoEstrelas: boolean
  dadosVisita: DadosVisita
  acumulado: Acumulado
  /** lançamentos manuais do acumulado da véspera */
  diaAnterior: DiaAnterior[]
  procedimentos: Procedimento[]
  historico: RecebimentoMes[]
  cargas: Carga[]
  ocorrencias: Ocorrencia[]
  mensagens: Mensagem[]
  errosLiberados: ErroLiberado[]
  ultimaValidacao?: Validacao
  /** conferência posterior — a visita continua certificada */
  analiseFinal?: AnaliseFinal
  motivo?: string
  /**
   * Correção em lote que gerou erro: a análise mostra "(Avisa Import)" na
   * frente dos alertas listados aqui, até o analista corrigir aquele ponto.
   */
  avisoImport?: AvisoImport
  /** quem alterou o quê — import em massa e registros de sistema */
  logAlteracoes: LogAlteracao[]
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

/** cadastro fora de operação continua na base, mas não deve ser usado em coisa nova */
export type SituacaoCadastro = 'Ativo' | 'Inativo'

export const SITUACOES_CADASTRO: SituacaoCadastro[] = ['Ativo', 'Inativo']

/** mantido pelo nome antigo onde já era usado para PDR */
export type SituacaoPdr = SituacaoCadastro
export const SITUACOES_PDR = SITUACOES_CADASTRO

/* ================================================================= *
 * Usuários e perfis de acesso
 * ================================================================= */
export const PERFIS = [
  'Admin',
  'Support',
  'Information Analyst',
  'Coordinator',
  'Supervisor',
  'Strategic Leader',
  'Operational Leader',
  'Auditor',
  'Regional GR (Client)',
  'RTV (Client)',
  'Bayer SP (Client)',
  'Operational Monitor',
] as const

export type Perfil = (typeof PERFIS)[number]

/**
 * Quem pode alterar os dados de dentro da visita. Os demais perfis abrem a
 * visita normalmente e continuam podendo conversar no chat — o bloqueio é
 * sobre o dado auditado, não sobre o acompanhamento.
 */
export const PERFIS_EDITAM_VISITA: readonly Perfil[] = [
  'Admin',
  'Strategic Leader',
  'Operational Leader',
  'Information Analyst',
]

export const podeEditarVisita = (perfil: Perfil): boolean =>
  PERFIS_EDITAM_VISITA.includes(perfil)

/** Admin e Information Analyst reabrem visita certificada para correção */
export const podeReabrirVisita = (perfil: Perfil): boolean =>
  perfil === 'Admin' || perfil === 'Information Analyst'

/** observação de uma etapa da ocorrência de campo */
export type CampoObsOcorrencia = 'obsAnalista' | 'obsLider' | 'obsRtv'

/**
 * Quem edita cada etapa da observação de campo. Admin entra em todas;
 * analista só na revisão da Central; líder só na dele; RTV só no parecer.
 */
export function podeEditarObsOcorrencia(perfil: Perfil, campo: CampoObsOcorrencia): boolean {
  if (perfil === 'Admin') return true
  if (campo === 'obsAnalista') return perfil === 'Information Analyst'
  if (campo === 'obsLider') return perfil === 'Operational Leader' || perfil === 'Strategic Leader'
  return perfil === 'RTV (Client)'
}

export const ehPerfilRtv = (perfil: Perfil): boolean => perfil === 'RTV (Client)'

export function rotaInicial(perfil: Perfil): string {
  return ehPerfilRtv(perfil) ? '/ocorrencias' : '/visitas'
}

/** o RTV só entra em Ocorrências — qualquer outra rota cai na home dele */
export function rotaPermitida(perfil: Perfil, pathname: string): boolean {
  if (!ehPerfilRtv(perfil)) return true
  return pathname === '/ocorrencias' || pathname.startsWith('/ocorrencia/')
}

export function papelConversaOcorrencia(perfil: Perfil): string {
  if (perfil === 'RTV (Client)') return 'RTV'
  if (perfil === 'Information Analyst') return 'Analista'
  if (perfil === 'Operational Leader' || perfil === 'Strategic Leader') return 'Líder'
  return perfil
}

export interface Usuario {
  id: string
  nome: string
  /** identificador de acesso — é por ele que a pessoa entra no sistema */
  login: string
  /**
   * Definida pelo Admin. Guardada em texto puro porque ainda não existe
   * back-end: quando houver, a senha some daqui e passa a ser um hash
   * calculado no servidor, nunca trafegado nem gravado no navegador.
   */
  senha?: string
  /** contato, todos opcionais */
  email?: string
  telefone?: string
  cpf?: string
  perfil: Perfil
  situacao: SituacaoCadastro
}

/** tamanho mínimo exigido quando o Admin define uma senha */
export const SENHA_MIN = 6

/** só o Admin mexe em login e senha dos outros */
export const podeDefinirCredenciais = (perfil: Perfil): boolean => perfil === 'Admin'

/** Registro do catálogo de PDRs cadastrados */
export interface PdrCatalogo {
  /**
   * Identificador interno e imutável do cadastro. Existe porque o CPF/CNPJ não
   * serve de chave: a mesma inscrição aparece em unidades diferentes, e um
   * documento digitado errado precisa poder ser corrigido sem soltar o
   * histórico já vinculado à unidade.
   */
  id: string
  nome: string
  /** aceita CPF (produtor pessoa física) ou CNPJ */
  cnpj: string
  cidade: string
  uf: string
  situacao: SituacaoCadastro
  /** coordenadas como digitadas, em grau decimal — vazio quando não informadas */
  latitude?: string
  longitude?: string
  telefone?: string
  email?: string
  /**
   * Recado da unidade. Aparece em toda visita vinculada a este cadastro, para
   * o auditor não precisar descobrir de novo o que já se sabe do ponto.
   */
  observacao?: string
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
  /** signed URL do Storage, ou blob: enquanto o envio não termina */
  url: string
  /** caminho no bucket `anexos` — o histórico permanente */
  path?: string
  /** ainda não subiu; some depois do envio e não entra no JSON */
  arquivo?: File
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

/* ================================================================= *
 * Parâmetros — regras de análise da visita configuráveis pela
 * Administração, e a mensagem padrão usada em "Enviar erros ao chat"
 * ================================================================= */
export interface ParametrosRegras {
  /** % de desconto acima do qual a carga é considerada erro */
  limiteDescontoErro: number
  /** quantidade mínima de caracteres para uma placa ser válida */
  minDigitosPlaca: number
  /** salto tolerado entre romaneios consecutivos da mesma visita */
  saltoMaxRomaneio: number
  /** teto por tecnologia num lançamento de Dia Anterior */
  limiteDiaAnteriorTecnologia: number
  /** minutos tolerados antes do início e depois do fim da janela da visita */
  toleranciaHorarioMin: number
  /** faixa válida do número da caixa de fita teste */
  caixaFitaMin: number
  caixaFitaMax: number
  /**
   * mensagem padrão enviada ao chat da visita ao clicar em "Enviar erros
   * ao chat" — aceita o placeholder {quantidade}
   */
  mensagemErroChat: string
  /** liga/desliga cada regra do catálogo (chave = código, ex. "3.4.7") — ausente/true = ativa */
  regrasAtivas: Record<string, boolean>
  /**
   * Análise de Fotos — Gemini Flash-Lite é o padrão. `desligado` cai no .env
   * (VITE_VISION_*). A chave não vai para o git; fica no banco ou no .env.local.
   */
  visaoProvedor: VisaoProvedor
  visaoChave: string
  visaoModelo: string
  /** URL POST do conector próprio (provedor webhook) */
  visaoEndpoint: string
  /** vazio = usa o prompt padrão do código */
  visaoPrompt: string
}

export type VisaoProvedor = 'desligado' | 'gemini' | 'openai' | 'webhook'

/* ================================================================= *
 * Ocorrências de campo — fluxo de tratamento das ocorrências abertas
 * pelo tablet em campo (COD próprio, vinculadas a uma visita e, às
 * vezes, a um romaneio), com quadro por status, chat e observações
 * separadas por etapa. Não confundir com `Ocorrencia` acima: aquele é
 * o registro simples já existente na aba 6 da visita (tipo/gravidade
 * ligados a uma carga); este é o processo maior, com COD, fila e
 * tratamento próprios.
 * ================================================================= */
export type StatusOcorrenciaCampo =
  | 'pendente-central'
  | 'operacao-pendente'
  | 'rtv-pendente'
  | 'finalizada'
  | 'cancelada'

export interface SituacaoOcorrenciaCampo {
  id: StatusOcorrenciaCampo
  label: string
  short: string
  color: string
  descricao: string
}

/** classificação "To Be" definida pela área de compliance para cada categoria */
export type ClassificacaoOcorrenciaCampo =
  | 'Observação'
  | 'Ponto de Atenção'
  | 'Erro Processual'
  | 'Grave'
  | 'Ponto de atenção/Grave'

export interface CategoriaOcorrenciaCampo {
  tipo: string
  classificacao: ClassificacaoOcorrenciaCampo
}

/** observação de uma etapa — guarda quem escreveu e quando, não só o texto */
export interface ObservacaoOcorrencia {
  texto: string
  por: string
  ts: number
}

/** uma linha do histórico/atividade da ocorrência — criação, mudança de status, observação salva... */
export interface EventoOcorrencia {
  id: string
  ts: number
  por: string
  /** perfil de quem fez, ex.: Information Analyst */
  papel?: string
  /** etapa do fluxo, ex.: Analista */
  etapa?: string
  /** verbo curto da tabela de histórico, ex.: Salvou revisão */
  acao?: string
  descricao: string
}

export interface OcorrenciaCampo {
  id: string
  /** número curto exibido no card e no detalhe — o COD da ocorrência, ex.: #8004 */
  numero: number
  /** COD da visita à qual a ocorrência está vinculada */
  visitaCod: number
  /** romaneio da carga relacionada, quando existir */
  romaneio?: string
  /** categoria — chave em CATEGORIAS_OCORRENCIA_CAMPO */
  categoria: string
  status: StatusOcorrenciaCampo
  /**
   * quantas vezes já passou pela Central. Começa em 1 e sobe quando a
   * Operação devolve — mesmo mecanismo do campo `rodada` de Visita.
   */
  rodada: number
  /** quando a ocorrência foi registrada em campo pelo tablet */
  dataHora: number
  /** observação original da ocorrência, vinda do tablet */
  obsOcorrencia: string
  /** observação de quem padroniza/trata a ocorrência na Central */
  obsAnalista?: ObservacaoOcorrencia
  obsLider?: ObservacaoOcorrencia
  obsRtv?: ObservacaoOcorrencia
  /**
   * nome do RTV vinculado à ocorrência. Hoje é texto livre: a Visita
   * ainda não tem esse papel cadastrado como consultor/líder/supervisor têm.
   */
  rtv?: string
  /** motivo do cancelamento */
  motivo?: string
  mensagens: Mensagem[]
  /** linha do tempo da ocorrência — criação, transições de status, observações salvas */
  historico: EventoOcorrencia[]
  /** evidências da ocorrência (fotos do tablet, laudos, etc.) */
  anexos: AnexoArquivo[]
  criadoEm: number
  atualizadoEm: number
}

export const STATUS_FILA_RTV: readonly StatusOcorrenciaCampo[] = ['rtv-pendente', 'finalizada']

function mencionaRtv(valor?: string): boolean {
  return (valor ?? '').toLowerCase().includes('rtv')
}

/** passou pela etapa do RTV — parecer, nome vinculado, histórico ou chat */
export function ocorrenciaTeveRtv(o: OcorrenciaCampo): boolean {
  if (o.status === 'rtv-pendente') return true
  if (o.obsRtv) return true
  if (o.rtv?.trim()) return true
  if ((o.historico ?? []).some((e) => mencionaRtv(e.etapa) || mencionaRtv(e.papel))) return true
  return (o.mensagens ?? []).some((m) => mencionaRtv(m.papel))
}

/** fila do RTV: pendentes com ele + finalizadas que de fato passaram pelo RTV */
export function ocorrenciaVisivelParaRtv(o: OcorrenciaCampo): boolean {
  if (o.status === 'rtv-pendente') return true
  return o.status === 'finalizada' && ocorrenciaTeveRtv(o)
}

export function mensagemVisivelParaRtv(m: Pick<Mensagem, 'papel'>): boolean {
  const p = (m.papel ?? '').toLowerCase()
  return p.includes('analista') || p.includes('information analyst') || p.includes('rtv')
}

export function eventoVisivelParaRtv(e: Pick<EventoOcorrencia, 'etapa' | 'papel'>): boolean {
  const t = `${e.etapa ?? ''} ${e.papel ?? ''}`.toLowerCase()
  return t.includes('analista') || t.includes('information analyst') || t.includes('rtv')
}
