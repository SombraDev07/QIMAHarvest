import { useSyncExternalStore } from 'react'
import { VISITAS_INICIAIS, PDRS_CATALOGO_INICIAIS, SOLICITACOES_INICIAIS } from './data/mock'
import { USUARIO } from './usuario'
import type {
  Acumulado,
  AcumuladoImportado,
  AnexoArquivo,
  Carga,
  Classificacao,
  DadosVisita,
  DetalheAcumuladoImportado,
  ErroLiberado,
  GrupoRateio,
  Mensagem,
  PdrCatalogo,
  RelatorioAcumulado,
  Solicitacao,
  StatusSolicitacao,
  SituacaoId,
  TipoSolicitacao,
  Visita,
} from './types'

/* ------------------------------------------------------------------ *
 * Store em memória. Substituir estas funções por chamadas HTTP quando
 * houver API — a camada de telas não muda.
 * ------------------------------------------------------------------ */
let estado: Visita[] = VISITAS_INICIAIS
const ouvintes = new Set<() => void>()

function notificar() {
  ouvintes.forEach((fn) => fn())
}

function subscrever(fn: () => void) {
  ouvintes.add(fn)
  return () => ouvintes.delete(fn)
}

const snapshot = () => estado

export function useVisitas(): Visita[] {
  return useSyncExternalStore(subscrever, snapshot, snapshot)
}

export function useVisita(cod: number): Visita | undefined {
  return useVisitas().find((v) => v.cod === cod)
}

function alterarVisita(cod: number, fn: (v: Visita) => Visita) {
  estado = estado.map((v) => (v.cod === cod ? fn(v) : v))
  notificar()
}

/* ------------------------------------------------------------------ *
 * Ações
 * ------------------------------------------------------------------ */
export function salvarDadosVisita(cod: number, patch: Partial<DadosVisita>) {
  alterarVisita(cod, (v) => ({ ...v, dadosVisita: { ...v.dadosVisita, ...patch } }))
}

export function salvarAcumulado(cod: number, patch: Partial<Acumulado>) {
  alterarVisita(cod, (v) => ({ ...v, acumulado: { ...v.acumulado, ...patch } }))
}

/**
 * Cargas de um mesmo rateio são o mesmo caminhão: herdam data, hora, placa e
 * classificação do grupo. Ao gravar qualquer membro, os demais são sincronizados.
 */
function sincronizarGrupo(cargas: Carga[], referencia: Carga): Carga[] {
  if (!referencia.rateio || !referencia.grupoRateio) return cargas
  return cargas.map((c) =>
    c.grupoRateio === referencia.grupoRateio
      ? {
          ...c,
          data: referencia.data,
          hora: referencia.hora,
          placa: referencia.placa,
          classificacao: referencia.classificacao,
        }
      : c,
  )
}

export function salvarCarga(cod: number, carga: Carga) {
  alterarVisita(cod, (v) => {
    const existe = v.cargas.some((c) => c.id === carga.id)
    const base = existe
      ? v.cargas.map((c) => (c.id === carga.id ? carga : c))
      : [...v.cargas, carga]
    return { ...v, cargas: sincronizarGrupo(base, carga) }
  })
}

export function adicionarCargas(cod: number, novas: Carga[]) {
  alterarVisita(cod, (v) => {
    let cargas = [...v.cargas, ...novas]
    novas.forEach((c) => {
      cargas = sincronizarGrupo(cargas, c)
    })
    return { ...v, cargas }
  })
}

export function excluirCarga(cod: number, cargaId: string) {
  alterarVisita(cod, (v) => {
    const restantes = v.cargas.filter((c) => c.id !== cargaId)
    // grupo de rateio que ficou com uma única carga deixa de ser rateio
    const contagem = new Map<string, number>()
    restantes.forEach((c) => {
      if (c.grupoRateio) contagem.set(c.grupoRateio, (contagem.get(c.grupoRateio) ?? 0) + 1)
    })
    const cargas = restantes.map((c) =>
      c.grupoRateio && contagem.get(c.grupoRateio) === 1
        ? { ...c, rateio: false, grupoRateio: undefined }
        : c,
    )
    return { ...v, cargas }
  })
}

export function excluirCargas(cod: number, ids: string[]) {
  ids.forEach((id) => excluirCarga(cod, id))
}

/* ------------------------------------------------------------------ *
 * Conversa e fluxo da visita
 * ------------------------------------------------------------------ */
let sequenciaMensagem = 0

function novaMensagem(
  texto: string,
  tipo: Mensagem['tipo'],
  responsavel?: string,
): Mensagem {
  return {
    id: `MSG-LOCAL-${++sequenciaMensagem}`,
    autor: tipo === 'sistema' ? 'Sistema' : USUARIO.nome,
    papel: tipo === 'sistema' ? 'Registro automático' : USUARIO.papel,
    texto,
    ts: Date.now(),
    tipo,
    responsavel,
  }
}

export function enviarMensagem(cod: number, texto: string, responsavel?: string) {
  const msg = novaMensagem(texto, 'mensagem', responsavel)
  alterarVisita(cod, (v) => ({ ...v, mensagens: [...v.mensagens, msg] }))
  return msg
}

function registrarSistema(v: Visita, texto: string): Visita {
  return { ...v, mensagens: [...v.mensagens, novaMensagem(texto, 'sistema')] }
}

/** Validar — registra o resultado da checagem de regras na análise */
export function registrarValidacao(cod: number, erros: number, atencoes: number) {
  alterarVisita(cod, (v) =>
    registrarSistema(
      { ...v, ultimaValidacao: { por: USUARIO.nome, ts: Date.now(), erros, atencoes } },
      erros === 0 && atencoes === 0
        ? 'Validação executada: nenhuma inconsistência encontrada.'
        : `Validação executada: ${erros} erro(s) e ${atencoes} ponto(s) de atenção. Detalhes na aba Análise.`,
    ),
  )
}

/** Enviar para operação — devolve a visita ao time de campo */
export function enviarParaOperacao(cod: number, motivo: string) {
  alterarVisita(cod, (v) =>
    registrarSistema(
      { ...v, situacao: 'operacao-correcao', motivo },
      `Visita devolvida à Operação por ${USUARIO.nome}. Motivo: ${motivo}`,
    ),
  )
}

/** Certificar — grava as liberações de erro e fecha a visita */
export function certificarVisita(cod: number, liberacoes: Omit<ErroLiberado, 'por' | 'ts'>[]) {
  const ts = Date.now()
  const novas: ErroLiberado[] = liberacoes.map((l) => ({ ...l, por: USUARIO.nome, ts }))

  alterarVisita(cod, (v) => {
    const texto = novas.length
      ? `Visita certificada por ${USUARIO.nome} com ${novas.length} erro(s) liberado(s) mediante justificativa.`
      : `Visita certificada por ${USUARIO.nome} sem pendências.`
    return registrarSistema(
      { ...v, situacao: 'certificada', errosLiberados: [...v.errosLiberados, ...novas] },
      texto,
    )
  })
}

/* ------------------------------------------------------------------ *
 * Derivações
 * ------------------------------------------------------------------ */
export function contarPorSituacao(visitas: Visita[], id: SituacaoId): number {
  return visitas.filter((v) => v.situacao === id).length
}

export function gruposDeRateio(cargas: Carga[]): GrupoRateio[] {
  const mapa = new Map<string, Carga[]>()
  cargas
    .filter((c) => c.rateio && c.grupoRateio)
    .forEach((c) => {
      const lista = mapa.get(c.grupoRateio!) ?? []
      lista.push(c)
      mapa.set(c.grupoRateio!, lista)
    })

  return [...mapa.entries()]
    .map(([id, lista]) => ({
      id,
      cargas: lista,
      pesoLiquidoTotal: lista.reduce((s, c) => s + c.pesoLiquido, 0),
      pesoComDescontoTotal: lista.reduce((s, c) => s + c.pesoComDesconto, 0),
      data: lista[0].data,
      hora: lista[0].hora,
      placa: lista[0].placa,
      classificacao: lista[0].classificacao,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export const percentualDesconto = (c: Carga): number =>
  c.pesoLiquido > 0 ? ((c.pesoLiquido - c.pesoComDesconto) / c.pesoLiquido) * 100 : 0

/* ------------------------------------------------------------------ *
 * Catálogo de PDRs
 * ------------------------------------------------------------------ */
let pdrsCatalogo: PdrCatalogo[] = PDRS_CATALOGO_INICIAIS
const ouvintesPdr = new Set<() => void>()

function notificarPdr() {
  ouvintesPdr.forEach((fn) => fn())
}

export function usePdrsCatalogo(): PdrCatalogo[] {
  return useSyncExternalStore(
    (fn) => { ouvintesPdr.add(fn); return () => ouvintesPdr.delete(fn) },
    () => pdrsCatalogo,
    () => pdrsCatalogo,
  )
}

export function adicionarPdr(pdr: PdrCatalogo) {
  if (pdrsCatalogo.some((p) => p.cnpj === pdr.cnpj)) return false
  pdrsCatalogo = [...pdrsCatalogo, pdr]
  notificarPdr()
  return true
}

export function removerPdr(cnpj: string) {
  pdrsCatalogo = pdrsCatalogo.filter((p) => p.cnpj !== cnpj)
  notificarPdr()
}

/** busca PDR pelo CNPJ no catálogo */
export function buscarPdrPorCnpj(cnpj: string): PdrCatalogo | undefined {
  return pdrsCatalogo.find((p) => p.cnpj === cnpj)
}

/* ------------------------------------------------------------------ *
 * Criação de visita "fake" (INSERÇÃO_AUTO) para importação de acumulado
 * ------------------------------------------------------------------ */
let contadorFake = 900000

export function criarVisitaFake(pdr: PdrCatalogo, data: string): Visita {
  const cod = ++contadorFake
  return {
    cod,
    data,
    envioTablet: data,
    pdr: {
      nome: pdr.nome,
      cnpj: pdr.cnpj,
      cidade: pdr.cidade,
      uf: pdr.uf,
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
    },
    acumulado: {
      informadoPeloPdr: 'Não',
      origem: 'PDR',
      valores: { Negativa: 0, Declarada: 0, Positiva: 0, Participante: 0 },
    },
    procedimentos: [],
    historico: [],
    cargas: [],
    ocorrencias: [],
    mensagens: [],
    errosLiberados: [],
    motivo: 'INSERÇÃO_AUTO — visita criada via importação de acumulado',
  }
}

/** adiciona uma visita ao store */
export function adicionarVisita(visita: Visita) {
  estado = [...estado, visita]
  notificar()
}

/* ------------------------------------------------------------------ *
 * Importação de acumulado
 * ------------------------------------------------------------------ */

/** busca visita por CNPJ; ordena da mais recente para a mais antiga */
export function visitasPorCnpj(cnpj: string): Visita[] {
  return estado
    .filter((v) => v.pdr.cnpj === cnpj)
    .sort((a, b) => {
      const parse = (d: string) => {
        const [dia, mes, ano] = d.split('/').map(Number)
        return new Date(ano, mes - 1, dia).getTime()
      }
      return parse(b.data) - parse(a.data)
    })
}

/** retorna os acumulados importados (visitas com INSERÇÃO_AUTO) por CNPJ/data */
export function acumuladoJaExiste(cnpj: string, dtLancamento: string): Visita | undefined {
  return estado.find(
    (v) =>
      v.pdr.cnpj === cnpj &&
      v.data === dtLancamento &&
      v.consultor === 'INSERÇÃO_AUTO',
  )
}

/**
 * Retorna o último acumulado importado para o CNPJ. Quando o município é
 * informado, a comparação fica restrita a ele — um CNPJ com unidades em
 * cidades diferentes não deve ter seus acumulados misturados.
 */
export function ultimoAcumuladoImportado(
  cnpj: string,
  municipio?: string,
): { data: string; valores: Record<Classificacao, number> } | undefined {
  const alvo = municipio?.trim().toUpperCase()
  const visitas = estado
    .filter(
      (v) =>
        v.pdr.cnpj === cnpj &&
        v.consultor === 'INSERÇÃO_AUTO' &&
        (!alvo || v.pdr.cidade.toUpperCase() === alvo),
    )
    .sort((a, b) => {
      const parse = (d: string) => {
        const [dia, mes, ano] = d.split('/').map(Number)
        return new Date(ano, mes - 1, dia).getTime()
      }
      return parse(b.data) - parse(a.data)
    })
  const ultima = visitas[0]
  if (!ultima) return undefined
  return { data: ultima.data, valores: { ...ultima.acumulado.valores } }
}

/** municípios distintos encontrados para um CNPJ nos dados existentes */
export function municipiosDoCnpj(cnpj: string): string[] {
  const cidades = new Set(estado.filter((v) => v.pdr.cnpj === cnpj).map((v) => v.pdr.cidade))
  return [...cidades].sort()
}

/** importa uma linha de acumulado, criando ou atualizando visita */
export function importarAcumulado(
  item: AcumuladoImportado,
  municipioEscolhido?: string,
): { acao: 'criado' | 'atualizado'; cod: number } {
  const existente = acumuladoJaExiste(item.cnpj, item.dtLancamento)

  const valores: Record<Classificacao, number> = {
    Negativa: item.kgNegativa,
    Declarada: item.kgDeclarada,
    Positiva: item.kgPositiva,
    Participante: item.kgParticipante,
  }

  if (existente) {
    alterarVisita(existente.cod, (v) => ({
      ...v,
      data: item.dtLancamento,
      pdr: {
        ...v.pdr,
        nome: item.nomePdr || v.pdr.nome,
        cidade: municipioEscolhido ?? item.municipio ?? v.pdr.cidade,
        uf: item.uf || v.pdr.uf,
      },
      acumulado: {
        ...v.acumulado,
        valores,
      },
    }))
    return { acao: 'atualizado', cod: existente.cod }
  }

  const pdrDoCatalogo = buscarPdrPorCnpj(item.cnpj)
  const pdr: PdrCatalogo = {
    nome: item.nomePdr || pdrDoCatalogo?.nome || '-',
    cnpj: item.cnpj,
    cidade: municipioEscolhido ?? item.municipio ?? pdrDoCatalogo?.cidade ?? '-',
    uf: item.uf || pdrDoCatalogo?.uf || '-',
  }

  const visita = criarVisitaFake(pdr, item.dtLancamento)
  visita.acumulado = { ...visita.acumulado, valores }
  visita.pdr.nome = pdr.nome
  visita.pdr.cidade = pdr.cidade
  visita.pdr.uf = pdr.uf

  adicionarVisita(visita)
  return { acao: 'criado', cod: visita.cod }
}

/* ------------------------------------------------------------------ *
 * Relatórios de importação de acumulado — histórico para consulta
 * ------------------------------------------------------------------ */
let relatoriosImportacao: RelatorioAcumulado[] = []
const ouvintesRelatorios = new Set<() => void>()
let sequenciaRelatorio = 0

function notificarRelatorios() {
  ouvintesRelatorios.forEach((fn) => fn())
}

export function useRelatoriosImportacao(): RelatorioAcumulado[] {
  return useSyncExternalStore(
    (fn) => { ouvintesRelatorios.add(fn); return () => ouvintesRelatorios.delete(fn) },
    () => relatoriosImportacao,
    () => relatoriosImportacao,
  )
}

/** guarda o resultado de uma importação de acumulado para consulta posterior */
export function registrarRelatorioImportacao(
  nomeArquivo: string,
  sucesso: DetalheAcumuladoImportado[],
  alerta: DetalheAcumuladoImportado[],
  vermelho: DetalheAcumuladoImportado[],
): RelatorioAcumulado {
  const relatorio: RelatorioAcumulado = {
    id: `REL-${++sequenciaRelatorio}`,
    ts: Date.now(),
    nomeArquivo,
    importadoPor: USUARIO.nome,
    sucesso,
    alerta,
    vermelho,
  }
  relatoriosImportacao = [relatorio, ...relatoriosImportacao]
  notificarRelatorios()
  return relatorio
}

/* ------------------------------------------------------------------ *
 * Solicitações — pedidos de exclusão de carga, inserção de dados e
 * acumulado, tratados em quadro kanban com chat e anexos
 * ------------------------------------------------------------------ */
let solicitacoes: Solicitacao[] = SOLICITACOES_INICIAIS
const ouvintesSolicitacoes = new Set<() => void>()
let sequenciaSolicitacao = Math.max(0, ...solicitacoes.map((s) => s.numero))
let sequenciaMensagemSolicitacao = 0
let sequenciaAnexo = 0

function notificarSolicitacoes() {
  ouvintesSolicitacoes.forEach((fn) => fn())
}

export function useSolicitacoes(): Solicitacao[] {
  return useSyncExternalStore(
    (fn) => { ouvintesSolicitacoes.add(fn); return () => ouvintesSolicitacoes.delete(fn) },
    () => solicitacoes,
    () => solicitacoes,
  )
}

function alterarSolicitacao(id: string, fn: (s: Solicitacao) => Solicitacao) {
  solicitacoes = solicitacoes.map((s) => (s.id === id ? fn(s) : s))
  notificarSolicitacoes()
}

/** remove definitivamente a solicitação — quem pode chamar isso é decidido na tela */
export function excluirSolicitacao(id: string) {
  solicitacoes = solicitacoes.filter((s) => s.id !== id)
  notificarSolicitacoes()
}

/** cria uma nova solicitação — descrição e anexos iniciais já entram como a 1ª mensagem do chat */
export function criarSolicitacao(dados: {
  tipo: TipoSolicitacao
  titulo: string
  descricao: string
  motivo?: string
  visitaCod?: number
  cargaId?: string
  solicitante: string
  anexos?: AnexoArquivo[]
}): Solicitacao {
  const agora = Date.now()
  const numero = ++sequenciaSolicitacao
  const anexos = dados.anexos ?? []
  const nova: Solicitacao = {
    id: `SOL-${numero}`,
    numero,
    tipo: dados.tipo,
    titulo: dados.titulo,
    descricao: dados.descricao,
    motivo: dados.motivo,
    visitaCod: dados.visitaCod,
    cargaId: dados.cargaId,
    status: 'pendente',
    solicitante: dados.solicitante,
    participantes: [],
    criadoEm: agora,
    atualizadoEm: agora,
    mensagens:
      dados.descricao || anexos.length > 0
        ? [
            {
              id: `MSG-SOL-${++sequenciaMensagemSolicitacao}`,
              autor: dados.solicitante,
              texto: dados.descricao,
              ts: agora,
              anexos,
            },
          ]
        : [],
  }
  solicitacoes = [nova, ...solicitacoes]
  notificarSolicitacoes()
  return nova
}

/** move o card entre as colunas do quadro — pendente, análise, feito */
export function moverSolicitacao(id: string, status: StatusSolicitacao) {
  alterarSolicitacao(id, (s) => ({ ...s, status, atualizadoEm: Date.now() }))
}

/** registra um arquivo anexado ao chat — guarda só metadados + object URL local */
export function criarAnexo(file: File): AnexoArquivo {
  return {
    id: `ANEXO-${++sequenciaAnexo}`,
    nome: file.name,
    tamanho: file.size,
    tipo: file.type || 'application/octet-stream',
    url: URL.createObjectURL(file),
  }
}

export function enviarMensagemSolicitacao(
  id: string,
  autor: string,
  texto: string,
  anexos: AnexoArquivo[] = [],
) {
  const agora = Date.now()
  alterarSolicitacao(id, (s) => ({
    ...s,
    atualizadoEm: agora,
    mensagens: [
      ...s.mensagens,
      { id: `MSG-SOL-${++sequenciaMensagemSolicitacao}`, autor, texto, ts: agora, anexos },
    ],
  }))
}

/** anexa uma pessoa ao chat da solicitação — participa das mensagens a partir de agora */
export function adicionarParticipante(id: string, nome: string) {
  alterarSolicitacao(id, (s) =>
    s.participantes.includes(nome) || s.solicitante === nome
      ? s
      : { ...s, participantes: [...s.participantes, nome] },
  )
}
