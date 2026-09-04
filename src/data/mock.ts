import type {
  Acumulado,
  AcumuladoPeriodo,
  AnexoArquivo,
  Carga,
  CategoriaOcorrenciaCampo,
  Classificacao,
  ClassificacaoOcorrenciaCampo,
  DadosVisita,
  EventoOcorrencia,
  HistoricoAcumulado,
  Mensagem,
  Ocorrencia,
  OcorrenciaCampo,
  OrigemAcumulado,
  Pdr,
  PdrCatalogo,
  Procedimento,
  RecebimentoMes,
  Situacao,
  SituacaoId,
  SituacaoOcorrenciaCampo,
  Solicitacao,
  StatusOcorrenciaCampo,
  Usuario,
  Visita,
} from '../types'
import { CLASSIFICACOES, ORIGENS_ACUMULADO } from '../types'
import { mascaraProdutor } from '../format'
import { gerarFotoMock } from '../fotos/evidencia'

/* ------------------------------------------------------------------ *
 * PRNG determinístico — os dados fictícios precisam ser sempre iguais
 * entre recarregamentos, senão a navegação por código quebraria.
 * ------------------------------------------------------------------ */
function criarRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const rnd = criarRandom(20260804)
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min
const simNao = (chance = 0.5) => (rnd() < chance ? 'Sim' : 'Não') as 'Sim' | 'Não'

export const SITUACOES: Situacao[] = [
  {
    id: 'central-correcao',
    label: 'Central Correção',
    short: 'Central C.',
    color: '#c2410c',
    descricao: 'Aguardando correção da Central de Informações',
  },
  {
    id: 'operacao-correcao',
    label: 'Operação Correção',
    short: 'Operação C.',
    color: '#6d28d9',
    descricao: 'Devolvidas ao time de operação em campo',
  },
  {
    id: 'certificada',
    label: 'Certificada',
    short: 'Certificada',
    color: '#0e8f6c',
    descricao: 'Visitas auditadas e aprovadas',
  },
  {
    id: 'cancelada',
    label: 'Cancelada',
    short: 'Cancelada',
    color: '#5b6673',
    descricao: 'Visitas canceladas com justificativa',
  },
]

export const situacaoPorId = (id: SituacaoId): Situacao =>
  SITUACOES.find((s) => s.id === id) ?? SITUACOES[0]

export const CORES_CLASSIFICACAO: Record<Classificacao, string> = {
  Positiva: '#0e8f6c',
  Declarada: '#1d4ed8',
  Negativa: '#dc2626',
  Participante: '#6d28d9',
}

/* ------------------------------------------------------------------ *
 * Catálogos
 * ------------------------------------------------------------------ */
const CONSULTORES = [
  'Cesar A. F. de Souza',
  'Marina Toledo Prado',
  'Rafael Baldin Rizzi',
  'Juliana Kramer',
  'Anderson Bortoluzzi',
  'Patrícia Nogueira',
  'Diego Fontana',
  'Larissa Menezes',
]
const LIDERES = ['Cesar Monteiro', 'Helena Duarte', 'Marcos Vinicius Pires', 'Tatiane Rocha']
const LIDERES_FOCAIS = ['Clarissa Menegat', 'Otávio Lins', 'Bianca Serra']
const SUPERVISORES = ['Antônio Carvalho', 'Renata Vasques', 'Gustavo Peixoto']

const REGIOES = ['Sul', 'Centro-Oeste', 'Matopiba', 'Sudeste', 'Norte']

/** cada distrito carrega sua UF real para não gerar cidade/UF incoerente */
const DISTRITOS: Record<string, { nome: string; uf: string }[]> = {
  Sul: [
    { nome: 'Xanxerê', uf: 'SC' },
    { nome: 'Cascavel', uf: 'PR' },
    { nome: 'Passo Fundo', uf: 'RS' },
    { nome: 'Ponta Grossa', uf: 'PR' },
  ],
  'Centro-Oeste': [
    { nome: 'Sorriso', uf: 'MT' },
    { nome: 'Rondonópolis', uf: 'MT' },
    { nome: 'Rio Verde', uf: 'GO' },
    { nome: 'Chapadão do Sul', uf: 'MS' },
  ],
  Matopiba: [
    { nome: 'Luís Eduardo Magalhães', uf: 'BA' },
    { nome: 'Balsas', uf: 'MA' },
    { nome: 'Uruçuí', uf: 'PI' },
    { nome: 'Formosa do Rio Preto', uf: 'BA' },
  ],
  Sudeste: [
    { nome: 'Uberlândia', uf: 'MG' },
    { nome: 'Franca', uf: 'SP' },
    { nome: 'Paracatu', uf: 'MG' },
  ],
  Norte: [
    { nome: 'Santarém', uf: 'PA' },
    { nome: 'Paragominas', uf: 'PA' },
    { nome: 'Porto Velho', uf: 'RO' },
  ],
}

const PREFIXOS_PDR = [
  'SEMENTES CEREAIS',
  'COOPERALFA COOP AGROINDL',
  'AGRO TRADE GRAINS',
  'CEREALISTA VALE VERDE',
  'COOPERATIVA AGRÁRIA',
  'ARMAZÉNS GERAIS SANTA RITA',
  'GRÃOS DO PLANALTO',
  'TERMINAL GRANELEIRO NORTE',
  'BIANCHI COMÉRCIO DE GRÃOS',
  'AGROPECUÁRIA SÃO MIGUEL',
]
const SUFIXOS_PDR = ['LTDA', 'S/A', 'EIRELI', 'ME', 'COMÉRCIO LTDA']

const PRODUTORES = [
  'Guido Rizzi Baldin',
  'Trade Grains Ltda',
  'Maria de Fátima S. Toldo',
  'Fazenda Boa Esperança',
  'João Batista Prestes',
  'Agropecuária Céu Azul',
  'Irmãos Zanella',
  'Sítio Três Pinheiros',
  'Vicente Aparecido Nunes',
  'Fazenda Rio Claro',
]

const SOLICITANTES_RETESTE = [
  'Central de Informações',
  'Supervisor de campo',
  'Cliente / Trading',
  'Responsável da unidade',
]

const MOTIVOS_RETESTE = [
  'Resultado inconclusivo na primeira leitura.',
  'Divergência entre a fita e o laudo da unidade.',
  'Amostra contaminada durante a coleta.',
  'Solicitação do cliente para confirmação do lote.',
]

const PROCEDIMENTOS_BASE = [
  'A unidade possui procedimento formal de recebimento de soja?',
  'Foi apresentada a lista de fornecedores ativos na safra?',
  'O sistema de rastreabilidade estava disponível durante a visita?',
  'Existe segregação física entre soja participante e não participante?',
  'As balanças possuem aferição vigente do INMETRO?',
  'A unidade realiza conferência documental do produtor na portaria?',
  'Foram identificadas cargas sem nota fiscal vinculada?',
  'O responsável assinou o termo de acompanhamento?',
]

const TIPOS_OCORRENCIA = [
  'Divergência de peso acima do limite',
  'Carga sem romaneio vinculado',
  'Produtor não localizado na base',
  'Foto de placa ilegível',
  'Ausência do responsável da unidade',
  'Sistema da unidade indisponível',
]

const MESES = ['Jan/26', 'Fev/26', 'Mar/26', 'Abr/26', 'Mai/26', 'Jun/26', 'Jul/26', 'Ago/26']

/** data de referência do sistema (fixa para manter os dados determinísticos) */
export const HOJE = new Date(2026, 7, 4)

export const CORES_ORIGEM: Record<OrigemAcumulado, string> = {
  PDR: '#1d4ed8',
  RTV: '#0e8f6c',
  B2B: '#6d28d9',
}

/* ------------------------------------------------------------------ *
 * Geradores auxiliares
 * ------------------------------------------------------------------ */
const pad = (n: number, size = 2) => String(n).padStart(size, '0')

const gerarCnpj = () =>
  `${pad(int(10, 99))}.${pad(int(100, 999), 3)}.${pad(int(100, 999), 3)}/${pad(int(1, 9999), 4)}-${pad(int(0, 99))}`

const gerarCpf = () =>
  `${pad(int(100, 999), 3)}.${pad(int(100, 999), 3)}.${pad(int(100, 999), 3)}-${pad(int(10, 99))}`

function gerarPlaca(): string {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const L = () => letras[int(0, 25)]
  return `${L()}${L()}${L()}${int(0, 9)}${L()}${int(0, 9)}${int(0, 9)}`
}

const formatarData = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`

function gerarPdr(): Pdr {
  const regiao = pick(REGIOES)
  const distrito = pick(DISTRITOS[regiao])
  return {
    nome: `${pick(PREFIXOS_PDR)} ${pick(SUFIXOS_PDR)}`,
    cnpj: gerarCnpj(),
    cidade: distrito.nome,
    uf: distrito.uf,
    regiao,
    distrito: distrito.nome,
    endereco: `Rodovia BR-${int(100, 499)}, km ${int(1, 480)} — Zona Rural`,
    telefone: `(${int(41, 69)}) ${int(3000, 3999)}-${int(1000, 9999)}`,
    responsavel: pick(PRODUTORES),
    capacidadeEstatica: int(8, 220) * 1000,
    tipoUnidade: pick(['ARMAZÉM', 'COOPERATIVA', 'ESMAGADORA', 'TERMINAL'] as const),
  }
}

let sequenciaCarga = 30414000

type GrupoBase = {
  id: string
  data: string
  hora: string
  placa: string
  classificacao: Classificacao
}


function gerarCarga(dataBase: Date, acompanhada: boolean, grupo?: GrupoBase): Carga {
  const liquido = int(28, 46) * 1000 + int(0, 999)
  // desconto normal de impureza/umidade entre 0,2% e 3,2%;
  // uma pequena fatia sai com desconto absurdo para exercitar a análise de erros
  const descontoErrado = rnd() > 0.94
  const comDesconto = Math.round(
    liquido * (1 - (descontoErrado ? int(310, 520) : int(2, 32)) / 1000),
  )
  const hora = `${pad(int(7, 18))}:${pad(int(0, 59))}`
  const id = String(++sequenciaCarga)
  // no rateio o caminhão é o mesmo: a placa é herdada do grupo;
  // uma fração das placas sai truncada para exercitar a análise
  const placa = grupo?.placa ?? (rnd() > 0.97 ? gerarPlaca().slice(0, 5) : gerarPlaca())
  // eventual carga sem romaneio, também para exercitar a análise
  const romaneio = rnd() > 0.975 ? '' : String(int(140000, 159999))
  // a maioria das cargas chega com evidência fotográfica do tablet
  const temFoto = rnd() > 0.08
  const data = grupo?.data ?? formatarData(dataBase)
  const horaFinal = grupo?.hora ?? hora
  const produtor = pick(PRODUTORES)

  return {
    id,
    data,
    hora: horaFinal,
    placa,
    produtor,
    cpfCnpjProdutor: rnd() > 0.5 ? gerarCpf() : gerarCnpj(),
    romaneio,
    pesoLiquido: liquido,
    pesoComDesconto: comDesconto,
    classificacao: grupo?.classificacao ?? pick(CLASSIFICACOES),
    rateio: Boolean(grupo),
    grupoRateio: grupo?.id,
    observacao: rnd() > 0.85 ? 'Motorista não apresentou a 2ª via do romaneio.' : undefined,
    fotoUrl: temFoto
      ? gerarFotoMock(id, placa, romaneio, {
          data,
          hora: horaFinal,
          produtor,
          pesoLiquido: liquido,
          pesoComDesconto: comDesconto,
        })
      : undefined,
    acompanhada,
  }
}

/** gera as cargas da visita, incluindo 2–4 grupos de rateio */
function gerarCargas(cod: number, dataBase: Date, qtdAcomp: number, qtdNao: number): Carga[] {
  const cargas: Carga[] = []

  for (let i = 0; i < qtdAcomp; i++) cargas.push(gerarCarga(dataBase, true))
  for (let i = 0; i < qtdNao; i++) cargas.push(gerarCarga(dataBase, false))

  const qtdGrupos = int(2, 4)
  for (let g = 1; g <= qtdGrupos; g++) {
    const grupo: GrupoBase = {
      id: `RT-${cod}-${pad(g)}`,
      data: formatarData(dataBase),
      hora: `${pad(int(8, 17))}:${pad(int(0, 59))}`,
      placa: gerarPlaca(),
      classificacao: pick(CLASSIFICACOES),
    }
    const membros = int(2, 4)
    for (let m = 0; m < membros; m++) cargas.push(gerarCarga(dataBase, true, grupo))
  }

  // romaneios de uma unidade são sequenciais ao longo do dia; um salto grande
  // ou uma repetição indicam erro de digitação — semeados aqui de propósito
  let romaneio = int(140000, 158000)
  let anterior = ''
  cargas.forEach((c) => {
    if (!c.romaneio) return // carga propositalmente sem romaneio
    if (anterior && rnd() > 0.97) {
      c.romaneio = anterior // duplicidade proposital
      return
    }
    romaneio += rnd() > 0.94 ? int(600, 2600) : int(1, 40)
    c.romaneio = String(romaneio)
    anterior = c.romaneio
  })

  return cargas
}

function gerarDadosVisita(temCargas: boolean, cancelada: boolean, temAcompanhadas: boolean): DadosVisita {
  const reteste = !cancelada && rnd() > 0.75 ? 'Sim' : 'Não'
  return {
    visitaIniciada: temCargas ? 'Sim' : cancelada ? 'Não' : simNao(0.85),
    recebimentoCargas: temAcompanhadas ? 'Sim' : 'Não',
    realizouTestes: temCargas ? simNao(0.9) : 'Não',
    houveReteste: reteste,
    retesteSolicitante: reteste === 'Sim' ? pick(SOLICITANTES_RETESTE) : '',
    retesteMotivo: reteste === 'Sim' ? pick(MOTIVOS_RETESTE) : '',
    houveOcorrencia: 'Não',
    caixaFitaTeste: temCargas ? int(1, 100) : 0,
    fitasAssociaveisCargas: simNao(0.92),
  }
}

function gerarAcumulado(): Acumulado {
  const origem = pick(ORIGENS_ACUMULADO)
  return {
    informadoPeloPdr: origem === 'PDR' ? simNao(0.7) : 'Não',
    origem,
    // em kg, na mesma ordem de grandeza da série histórica da unidade: o que o
    // PDR informa na visita é o acumulado dele, não o movimento do dia
    valores: {
      Negativa: int(500, 24000) * 1000,
      Declarada: int(500, 24000) * 1000,
      Positiva: int(500, 24000) * 1000,
      Participante: int(500, 24000) * 1000,
    },
  }
}

function gerarProcedimentos(): Procedimento[] {
  return PROCEDIMENTOS_BASE.map((item) => {
    const r = rnd()
    const resposta: Procedimento['resposta'] = r > 0.25 ? 'Sim' : r > 0.12 ? 'Não' : 'N/A'
    return {
      item,
      resposta,
      obs: resposta === 'Não' ? 'Pendência registrada em campo.' : undefined,
    }
  })
}

const gerarHistorico = (): RecebimentoMes[] =>
  MESES.map((mes) => ({
    mes,
    toneladas: int(1200, 42000),
    fornecedores: int(8, 180),
    cargas: int(40, 900),
  }))

function gerarOcorrencias(cod: number, dataVisita: string, cargas: Carga[]): Ocorrencia[] {
  const qtd = cargas.length === 0 ? 0 : int(1, 3)
  return Array.from({ length: qtd }, (_, i) => {
    // a maior parte das ocorrências nasce de uma carga específica
    const carga = rnd() > 0.15 ? pick(cargas) : undefined
    return {
      id: `OC-${cod}-${i + 1}`,
      tipo: pick(TIPOS_OCORRENCIA),
      gravidade: pick(['Baixa', 'Média', 'Alta'] as const),
      descricao: carga
        ? `Identificado durante a conferência da carga ${carga.id} (placa ${carga.placa}, romaneio ${carga.romaneio}). Evidência fotográfica anexada ao formulário.`
        : 'Registrado pelo consultor durante o acompanhamento; evidência fotográfica anexada ao formulário.',
      data: dataVisita,
      status: pick(['Aberta', 'Em análise', 'Resolvida'] as const),
      cargaId: carga?.id,
    }
  })
}

const FALAS_CENTRAL = [
  'Conferi o formulário e algumas cargas ficaram com desconto acima do esperado. Podem revisar o romaneio dessas?',
  'Faltou a assinatura do responsável no termo. Consegue reenviar a foto?',
  'O acumulado informado não bate com o que temos na base. Vale confirmar com a unidade.',
  'As fotos das placas do rateio ficaram ilegíveis. Sem elas não consigo fechar a certificação.',
]

const FALAS_CAMPO = [
  'Bom dia! Revisei aqui e o desconto vem do laudo de umidade da própria unidade, vou anexar o comprovante.',
  'A unidade estava com o sistema fora do ar no momento da visita, por isso a divergência.',
  'Consegui a assinatura hoje pela manhã, já subi a foto pelo tablet.',
  'Confirmado com o responsável: as cargas do rateio são do mesmo caminhão, houve erro de digitação da placa.',
]

const FALAS_SUPERVISOR = [
  'Acompanhando. Se não houver retorno até amanhã, devolvo para a operação.',
  'Ok para mim. Após o anexo do laudo, podem seguir com a certificação.',
  'Atenção ao prazo desta unidade, é PDR mista e precisa fechar nesta semana.',
]

/** epoch determinístico a partir da data da visita */
function tsDaVisita(d: Date, horas: number, minutos: number): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), horas, minutos).getTime()
}

function gerarMensagens(cod: number, dataVisita: Date, visita: Pick<Visita, 'consultor' | 'lider' | 'supervisor'>): Mensagem[] {
  const qtd = int(0, 4)
  if (qtd === 0) return []

  const mensagens: Mensagem[] = []
  let hora = int(8, 11)
  // o minuto é sorteado de novo a cada mensagem, mas o gerador é determinístico
  // pela seed: descartar esta chamada deslocaria a sequência e mudaria a base inteira
  void int(0, 55)
  let dia = 1

  for (let i = 0; i < qtd; i++) {
    const daCentral = i % 2 === 0
    const supervisiona = i === qtd - 1 && rnd() > 0.6

    const autor = supervisiona ? visita.supervisor : daCentral ? 'Clarissa Menegat' : visita.consultor
    const papel = supervisiona
      ? 'Supervisor'
      : daCentral
        ? 'Central de Informações'
        : 'Consultor de campo'
    const texto = supervisiona
      ? pick(FALAS_SUPERVISOR)
      : daCentral
        ? pick(FALAS_CENTRAL)
        : pick(FALAS_CAMPO)

    hora += int(1, 5)
    if (hora > 18) {
      hora = int(8, 11)
      dia += 1
    }
    const minuto = int(0, 59)

    mensagens.push({
      id: `MSG-${cod}-${i + 1}`,
      autor,
      papel,
      texto,
      ts: tsDaVisita(new Date(dataVisita.getTime() + dia * 86400000), hora, minuto),
      tipo: 'mensagem',
      responsavel: daCentral && !supervisiona && rnd() > 0.6 ? visita.consultor : undefined,
    })
  }

  mensagens.sort((a, b) => a.ts - b.ts)

  // a conversa fictícia precisa ficar inteiramente no passado, senão uma
  // mensagem escrita agora apareceria antes das antigas
  const limite = new Date(
    HOJE.getFullYear(),
    HOJE.getMonth(),
    HOJE.getDate() - 1,
    18,
    0,
  ).getTime()
  const ultima = mensagens[mensagens.length - 1].ts
  if (ultima > limite) {
    const atraso = ultima - limite
    mensagens.forEach((m) => {
      m.ts -= atraso
    })
  }

  return mensagens
}

/* ------------------------------------------------------------------ *
 * Base de visitas
 * ------------------------------------------------------------------ */
/**
 * Quantidade de unidades no campo. Bem menor que o número de visitas, porque
 * um PDR é visitado várias vezes na safra — é essa repetição que dá histórico
 * à unidade e permite ir de um dia do Dia Anterior até a visita daquele dia.
 */
const TOTAL_PDRS = 55

/**
 * Monta pares (unidade, dia) antes de gerar as visitas. Cada unidade ganha uma
 * sequência de dias distintos e próximos entre si, como uma frente de trabalho
 * que passa pelo mesmo ponto de recebimento algumas vezes seguidas.
 */
function gerarAgenda(total: number): { pdr: Pdr; data: Date }[] {
  const unidades = Array.from({ length: TOTAL_PDRS }, () => gerarPdr())
  const agenda: { pdr: Pdr; data: Date }[] = []

  for (let u = 0; agenda.length < total; u++) {
    const pdr = unidades[u % TOTAL_PDRS]
    // âncora espalhada pela safra; as visitas da unidade caem nos dias antes dela
    const ancora = new Date(HOJE.getTime() - int(0, 150) * 86400000)
    const quantas = Math.min(int(3, 6), total - agenda.length)

    let passo = 0
    for (let k = 0; k < quantas; k++) {
      // sempre avança pelo menos um dia: a unidade não tem duas visitas no mesmo dia
      passo += int(1, 4)
      agenda.push({ pdr, data: new Date(ancora.getTime() - passo * 86400000) })
    }
  }

  return agenda
}

function gerarVisitas(total: number): Visita[] {
  const visitas: Visita[] = []
  const agenda = gerarAgenda(total)

  for (let i = 0; i < total; i++) {
    const cod = 295428 + i
    const { pdr: pdrDaVisita, data: dataVisita } = agenda[i]
    const envio = new Date(dataVisita.getTime() + int(1, 6) * 86400000)

    const r = rnd()
    const situacao: SituacaoId =
      r > 0.42
        ? 'certificada'
        : r > 0.26
          ? 'cancelada'
          : r > 0.13
            ? 'central-correcao'
            : 'operacao-correcao'

    const modalidade = pick(['1H', '2H', '4H'] as const)
    const horas = Number(modalidade[0])
    const inicio = int(7, 15)
    const cancelada = situacao === 'cancelada'

    const cargas = cancelada ? [] : gerarCargas(cod, dataVisita, int(3, 10), int(0, 5))
    const ocorrencias = gerarOcorrencias(cod, formatarData(dataVisita), cargas)
    const dadosVisita = gerarDadosVisita(
      cargas.length > 0,
      cancelada,
      cargas.some((c) => c.acompanhada),
    )
    dadosVisita.houveOcorrencia = ocorrencias.length > 0 ? 'Sim' : 'Não'

    const consultor = pick(CONSULTORES)
    const lider = pick(LIDERES)
    const supervisor = pick(SUPERVISORES)

    visitas.push({
      cod,
      data: formatarData(dataVisita),
      envioTablet: formatarData(envio),
      pdr: pdrDaVisita,
      numeroVisitas: int(1, 96),
      situacao,
      // a base de demonstração já traz visitas na 2ª passagem, para o fluxo
      // mostrar as quatro etapas com conteúdo
      rodada: situacao === 'central-correcao' || situacao === 'operacao-correcao' ? (cod % 3 === 0 ? 2 : 1) : 1,
      consultor,
      lider,
      liderFocal: pick(LIDERES_FOCAIS),
      supervisor,
      tipoVisita: rnd() > 0.18 ? 'PRESENCIAL' : 'REMOTA',
      modalidade,
      horaInicio: `${pad(inicio)}:00`,
      horaFim: `${pad(inicio + horas)}:00`,
      duracao: `0${horas}:00`,
      primeiraVisita: rnd() > 0.72,
      pdrMista: rnd() > 0.8,
      cincoEstrelas: rnd() > 0.88,
      dadosVisita,
      acumulado: gerarAcumulado(),
      // a tabela do Dia Anterior é derivada do histórico da unidade; aqui fica
      // só o que o auditor efetivamente lançar
      diaAnterior: [],
      procedimentos: gerarProcedimentos(),
      historico: gerarHistorico(),
      cargas,
      ocorrencias,
      mensagens: gerarMensagens(cod, dataVisita, { consultor, lider, supervisor }),
      errosLiberados: [],
      logAlteracoes: [],
      motivo: cancelada
        ? pick([
            'Unidade fechada no dia agendado.',
            'Responsável ausente — sem autorização de entrada.',
            'Condições climáticas impediram o deslocamento.',
            'PDR encerrou recebimento de soja na safra.',
          ])
        : situacao === 'central-correcao'
          ? 'Divergência entre peso líquido e peso com desconto em 3 cargas.'
          : situacao === 'operacao-correcao'
            ? 'Fotos do formulário ilegíveis — reenvio solicitado ao consultor.'
            : undefined,
    })
  }

  return visitas
}

/**
 * Semente de teste: o CNPJ 88.879.473/0001-51 já tem acumulado registrado em
 * Paulista/PE, além da unidade em Rosário do Sul/RS — exercita o fluxo de
 * conflito de município na importação de acumulado (um mesmo CNPJ com
 * unidades em cidades diferentes).
 */
const VISITA_TESTE_MUNICIPIO_PAULISTA: Visita = {
  cod: 900000,
  data: '10/01/2026',
  envioTablet: '10/01/2026',
  pdr: {
    nome: 'PDR ROSARIO DO SUL I',
    cnpj: '88.879.473/0001-51',
    cidade: 'PAULISTA',
    uf: 'PE',
    regiao: '-',
    distrito: '-',
    endereco: '-',
    telefone: '-',
    responsavel: '-',
    capacidadeEstatica: 0,
    tipoUnidade: 'ARMAZÉM',
  },
  numeroVisitas: 1,
  situacao: 'certificada',
  rodada: 1,
  consultor: 'INSERÇÃO_AUTO',
  lider: 'INSERÇÃO_AUTO',
  liderFocal: 'INSERÇÃO_AUTO',
  supervisor: 'INSERÇÃO_AUTO',
  tipoVisita: 'PRESENCIAL',
  modalidade: '1H',
  horaInicio: '00:00',
  horaFim: '00:00',
  duracao: '00:00',
  primeiraVisita: false,
  pdrMista: false,
  cincoEstrelas: false,
  dadosVisita: {
    visitaIniciada: 'Não',
    recebimentoCargas: 'Não',
    realizouTestes: 'Não',
    houveReteste: 'Não',
    retesteSolicitante: '',
    retesteMotivo: '',
    houveOcorrencia: 'Não',
    caixaFitaTeste: 0,
    fitasAssociaveisCargas: 'Sim',
  },
  acumulado: {
    informadoPeloPdr: 'Não',
    origem: 'PDR',
    valores: { Negativa: 4000, Declarada: 6000, Positiva: 10000, Participante: 2000 },
  },
  diaAnterior: [],
  procedimentos: [],
  historico: [],
  cargas: [],
  ocorrencias: [],
  mensagens: [],
  errosLiberados: [],
  logAlteracoes: [],
  motivo: 'INSERÇÃO_AUTO — visita criada via importação de acumulado',
}

/**
 * A ocorrência #8009 aponta para este COD. Sem o nome fixo, o gerador
 * sorteava outra razão social e a versão web (Postgres) nascia sem a Bianchi.
 */
const PDR_BIANCHI: Pick<Pdr, 'nome'> = { nome: 'BIANCHI COMÉRCIO DE GRÃOS S/A' }
export const COD_VISITA_BIANCHI = 295510

function aplicarPdrsFixosNasVisitas(visitas: Visita[]): Visita[] {
  return visitas.map((v) =>
    v.cod === COD_VISITA_BIANCHI ? { ...v, pdr: { ...v.pdr, ...PDR_BIANCHI } } : v,
  )
}

export const VISITAS_INICIAIS: Visita[] = aplicarPdrsFixosNasVisitas([
  ...gerarVisitas(260),
  VISITA_TESTE_MUNICIPIO_PAULISTA,
])

const NOMES_MES = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

/**
 * 3.2 — histórico de acumulado da unidade nos dias e meses recentes.
 * Determinístico a partir do próprio CNPJ para que a mesma unidade
 * apresente sempre o mesmo histórico.
 */
/**
 * Série da unidade terminando na data de referência — normalmente a data da
 * visita, para que a primeira linha seja o dia que está sendo auditado. Sem
 * isso, uma visita de março mostrava dias de agosto, posteriores a ela.
 */
export function historicoAcumuladoPorCnpj(
  cnpj: string,
  ate: Date = HOJE,
): HistoricoAcumulado {
  const seed = cnpj.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  const r = criarRandom(seed * 7919)
  const n = (min: number, max: number) => Math.floor(r() * (max - min + 1)) + min
  const origem = (): OrigemAcumulado => ORIGENS_ACUMULADO[n(0, 2)]

  /**
   * Série acumulada: o valor de cada período inclui todos os anteriores e,
   * portanto, nunca deveria diminuir com o tempo. Parte das unidades recebe
   * um retrocesso proposital para exercitar a análise de erros.
   */
  function serie(
    qtd: number,
    rotulo: (passosAtras: number) => string,
    inicial: () => number,
    incremento: () => number,
  ): AcumuladoPeriodo[] {
    const acc = {
      negativa: inicial(),
      declarada: inicial(),
      positiva: inicial(),
      participante: inicial(),
    }
    let cargas = n(40, 160)
    let visitas = n(2, 6)

    const crono: AcumuladoPeriodo[] = []
    for (let passos = qtd - 1; passos >= 0; passos--) {
      acc.negativa += incremento()
      acc.declarada += incremento()
      acc.positiva += Math.round(incremento() / 3)
      acc.participante += incremento() * 2
      cargas += n(8, 60)
      visitas += n(0, 3)

      crono.push({ periodo: rotulo(passos), origem: origem(), ...acc, cargas, visitas })
    }

    // retrocesso proposital em ~35% das unidades
    if (r() > 0.65 && crono.length > 3) {
      const alvo = crono[n(2, crono.length - 2)]
      alvo.negativa = Math.round(alvo.negativa * 0.78)
      alvo.declarada = Math.round(alvo.declarada * 0.82)
      alvo.participante = Math.round(alvo.participante * 0.85)
    }

    return crono.reverse() // exibição: mais recente primeiro
  }

  // a série é gerada em kg, a mesma unidade do acumulado digitado na visita —
  // ter tonelada de um lado e quilo do outro obrigava a converter em cada regra
  const dias = serie(
    14,
    (p) => formatarData(new Date(ate.getFullYear(), ate.getMonth(), ate.getDate() - p)),
    () => n(2000, 9000) * 1000,
    () => n(120, 1400) * 1000,
  )

  const meses = serie(
    8,
    (p) => {
      const d = new Date(ate.getFullYear(), ate.getMonth() - p, 1)
      return `${NOMES_MES[d.getMonth()]}/${d.getFullYear()}`
    },
    () => n(8000, 26000) * 1000,
    () => n(1500, 9000) * 1000,
  )

  return { dias, meses }
}

export const OPCOES = {
  consultores: [...CONSULTORES].sort(),
  lideres: [...LIDERES].sort(),
  lideresFocais: [...LIDERES_FOCAIS].sort(),
  supervisores: [...SUPERVISORES].sort(),
  regioes: [...REGIOES].sort(),
  produtores: [...PRODUTORES].sort(),
}

export function proximoIdCarga(): string {
  return String(++sequenciaCarga)
}

/**
 * Empurra a sequência para além de um id que já existe. Necessário porque o
 * contador reinicia a cada carga da página: sem isto, cargas restauradas do
 * storage teriam seus ids reemitidos, e salvarCarga — que casa por id —
 * sobrescreveria a carga errada.
 */
export function reservarIdCarga(id: string) {
  const n = Number(id)
  if (Number.isFinite(n) && n > sequenciaCarga) sequenciaCarga = n
}

/* ------------------------------------------------------------------ *
 * Catálogo de PDRs pré-cadastrados
 * ------------------------------------------------------------------ */
/**
 * Unidades escritas à mão. Existem porque o modelo de planilha da importação
 * de acumulado referencia estes CNPJs — apagá-las quebraria aquele exemplo.
 */
const PDRS_FIXOS: Omit<PdrCatalogo, 'id'>[] = [
  { nome: 'PDR ALEGRETE', cnpj: '02.595.222/0005-53', cidade: 'ALEGRETE', uf: 'RS', situacao: 'Ativo' },
  { nome: 'PDR ROSARIO DO SUL I', cnpj: '88.879.473/0001-51', cidade: 'ROSARIO DO SUL', uf: 'RS', situacao: 'Ativo' },
  { nome: 'PDR ROSARIO DO SUL II', cnpj: '21.018.500/0002-01', cidade: 'ROSARIO DO SUL', uf: 'RS', situacao: 'Ativo' },
  { nome: 'PDR ROSARIO DO SUL III', cnpj: '05.034.045/0001-09', cidade: 'ROSARIO DO SUL', uf: 'RS', situacao: 'Inativo' },
]

/**
 * O cadastro nasce com as unidades que as visitas de fato referenciam. Sem
 * isso a Administração mostrava 4 PDRs enquanto o sistema operava com dezenas,
 * e o cadastro não servia para nada: nenhuma visita apontava para ele.
 *
 * A unidade visitada entra como Ativa — se está recebendo visita, está em
 * operação. Só as escritas à mão trazem situação própria.
 */
export const PDRS_CATALOGO_INICIAIS: PdrCatalogo[] = (() => {
  const porCnpj = new Map<string, Omit<PdrCatalogo, 'id'>>()

  for (const p of PDRS_FIXOS) porCnpj.set(p.cnpj, p)

  for (const v of VISITAS_INICIAIS) {
    if (porCnpj.has(v.pdr.cnpj)) continue
    // mesma máscara do cadastro manual e da importação, senão o catálogo
    // mistura "ALEGRETE" com "Paragominas"
    porCnpj.set(v.pdr.cnpj, {
      nome: mascaraProdutor(v.pdr.nome),
      cnpj: v.pdr.cnpj,
      cidade: mascaraProdutor(v.pdr.cidade),
      uf: v.pdr.uf,
      situacao: 'Ativo',
    })
  }

  return [...porCnpj.values()].map((p, i) => ({ ...p, id: String(100000001 + i) }))
})()

/* ------------------------------------------------------------------ *
 * Usuários — os dois admins da operação e a conta RTV de demonstração.
 * Os demais perfis nascem em Administração → Usuários → Novo usuário.
 * ------------------------------------------------------------------ */
export const USUARIOS_INICIAIS: Usuario[] = [
  {
    id: 'U-001',
    nome: 'Bruno de Souza Ferreira',
    login: 'Bruno.Ferreira',
    senha: 'Qima123',
    telefone: '(54) 99101-2233',
    cpf: '123.456.780-62',
    email: 'bruno.ferreira@qima.com',
    perfil: 'Admin',
    situacao: 'Ativo',
  },
  {
    id: 'U-002',
    nome: 'Ederlan Qima',
    login: 'Ederlan.Qima',
    senha: 'Qima123',
    telefone: '(51) 99202-3344',
    cpf: '123.456.787-39',
    email: 'ederlan.qima@qima.com',
    perfil: 'Admin',
    situacao: 'Ativo',
  },
  {
    id: 'U-003',
    nome: 'Osvaldo Bittencourt',
    login: 'Osvaldo.Rtv',
    senha: 'Qima123',
    telefone: '(11) 98888-4400',
    cpf: '234.567.890-11',
    email: 'osvaldo.rtv@cliente.com',
    perfil: 'RTV (Client)',
    situacao: 'Ativo',
  },
]

/* ------------------------------------------------------------------ *
 * Solicitações — exemplos de pedidos para popular o quadro no primeiro acesso
 * ------------------------------------------------------------------ */
const ANALISTA = 'Bruno de Souza Ferreira'

export const SOLICITACOES_INICIAIS: Solicitacao[] = [
  {
    id: 'SOL-1',
    numero: 1041,
    tipo: 'exclusao-carga',
    titulo: 'Excluir carga duplicada por erro de digitação',
    descricao:
      'A carga foi lançada duas vezes pelo tablet por falha de conexão. Peço a exclusão da segunda ocorrência.',
    visitaCod: 295428,
    cargaId: '30414012',
    status: 'pendente',
    solicitante: 'Diego Fontana',
    participantes: ['Helena Duarte'],
    criadoEm: Date.parse('2026-08-05T09:12:00'),
    atualizadoEm: Date.parse('2026-08-05T09:12:00'),
    mensagens: [
      {
        id: 'MSG-SOL-1-1',
        autor: 'Diego Fontana',
        texto: 'Bom dia! Preciso excluir a carga 30414012, foi lançada em duplicidade.',
        ts: Date.parse('2026-08-05T09:12:00'),
        anexos: [],
      },
    ],
  },
  {
    id: 'SOL-2',
    numero: 1040,
    tipo: 'acumulado',
    titulo: 'Corrigir acumulado do PDR — valor divergente do laudo',
    descricao: 'O acumulado importado ficou diferente do laudo físico enviado pela unidade.',
    visitaCod: 295429,
    status: 'analise',
    solicitante: 'Larissa Menezes',
    participantes: [ANALISTA],
    criadoEm: Date.parse('2026-08-04T14:30:00'),
    atualizadoEm: Date.parse('2026-08-05T08:50:00'),
    mensagens: [
      {
        id: 'MSG-SOL-2-1',
        autor: 'Larissa Menezes',
        texto: 'Segue o laudo físico da unidade para conferência do acumulado.',
        ts: Date.parse('2026-08-04T14:30:00'),
        anexos: [],
      },
      {
        id: 'MSG-SOL-2-2',
        autor: ANALISTA,
        texto: 'Recebido, Larissa. Vou conferir com a base e retorno ainda hoje.',
        ts: Date.parse('2026-08-05T08:50:00'),
        anexos: [],
      },
    ],
  },
  {
    id: 'SOL-3',
    numero: 1039,
    tipo: 'insercao-dados',
    titulo: 'Inserir carga que faltou no envio do tablet',
    descricao: 'Uma carga do rateio RT-295430-01 não sincronizou e ficou de fora da visita.',
    visitaCod: 295430,
    status: 'feito',
    solicitante: 'Patrícia Nogueira',
    participantes: [ANALISTA, 'Cesar Monteiro'],
    criadoEm: Date.parse('2026-08-01T11:00:00'),
    atualizadoEm: Date.parse('2026-08-02T16:20:00'),
    mensagens: [
      {
        id: 'MSG-SOL-3-1',
        autor: 'Patrícia Nogueira',
        texto: 'Falta lançar uma carga do rateio RT-295430-01, o tablet não sincronizou a última.',
        ts: Date.parse('2026-08-01T11:00:00'),
        anexos: [],
      },
      {
        id: 'MSG-SOL-3-2',
        autor: ANALISTA,
        texto: 'Carga inserida manualmente na visita. Pode confirmar os valores?',
        ts: Date.parse('2026-08-02T16:20:00'),
        anexos: [],
      },
    ],
  },
]

/* ------------------------------------------------------------------ *
 * Ocorrências de campo — quadro por status, chat e observações por
 * etapa. Ver comentário do tipo `OcorrenciaCampo` em types.ts: é um
 * processo maior que a `Ocorrencia` simples já existente na aba 6 da
 * visita, com COD, fila de tratamento e hierarquia próprios.
 * ------------------------------------------------------------------ */
export const SITUACOES_OCORRENCIA_CAMPO: SituacaoOcorrenciaCampo[] = [
  {
    id: 'pendente-central',
    label: 'Pendente Central',
    short: 'Pendente Central',
    color: '#c2410c',
    descricao: 'Aguardando triagem da Central de Informações',
  },
  {
    id: 'operacao-pendente',
    label: 'Operação Pendente',
    short: 'Operação Pendente',
    color: '#6d28d9',
    descricao: 'Devolvida para o time de operação em campo',
  },
  {
    id: 'rtv-pendente',
    label: 'RTV Pendente',
    short: 'RTV Pendente',
    color: '#0369a1',
    descricao: 'Aguardando manifestação do RTV',
  },
  {
    id: 'finalizada',
    label: 'Finalizada',
    short: 'Finalizada',
    color: '#0e8f6c',
    descricao: 'Ocorrência tratada e encerrada',
  },
  {
    id: 'cancelada',
    label: 'Cancelada',
    short: 'Cancelada',
    color: '#5b6673',
    descricao: 'Encerrada sem tratamento, com justificativa',
  },
]

export const situacaoOcorrenciaCampoPorId = (id: StatusOcorrenciaCampo): SituacaoOcorrenciaCampo =>
  SITUACOES_OCORRENCIA_CAMPO.find((s) => s.id === id) ?? SITUACOES_OCORRENCIA_CAMPO[0]

export const CORES_CLASSIFICACAO_OCORRENCIA: Record<ClassificacaoOcorrenciaCampo, string> = {
  Observação: '#1d4ed8',
  'Ponto de Atenção': '#b45309',
  'Erro Processual': '#c2410c',
  Grave: '#dc2626',
  'Ponto de atenção/Grave': '#9d174d',
}

/**
 * Catálogo de categorias definido pela área de compliance, com a
 * classificação "To Be" de cada uma — repassado pelo time de negócio.
 */
export const CATEGORIAS_OCORRENCIA_CAMPO: CategoriaOcorrenciaCampo[] = [
  { tipo: 'Informação Inconsistente', classificacao: 'Ponto de Atenção' },
  { tipo: 'Não Armazena As Fitas Utilizadas Corretamente', classificacao: 'Erro Processual' },
  { tipo: 'Procedimento Do Teste Incorreto', classificacao: 'Erro Processual' },
  { tipo: 'Não Passa Informação', classificacao: 'Ponto de Atenção' },
  { tipo: 'Não Passa Informação – Recorrente nas grandes contas', classificacao: 'Observação' },
  { tipo: 'Falta De Equipamentos / Equipamentos Avariados', classificacao: 'Ponto de Atenção' },
  { tipo: 'Reteste Com Resultado Divergente', classificacao: 'Grave' },
  { tipo: 'Fita Positiva E Romaneio Negativo', classificacao: 'Grave' },
  { tipo: 'Entrada Não Autorizada', classificacao: 'Grave' },
  { tipo: 'Não Realiza Testes', classificacao: 'Grave' },
  { tipo: 'Alteração Na Amostra Coletada', classificacao: 'Grave' },
  { tipo: 'Proibido De Acompanhar O Procedimento', classificacao: 'Grave' },
  { tipo: 'Fitas Prontas', classificacao: 'Grave' },
  { tipo: 'Assédio', classificacao: 'Grave' },
  { tipo: 'Agressão Verbal', classificacao: 'Grave' },
  { tipo: 'Tentativa De Suborno', classificacao: 'Grave' },
  { tipo: 'Agressão Física', classificacao: 'Grave' },
  { tipo: 'Ameaça', classificacao: 'Grave' },
  { tipo: 'Carga De Não Participante, Registrada Como Participante', classificacao: 'Grave' },
  { tipo: 'Discriminação', classificacao: 'Grave' },
  { tipo: 'Outros', classificacao: 'Ponto de atenção/Grave' },
]

export const categoriaOcorrenciaCampoPorTipo = (tipo: string): CategoriaOcorrenciaCampo | undefined =>
  CATEGORIAS_OCORRENCIA_CAMPO.find((c) => c.tipo === tipo)

/** RTVs de exemplo — a Visita ainda não cadastra esse papel (ver comentário em types.ts) */
const NOMES_RTV = ['Osvaldo Bittencourt', 'Fernanda Aquino']

const visitaPorCod = (cod: number): Visita =>
  VISITAS_INICIAIS.find((v) => v.cod === cod) ?? VISITAS_INICIAIS[0]

/** primeiro romaneio real da visita, para a ocorrência apontar para algo que existe de fato */
const primeiroRomaneio = (cod: number): string | undefined =>
  visitaPorCod(cod).cargas.find((c) => c.romaneio)?.romaneio

/**
 * Semente de demonstração: como ainda não existem ocorrências reais vindas
 * do tablet, os 9 registros abaixo cobrem as 5 colunas do quadro, os dois
 * casos com/sem romaneio e uma 2ª passagem pela Central (campo `rodada`,
 * mesmo mecanismo do fluxo de Visitas). Todas apontam para visitas que
 * realmente existem em VISITAS_INICIAIS.
 */
function gerarOcorrenciasCampoIniciais(): OcorrenciaCampo[] {
  type Semente = {
    numero: number
    visitaCod: number
    categoria: string
    status: StatusOcorrenciaCampo
    rodada: number
    comRomaneio: boolean
    obsOcorrencia: string
    obsAnalista?: string
    obsLider?: string
    obsRtv?: string
    rtv?: string
    motivo?: string
    criadoEm: string
    anexos?: { nome: string; tamanho: number; tipo: string }[]
    chat?: { autor: string; papel: string; texto: string; ts: string }[]
  }

  const sementes: Semente[] = [
    {
      numero: 8001,
      visitaCod: 295428,
      categoria: 'Reteste Com Resultado Divergente',
      status: 'pendente-central',
      rodada: 1,
      comRomaneio: true,
      obsOcorrencia:
        'Consultor registrou pelo tablet que o reteste da amostra apontou resultado diferente do teste original, sem justificativa da unidade no momento da visita.',
      criadoEm: '2026-08-06T08:40:00',
    },
    {
      numero: 8002,
      visitaCod: 295429,
      categoria: 'Não Passa Informação',
      status: 'operacao-pendente',
      rodada: 1,
      comRomaneio: false,
      obsOcorrencia:
        'Responsável pela unidade não retornou contato durante a visita para esclarecer o acumulado divergente.',
      obsAnalista:
        'Central confirmou a inconsistência e encaminhou para a Operação apurar em campo com o responsável da unidade.',
      criadoEm: '2026-08-05T10:15:00',
      chat: [
        {
          autor: ANALISTA,
          papel: 'Analista',
          texto: 'Encaminhei para a Operação verificar com o responsável da unidade. Aguardando retorno.',
          ts: '2026-08-05T11:02:00',
        },
      ],
    },
    {
      numero: 8003,
      visitaCod: 295435,
      categoria: 'Falta De Equipamentos / Equipamentos Avariados',
      status: 'pendente-central',
      rodada: 2,
      comRomaneio: true,
      obsOcorrencia: 'Balança da unidade apresentou pane durante a pesagem de duas cargas do rateio.',
      obsAnalista: 'Devolvida à Operação em 04/08 para confirmar substituição do equipamento.',
      obsLider: 'Líder confirmou visita técnica agendada com o fornecedor da balança para esta semana.',
      criadoEm: '2026-08-03T09:20:00',
      chat: [
        {
          autor: 'Cesar Monteiro',
          papel: 'Líder',
          texto: 'Fornecedor já foi acionado, deve normalizar até quinta-feira.',
          ts: '2026-08-06T14:10:00',
        },
        {
          autor: ANALISTA,
          papel: 'Analista',
          texto: 'Perfeito, deixo em acompanhamento e reabro se não resolver até lá.',
          ts: '2026-08-06T15:00:00',
        },
      ],
    },
    {
      numero: 8004,
      visitaCod: 295442,
      categoria: 'Assédio',
      status: 'rtv-pendente',
      rodada: 1,
      comRomaneio: false,
      obsOcorrencia:
        'Consultora relatou pelo tablet comportamento inadequado de um colaborador da unidade durante a visita.',
      obsAnalista: 'Caso classificado como Grave — encaminhado imediatamente para o RTV, sem aguardar a Operação.',
      obsLider: 'Líder orientado a acompanhar a consultora nas próximas visitas a esta unidade até a apuração.',
      rtv: NOMES_RTV[0],
      criadoEm: '2026-08-02T16:45:00',
      anexos: [
        { nome: 'relato-consultora.pdf', tamanho: 184_320, tipo: 'application/pdf' },
        { nome: 'foto-unidade.jpg', tamanho: 1_248_512, tipo: 'image/jpeg' },
      ],
      chat: [
        {
          autor: 'Helena Duarte',
          papel: 'Líder',
          texto: 'Já conversei com a consultora, ela está bem e será acompanhada nas próximas visitas.',
          ts: '2026-08-02T17:30:00',
        },
      ],
    },
    {
      numero: 8005,
      visitaCod: 295450,
      categoria: 'Entrada Não Autorizada',
      status: 'rtv-pendente',
      rodada: 1,
      comRomaneio: true,
      obsOcorrencia: 'Consultor não obteve autorização de acesso à área de pesagem no horário informado pela unidade.',
      obsAnalista: 'Encaminhada direto ao RTV por se tratar de restrição de acesso recorrente nesta unidade.',
      rtv: NOMES_RTV[1],
      criadoEm: '2026-08-01T13:10:00',
    },
    {
      numero: 8006,
      visitaCod: 295461,
      categoria: 'Fita Positiva E Romaneio Negativo',
      status: 'finalizada',
      rodada: 1,
      comRomaneio: true,
      obsOcorrencia: 'Fita de teste marcada como positiva não corresponde à classificação negativa do romaneio.',
      obsAnalista: 'Confirmado erro de lançamento no tablet; carga corrigida na base.',
      obsLider: 'Líder reforçou com o consultor a conferência da fita antes do envio.',
      obsRtv: 'RTV sem objeções — tratado como erro pontual de lançamento, sem reincidência na unidade.',
      rtv: NOMES_RTV[0],
      criadoEm: '2026-07-30T09:00:00',
      chat: [
        {
          autor: ANALISTA,
          papel: 'Analista',
          texto: 'Carga corrigida na base após conferência com a fita física.',
          ts: '2026-07-30T15:20:00',
        },
        {
          autor: NOMES_RTV[0],
          papel: 'RTV',
          texto: 'Sem objeções, pode finalizar.',
          ts: '2026-07-31T08:05:00',
        },
      ],
    },
    {
      numero: 8007,
      visitaCod: 295475,
      categoria: 'Não Realiza Testes',
      status: 'finalizada',
      rodada: 2,
      comRomaneio: false,
      obsOcorrencia: 'Unidade recebeu cargas sem realizar os testes obrigatórios no início do turno.',
      obsAnalista: 'Devolvida à Operação para orientar a unidade; retornou à Central após a segunda visita já regularizada.',
      obsLider: 'Líder validou em campo que os testes voltaram a ser realizados normalmente.',
      obsRtv: 'RTV ciente, sem necessidade de tratamento adicional.',
      rtv: NOMES_RTV[1],
      criadoEm: '2026-07-25T07:50:00',
    },
    {
      numero: 8008,
      visitaCod: 295490,
      categoria: 'Discriminação',
      status: 'cancelada',
      rodada: 1,
      comRomaneio: false,
      obsOcorrencia: 'Denúncia registrada pelo tablet sobre tratamento discriminatório na unidade.',
      obsAnalista: 'Apuração da Central não confirmou o relato após entrevista com as partes envolvidas.',
      motivo: 'Denúncia não confirmada após apuração da Central.',
      criadoEm: '2026-07-20T11:30:00',
    },
    {
      numero: 8009,
      visitaCod: 295510,
      categoria: 'Outros',
      status: 'pendente-central',
      rodada: 1,
      comRomaneio: true,
      obsOcorrencia: 'Consultor sinalizou situação atípica na unidade não coberta pelas categorias padrão — detalhado em campo livre do tablet.',
      criadoEm: '2026-08-06T17:05:00',
    },
  ]

  return sementes.map((s) => {
    const visita = visitaPorCod(s.visitaCod)
    const criadoEm = Date.parse(s.criadoEm)
    const mensagens: Mensagem[] = (s.chat ?? []).map((m, i) => ({
      id: `MSG-OCR-${s.numero}-${i + 1}`,
      autor: m.autor,
      papel: m.papel,
      texto: m.texto,
      ts: Date.parse(m.ts),
      tipo: 'mensagem',
    }))
    const atualizadoEm = mensagens.length ? mensagens[mensagens.length - 1].ts : criadoEm
    const tsAnalista = criadoEm + 3_600_000
    const tsLider = criadoEm + 7_200_000
    const tsRtv = criadoEm + 10_800_000

    const historico: EventoOcorrencia[] = [
      {
        id: `EVT-OCR-${s.numero}-1`,
        ts: criadoEm,
        por: visita.consultor,
        papel: 'Consultor',
        etapa: 'Consultor',
        acao: 'Registrou observação',
        descricao: 'Observação original enviada pelo tablet em campo.',
      },
    ]
    if (s.obsAnalista) {
      historico.push({
        id: `EVT-OCR-${s.numero}-2`,
        ts: tsAnalista,
        por: ANALISTA,
        papel: 'Analista',
        etapa: 'Analista',
        acao: 'Iniciou revisão',
        descricao: 'Revisão da Central registrada.',
      })
    }
    if (s.obsLider) {
      historico.push({
        id: `EVT-OCR-${s.numero}-3`,
        ts: tsLider,
        por: visita.lider,
        papel: 'Líder',
        etapa: 'Líder',
        acao: 'Salvou observação',
        descricao: 'Acompanhamento do líder registrado.',
      })
    }
    if (s.obsRtv) {
      historico.push({
        id: `EVT-OCR-${s.numero}-4`,
        ts: tsRtv,
        por: s.rtv ?? NOMES_RTV[0],
        papel: 'RTV',
        etapa: 'RTV',
        acao: 'Salvou parecer',
        descricao: 'Parecer do RTV registrado.',
      })
    }
    if (s.status === 'finalizada') {
      historico.push({
        id: `EVT-OCR-${s.numero}-fim`,
        ts: atualizadoEm,
        por: s.rtv ?? ANALISTA,
        papel: 'RTV',
        etapa: 'RTV',
        acao: 'Finalizou',
        descricao: 'Ocorrência tratada e encerrada.',
      })
    }
    if (s.status === 'cancelada') {
      historico.push({
        id: `EVT-OCR-${s.numero}-canc`,
        ts: atualizadoEm,
        por: ANALISTA,
        papel: 'Analista',
        etapa: 'Analista',
        acao: 'Cancelou',
        descricao: s.motivo ?? 'Ocorrência cancelada.',
      })
    }

    const anexos: AnexoArquivo[] = (s.anexos ?? []).map((a, i) => ({
      id: `ANX-OCR-${s.numero}-${i + 1}`,
      nome: a.nome,
      tamanho: a.tamanho,
      tipo: a.tipo,
      url: '',
    }))

    return {
      id: `OCR-${s.numero}`,
      numero: s.numero,
      visitaCod: s.visitaCod,
      romaneio: s.comRomaneio ? primeiroRomaneio(s.visitaCod) : undefined,
      categoria: s.categoria,
      status: s.status,
      rodada: s.rodada,
      dataHora: criadoEm,
      obsOcorrencia: s.obsOcorrencia,
      obsAnalista: s.obsAnalista
        ? { texto: s.obsAnalista, por: ANALISTA, ts: tsAnalista }
        : undefined,
      obsLider: s.obsLider
        ? { texto: s.obsLider, por: visita.lider, ts: tsLider }
        : undefined,
      obsRtv: s.obsRtv
        ? { texto: s.obsRtv, por: s.rtv ?? NOMES_RTV[0], ts: tsRtv }
        : undefined,
      rtv: s.rtv,
      motivo: s.motivo,
      mensagens,
      historico,
      anexos,
      criadoEm,
      atualizadoEm,
    }
  })
}

export const OCORRENCIAS_CAMPO_INICIAIS: OcorrenciaCampo[] = gerarOcorrenciasCampoIniciais()

/** visitas das quais as ocorrências de demonstração dependem — a web precisa delas no cache/banco */
export function visitasSementeDasOcorrencias(): Visita[] {
  const cods = new Set(OCORRENCIAS_CAMPO_INICIAIS.map((o) => o.visitaCod))
  return VISITAS_INICIAIS.filter((v) => cods.has(v.cod))
}
