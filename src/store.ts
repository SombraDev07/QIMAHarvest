import { useEffect, useSyncExternalStore } from 'react'
import {
  VISITAS_INICIAIS,
  PDRS_CATALOGO_INICIAIS,
  SOLICITACOES_INICIAIS,
  USUARIOS_INICIAIS,
  reservarIdCarga,
} from './data/mock'
import { regrasAtivasPadrao } from './regras'
import {
  dataComparavel,
  mascaraCpfCnpj,
  mascaraPlaca,
  mascaraProdutor,
  mascaraRomaneio,
  normalizarHora,
} from './format'
import {
  CAIXA_FITA_MAX,
  CAIXA_FITA_MIN,
  type Acumulado,
  type AcumuladoImportado,
  type AcumuladoPeriodo,
  type AnexoArquivo,
  type Carga,
  type Classificacao,
  type DadosVisita,
  type DiaAnterior,
  type DetalheAcumuladoImportado,
  type ErroLiberado,
  type GrupoRateio,
  type HistoricoAcumulado,
  type Mensagem,
  type ParametrosRegras,
  type PdrCatalogo,
  type RelatorioAcumulado,
  type Solicitacao,
  type StatusSolicitacao,
  type SimNao,
  type SituacaoId,
  type SituacaoPdr,
  type TipoSolicitacao,
  type Usuario,
  type Visita,
  type LogAlteracao,
  CLASSIFICACOES,
  SENHA_MIN,
  TIPO_OCORRENCIA_FITAS,
  podeDefinirCredenciais,
  podeEditarVisita,
} from './types'
import {
  aplicarPatches,
  type PatchCarga,
  type PatchVolumes,
  type ResumoCorrecao,
} from './importacao/correcao'
import { bancoAtivo, supabase } from './backend/cliente'
import {
  apagarTodasVisitas,
  carregarBoot,
  carregarVisitaCompleta,
  carregarVisitasPorCods,
  carregarVisitasPorIdsCarga,
  consultarPontosUnidade,
  importarVisitasLote,
  maiorCodVisita,
  persistirParametros,
  persistirPdrs,
  persistirUsuarios,
  persistirVisitas,
  type PontoUnidade,
} from './backend/persistir'
import {
  apagarSolicitacao as apagarSolicitacaoRemota,
  carregarSolicitacoes,
  persistirSolicitacao,
} from './backend/solicitacoes'

/* ------------------------------------------------------------------ *
 * Store em memória. Substituir estas funções por chamadas HTTP quando
 * houver API — a camada de telas não muda.
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * Persistência local. Sem isto um F5 no meio de uma correção joga fora
 * o trabalho do analista. Enquanto não existe API, o localStorage
 * segura o estado entre sessões.
 * ------------------------------------------------------------------ */
const CHAVE_PERSISTENCIA = 'qima-harvest/estado'
const CHAVE_SESSAO = 'qima-harvest/sessao'
/** v2: só os dois admins na semente; descartar os 13 usuários de demonstração */
const VERSAO_PERSISTENCIA = 2
/** tempo sem novas alterações antes de gravar — evita serializar a cada tecla */
const ATRASO_GRAVACAO_MS = 500

interface EstadoPersistido {
  versao: number
  /**
   * só as visitas que o usuário mexeu, não a base inteira. Gravar as 261
   * passaria de 5 MB e estouraria a cota de localStorage — a gravação falharia
   * calada e o analista acharia que o trabalho estava salvo. De quebra, manter
   * o resto vindo da base deixa uma atualização dos dados originais chegar a
   * quem já tem storage.
   */
  visitas: Visita[]
  parametros: ParametrosRegras
  pdrs: PdrCatalogo[]
  solicitacoes: Solicitacao[]
  usuarios: Usuario[]
  usuarioLogadoId: string | null
  /**
   * true depois de uma importação em lote: a base de demonstração deixa de ser
   * a origem e só valem as visitas gravadas. Sem esta marca, o reload traria
   * as visitas do gerador de volta e elas se somariam às importadas.
   */
  baseSubstituida?: boolean
}

const temArmazenamento = () => {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function lerPersistido(): EstadoPersistido | null {
  if (!temArmazenamento()) return null
  try {
    const cru = localStorage.getItem(CHAVE_PERSISTENCIA)
    if (!cru) return null
    const dados = JSON.parse(cru) as EstadoPersistido
    return dados?.versao === VERSAO_PERSISTENCIA ? dados : null
  } catch {
    // JSON corrompido ou storage bloqueado: cair para os dados iniciais é
    // melhor que subir a tela quebrada
    return null
  }
}

const persistido = lerPersistido()

let gravacaoAgendada: ReturnType<typeof setTimeout> | undefined
/** true enquanto o boot lê o Supabase — não regrava o que acabou de chegar */
let hidratando = false
/** import/limpar: o próximo flush apaga o remoto antes de subir o estado novo */
let zerarRemoto = false
/** ignora eco do Realtime logo depois de um save nosso */
let ignorarRealtimeAte = 0

/**
 * Um anexo é gravado como object URL (`blob:`), que só vale enquanto o
 * documento vive. Depois do reload o link estaria morto, então a mensagem
 * volta sem o anexo em vez de voltar com um link quebrado.
 */
const semAnexosMortos = (lista: Solicitacao[]): Solicitacao[] =>
  lista.map((s) => ({
    ...s,
    mensagens: s.mensagens.map((m) =>
      m.anexos.some((a) => a.url.startsWith('blob:')) ? { ...m, anexos: [] } : m,
    ),
  }))

/**
 * Última falha de gravação. Existe porque engolir o erro em silêncio é o pior
 * dos mundos: o analista continua trabalhando achando que está salvo e perde
 * tudo no F5. A tela mostra o aviso; o app segue funcionando em memória.
 */
let falhaPersistencia: string | null = null
const ouvintesFalha = new Set<() => void>()

export function useFalhaPersistencia(): string | null {
  return useSyncExternalStore(
    (fn) => {
      ouvintesFalha.add(fn)
      return () => ouvintesFalha.delete(fn)
    },
    () => falhaPersistencia,
    () => falhaPersistencia,
  )
}

function registrarFalha(mensagem: string | null) {
  if (falhaPersistencia === mensagem) return
  falhaPersistencia = mensagem
  ouvintesFalha.forEach((fn) => fn())
}

let versaoConsultas = 0
const ouvintesConsultas = new Set<() => void>()
let invalidarConsultasAgendado: ReturnType<typeof setTimeout> | null = null

export function invalidarConsultas() {
  versaoConsultas += 1
  ouvintesConsultas.forEach((fn) => fn())
}

function agendarInvalidarConsultas() {
  if (invalidarConsultasAgendado) clearTimeout(invalidarConsultasAgendado)
  invalidarConsultasAgendado = setTimeout(() => {
    invalidarConsultasAgendado = null
    invalidarConsultas()
  }, 400)
}

export function useVersaoConsultas(): number {
  return useSyncExternalStore(
    (fn) => {
      ouvintesConsultas.add(fn)
      return () => ouvintesConsultas.delete(fn)
    },
    () => versaoConsultas,
    () => versaoConsultas,
  )
}

const pontosPorCnpj = new Map<string, PontoUnidade[]>()
const visitasAusentes = new Set<number>()
const visitasPedidas = new Set<number>()

function notificarLeitura() {
  ouvintes.forEach((fn) => fn())
}

async function gravarNoBanco() {
  ignorarRealtimeAte = Date.now() + 2500
  try {
    if (zerarRemoto) {
      await apagarTodasVisitas()
      zerarRemoto = false
    }
    const alterar = estado.filter((v) => visitasAlteradas.has(v.cod))
    if (alterar.length) await persistirVisitas(alterar)
    await persistirPdrs(pdrsCatalogo)
    await persistirParametros(parametros)
    registrarFalha(null)
    invalidarConsultas()
    try {
      await persistirUsuarios(usuarios)
    } catch (e) {
      registrarFalha(
        e instanceof Error ? `Usuários no banco: ${e.message}` : 'Falha ao gravar usuários.',
      )
    }
  } catch (e) {
    registrarFalha(
      e instanceof Error ? `Supabase: ${e.message}` : 'Falha ao gravar no banco.',
    )
  }
}

/** tamanho do que seria gravado agora, para a tela mostrar quanto já se usa */
export function tamanhoPersistido(): number {
  try {
    return localStorage.getItem(CHAVE_PERSISTENCIA)?.length ?? 0
  } catch {
    return 0
  }
}

function agendarGravacao() {
  if (hidratando) return
  if (bancoAtivo()) {
    clearTimeout(gravacaoAgendada)
    gravacaoAgendada = setTimeout(() => {
      void gravarNoBanco()
    }, ATRASO_GRAVACAO_MS)
    return
  }
  if (!temArmazenamento()) return
  clearTimeout(gravacaoAgendada)
  gravacaoAgendada = setTimeout(() => {
    const dados: EstadoPersistido = {
      versao: VERSAO_PERSISTENCIA,
      visitas: estado.filter((v) => visitasAlteradas.has(v.cod)),
      parametros,
      pdrs: pdrsCatalogo,
      solicitacoes,
      usuarios,
      usuarioLogadoId,
      baseSubstituida,
    }

    try {
      localStorage.setItem(CHAVE_PERSISTENCIA, JSON.stringify(dados))
      registrarFalha(null)
    } catch (e) {
      const cota = e instanceof DOMException && /quota/i.test(e.name)
      const bytes = JSON.stringify(dados).length
      const tamanho =
        bytes < 1024 * 1024
          ? `${Math.round(bytes / 1024)} KB`
          : `${(bytes / 1024 / 1024).toFixed(1)} MB`
      registrarFalha(
        cota
          ? `O navegador recusou gravar ${tamanho} — a cota de armazenamento estourou. As alterações desta sessão continuam na tela, mas serão perdidas ao recarregar.`
          : 'Não foi possível gravar no navegador (modo privativo ou armazenamento bloqueado). As alterações serão perdidas ao recarregar.',
      )
    }
  }, ATRASO_GRAVACAO_MS)
}

/** Administração → volta a base para os dados originais */
export function limparPersistencia() {
  if (!temArmazenamento()) return
  try {
    clearTimeout(gravacaoAgendada)
    localStorage.removeItem(CHAVE_PERSISTENCIA)
  } catch {
    // nada a fazer: sem storage não há o que limpar
  }
}

/**
 * Passa a base pelas mesmas máscaras do formulário e da importação, para que
 * carga antiga e carga nova sigam a mesma regra. Só normaliza texto: peso e
 * data ficam intactos, porque alterá-los mudaria o resultado da análise em vez
 * de padronizar a digitação.
 */
function normalizarCarga(c: Carga): Carga {
  return {
    ...c,
    hora: normalizarHora(c.hora) ?? c.hora,
    placa: mascaraPlaca(c.placa),
    produtor: mascaraProdutor(c.produtor),
    romaneio: mascaraRomaneio(c.romaneio),
    cpfCnpjProdutor: mascaraCpfCnpj(c.cpfCnpjProdutor),
  }
}

/** cods que o usuário alterou nesta máquina — é só isso que vai para o storage */
const visitasAlteradas = new Set<number>((persistido?.visitas ?? []).map((v) => v.cod))

/**
 * A base vem do mock; por cima dela entram as visitas alteradas que estavam no
 * storage, e depois as que foram criadas do zero. As máscaras são idempotentes,
 * então aplicá-las aos dois lados é seguro.
 */
let baseSubstituida = persistido?.baseSubstituida ?? false

function montarEstadoInicial(): Visita[] {
  const normalizar = (v: Visita): Visita => ({
    ...v,
    diaAnterior: v.diaAnterior ?? [],
    logAlteracoes: v.logAlteracoes ?? [],
    cargas: v.cargas.map(normalizarCarga),
  })

  // base substituída: o gerador não entra mais, nem para completar
  if (baseSubstituida) return (persistido?.visitas ?? []).map(normalizar)

  const salvas = new Map((persistido?.visitas ?? []).map((v) => [v.cod, v]))
  const daBase = VISITAS_INICIAIS.map((v) => salvas.get(v.cod) ?? v)
  const codsDaBase = new Set(VISITAS_INICIAIS.map((v) => v.cod))
  const criadas = [...salvas.values()].filter((v) => !codsDaBase.has(v.cod))
  return [...daBase, ...criadas].map(normalizar)
}

let estado: Visita[] = bancoAtivo() ? [] : montarEstadoInicial()
const ouvintes = new Set<() => void>()

/** o maior sufixo numérico de ids como "MSG-LOCAL-12", para a sequência continuar dali */
const maiorSufixo = (ids: string[]) =>
  ids.reduce((max, id) => {
    const n = Number(id.split('-').pop())
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, 0)

// contadores reiniciam a cada carga da página; sem realinhá-los com o que veio
// do storage, ids novos colidiriam com registros já existentes
estado.forEach((v) => v.cargas.forEach((c) => reservarIdCarga(c.id)))

function notificar() {
  ouvintes.forEach((fn) => fn())
  agendarGravacao()
  if (bancoAtivo()) agendarInvalidarConsultas()
}

function subscrever(fn: () => void) {
  ouvintes.add(fn)
  return () => ouvintes.delete(fn)
}

const snapshot = () => estado

export function useVisitas(): Visita[] {
  return useSyncExternalStore(subscrever, snapshot, snapshot)
}

function mesclarPontos(cnpj: string, pontos: PontoUnidade[]) {
  pontosPorCnpj.set(cnpj, pontos)
  for (const v of estado) {
    if (v.pdr.cnpj === cnpj && visitasAlteradas.has(v.cod)) upsertPonto(v)
  }
}

function pontoDeVisita(v: Visita): PontoUnidade {
  return {
    cod: v.cod,
    data: v.data,
    origem: v.acumulado.origem,
    valores: { ...v.acumulado.valores },
    cargas: v.cargas.length,
  }
}

function upsertPonto(v: Visita) {
  const lista = pontosPorCnpj.get(v.pdr.cnpj)
  // sem cache ainda, o histórico cai no estado em memória — criar um cache
  // só com esta visita apagaria os outros dias da unidade na análise e na tela
  if (!lista) return
  const i = lista.findIndex((p) => p.cod === v.cod || p.data === v.data)
  const ponto = pontoDeVisita(v)
  if (i >= 0) lista[i] = ponto
  else lista.push(ponto)
  pontosPorCnpj.set(v.pdr.cnpj, lista)
}

export function colocarNoCache(v: Visita, marcarAlterada = false) {
  const normalizada: Visita = {
    ...v,
    diaAnterior: v.diaAnterior ?? [],
    logAlteracoes: v.logAlteracoes ?? [],
    cargas: v.cargas.map(normalizarCarga),
  }
  const i = estado.findIndex((x) => x.cod === v.cod)
  estado = i >= 0
    ? estado.map((x) => (x.cod === v.cod ? normalizada : x))
    : [...estado, normalizada]
  visitasAusentes.delete(v.cod)
  normalizada.cargas.forEach((c) => reservarIdCarga(c.id))
  upsertPonto(normalizada)
  if (marcarAlterada) {
    visitasAlteradas.add(v.cod)
    notificar()
    return
  }
  notificarLeitura()
}

export async function garantirVisitasNoCache(cods: number[]): Promise<void> {
  if (!bancoAtivo() || cods.length === 0) return
  const faltando = [...new Set(cods)].filter((c) => !estado.some((v) => v.cod === c))
  if (faltando.length === 0) return
  const carregadas = await carregarVisitasPorCods(faltando)
  for (const v of carregadas) colocarNoCache(v)
}

export async function garantirVisitasPorCargas(ids: string[]): Promise<void> {
  if (!bancoAtivo() || ids.length === 0) return
  const carregadas = await carregarVisitasPorIdsCarga(ids)
  for (const v of carregadas) colocarNoCache(v)
}

async function recarregarVisita(cod: number) {
  try {
    const v = await carregarVisitaCompleta(cod)
    if (v) {
      const pontos = await consultarPontosUnidade(v.pdr.cnpj)
      mesclarPontos(v.pdr.cnpj, pontos)
      if (visitasAlteradas.has(cod)) {
        const local = estado.find((x) => x.cod === cod)
        if (local) upsertPonto(local)
        notificarLeitura()
        return
      }
      colocarNoCache(v)
    } else {
      visitasAusentes.add(cod)
      estado = estado.filter((x) => x.cod !== cod)
      notificarLeitura()
    }
  } catch {
    visitasPedidas.delete(cod)
  } finally {
    visitasPedidas.delete(cod)
  }
}

export function useVisita(cod: number): Visita | undefined {
  const lista = useVisitas()
  const local = lista.find((v) => v.cod === cod)
  useEffect(() => {
    if (!bancoAtivo() || !cod || local || visitasAusentes.has(cod) || visitasPedidas.has(cod)) return
    visitasPedidas.add(cod)
    notificarLeitura()
    void recarregarVisita(cod)
  }, [cod, local])
  return local
}

export function useVisitaCarregando(cod: number): boolean {
  useVisitas()
  return bancoAtivo() && Boolean(cod) && !obterVisita(cod) && !visitasAusentes.has(cod)
}

/** leitura fora de componente (ex.: testes) — nas telas use useVisita */
export function obterVisita(cod: number): Visita | undefined {
  return estado.find((v) => v.cod === cod)
}

function alterarVisita(cod: number, fn: (v: Visita) => Visita) {
  estado = estado.map((v) => (v.cod === cod ? ajustarRecebimento(fn(v)) : v))
  visitasAlteradas.add(cod)
  const atual = estado.find((v) => v.cod === cod)
  if (atual) upsertPonto(atual)
  notificar()
}

/**
 * 2.2 — houve recebimento só quando existe carga acompanhada. Visita só com
 * não acompanhadas (ou sem carga) não é recebimento de soja.
 */
function ajustarRecebimento(v: Visita): Visita {
  const temAcompanhada = v.cargas.some((c) => c.acompanhada)
  const esperado: SimNao = temAcompanhada ? 'Sim' : 'Não'
  if (temAcompanhada || v.cargas.length > 0) {
    if (v.dadosVisita.recebimentoCargas === esperado) return v
    return { ...v, dadosVisita: { ...v.dadosVisita, recebimentoCargas: esperado } }
  }
  return v
}

/* ------------------------------------------------------------------ *
 * Ações
 * ------------------------------------------------------------------ */
/** digitação de acumulado/dia anterior grava a cada tecla — junta na mesma entrada */
const JANELA_LOG_MS = 20_000

function appendLog(
  v: Visita,
  patch: Pick<LogAlteracao, 'origem' | 'tipo' | 'chave' | 'resumo'> & { planilha?: string },
): Visita {
  const lista = v.logAlteracoes ?? []
  const item: LogAlteracao = {
    id: `LOG-${v.cod}-${Date.now()}-${lista.length}`,
    ts: Date.now(),
    por: obterUsuarioLogado().nome,
    planilha: patch.planilha ?? 'tela',
    origem: patch.origem,
    tipo: patch.tipo,
    chave: patch.chave,
    resumo: patch.resumo,
  }
  const ultimo = lista.at(-1)
  const juntaDigitacao =
    (item.tipo === 'acumulado' || item.tipo === 'dia-anterior') &&
    ultimo &&
    ultimo.origem === item.origem &&
    ultimo.tipo === item.tipo &&
    ultimo.chave === item.chave &&
    ultimo.por === item.por &&
    item.ts - ultimo.ts < JANELA_LOG_MS
  if (juntaDigitacao && ultimo) {
    return { ...v, logAlteracoes: [...lista.slice(0, -1), { ...item, id: ultimo.id }] }
  }
  return { ...v, logAlteracoes: [...lista, item] }
}

function resumoDiffCarga(antes: Carga | undefined, depois: Carga): string {
  if (!antes) return `Carga ${depois.id} inserida`
  const partes: string[] = []
  if (antes.produtor !== depois.produtor) partes.push('produtor')
  if (antes.romaneio !== depois.romaneio) partes.push('romaneio')
  if (antes.pesoLiquido !== depois.pesoLiquido) partes.push('peso líquido')
  if (antes.pesoComDesconto !== depois.pesoComDesconto) partes.push('peso c/ desconto')
  if (antes.classificacao !== depois.classificacao) partes.push('tecnologia')
  if (antes.data !== depois.data) partes.push('data')
  if (antes.hora !== depois.hora) partes.push('hora')
  if (antes.placa !== depois.placa) partes.push('placa')
  if (antes.acompanhada !== depois.acompanhada) partes.push('acompanhada')
  if (antes.rateio !== depois.rateio) partes.push('rateio')
  if (antes.fotoUrl !== depois.fotoUrl || antes.fotoPath !== depois.fotoPath) partes.push('foto')
  return partes.length ? `Carga ${depois.id}: ${partes.join(', ')}` : ''
}

export function salvarDadosVisita(cod: number, patch: Partial<DadosVisita>) {
  alterarVisita(cod, (v) => sincronizarOcorrenciaFitas({ ...v, dadosVisita: { ...v.dadosVisita, ...patch } }))
}

function sincronizarOcorrenciaFitas(v: Visita): Visita {
  if (v.dadosVisita.fitasAssociaveisCargas !== 'Não') return v
  if (v.ocorrencias.some((o) => o.tipo === TIPO_OCORRENCIA_FITAS || o.id === `OC-FITAS-${v.cod}`)) {
    return { ...v, dadosVisita: { ...v.dadosVisita, houveOcorrencia: 'Sim' } }
  }
  return {
    ...v,
    dadosVisita: { ...v.dadosVisita, houveOcorrencia: 'Sim' },
    ocorrencias: [
      ...v.ocorrencias,
      {
        id: `OC-FITAS-${v.cod}`,
        tipo: TIPO_OCORRENCIA_FITAS,
        gravidade: 'Média',
        descricao:
          'O PDR não guarda as fitas testadas de forma associável às cargas (regra 1.4).',
        data: v.data,
        status: 'Aberta',
      },
    ],
  }
}

export function salvarAcumulado(cod: number, patch: Partial<Acumulado>) {
  alterarVisita(cod, (v) => {
    const proximo = { ...v, acumulado: { ...v.acumulado, ...patch } }
    const campos: string[] = []
    if (patch.informadoPeloPdr && patch.informadoPeloPdr !== v.acumulado.informadoPeloPdr)
      campos.push(`informado=${patch.informadoPeloPdr}`)
    if (patch.origem && patch.origem !== v.acumulado.origem) campos.push(`origem=${patch.origem}`)
    if (patch.valores) {
      for (const k of Object.keys(patch.valores) as Classificacao[]) {
        if (patch.valores[k] !== v.acumulado.valores[k]) campos.push(`${k} ${patch.valores[k]}`)
      }
    }
    if (campos.length === 0) return proximo
    return appendLog(proximo, {
      origem: 'edicao',
      tipo: 'acumulado',
      chave: v.data,
      resumo: `Acumulado: ${campos.join(', ')}`,
    })
  })
}

/**
 * A tabela de Dia Anterior é derivada dos dias anteriores à visita: um dia por
 * linha, já completa desde o início. O storage guarda só o que o auditor
 * mexeu, indexado pela data — daí o upsert. Assim não há como criar duas
 * linhas para o mesmo dia pela tela.
 */
const ZERADO: Record<Classificacao, number> = {
  Negativa: 0,
  Declarada: 0,
  Positiva: 0,
  Participante: 0,
}

function upsertDiaAnterior(
  lista: DiaAnterior[],
  cod: number,
  data: string,
  patch: Partial<Omit<DiaAnterior, 'id' | 'data'>>,
): DiaAnterior[] {
  const existente = lista.find((d) => d.data === data)
  if (existente) {
    return lista.map((d) => (d.data === data ? { ...d, ...patch } : d))
  }
  return [
    ...lista,
    {
      id: `DA-${cod}-${data.replace(/\//g, '')}`,
      data,
      informouDiaAnterior: 'Não',
      valores: ZERADO,
      ...patch,
    },
  ]
}

/**
 * Voltar para "Não" zera as tecnologias: o padrão de um dia não informado é
 * 0/0/0/0, e deixar valor para trás guardaria um número que a tela não mostra.
 */
export function definirInformouDiaAnterior(cod: number, data: string, informou: SimNao) {
  alterarVisita(cod, (v) => {
    const atual = v.diaAnterior.find((d) => d.data === data)
    if (atual?.informouDiaAnterior === informou) return v
    return appendLog(
      {
        ...v,
        diaAnterior: upsertDiaAnterior(v.diaAnterior, cod, data, {
          informouDiaAnterior: informou,
          ...(informou === 'Não' ? { valores: ZERADO } : {}),
        }),
      },
      {
        origem: 'edicao',
        tipo: 'dia-anterior',
        chave: data,
        resumo: `Dia anterior ${data}: ${informou === 'Sim' ? 'informado' : 'não informado'}`,
      },
    )
  })
}

export function salvarDiaAnterior(
  cod: number,
  data: string,
  valores: Record<Classificacao, number>,
) {
  alterarVisita(cod, (v) => {
    const atual = v.diaAnterior.find((d) => d.data === data)
    if (atual && CLASSIFICACOES.every((c) => atual.valores[c] === valores[c])) return v
    return appendLog(
      { ...v, diaAnterior: upsertDiaAnterior(v.diaAnterior, cod, data, { valores }) },
      {
        origem: 'edicao',
        tipo: 'dia-anterior',
        chave: data,
        resumo: `Dia anterior ${data}: ${CLASSIFICACOES.map((c) => `${c} ${valores[c]}`).join(' · ')}`,
      },
    )
  })
}

/** o registro do dia, ou o padrão não-informado quando o auditor ainda não mexeu */
export function diaAnteriorDe(visita: Visita, data: string): DiaAnterior {
  return (
    visita.diaAnterior.find((d) => d.data === data) ?? {
      id: `DA-${visita.cod}-${data.replace(/\//g, '')}`,
      data,
      informouDiaAnterior: 'Não',
      valores: ZERADO,
    }
  )
}

/**
 * Visita daquela unidade naquele dia — é o que permite clicar numa linha do
 * histórico e abrir o registro correspondente. Devolve undefined quando não
 * existe visita para o par CNPJ/data.
 */
export function visitaPorCnpjEData(cnpj: string, data: string): Visita | undefined {
  return estado.find((v) => v.pdr.cnpj === cnpj && v.data === data)
}

export function codVisitaPorCnpjEData(cnpj: string, data: string): number | undefined {
  const local = visitaPorCnpjEData(cnpj, data)
  if (local) return local.cod
  return pontosPorCnpj.get(cnpj)?.find((p) => p.data === data)?.cod
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

/**
 * Grupo que ficou com uma única carga deixa de ser rateio — rateio só faz
 * sentido a partir de duas. Aplicado ao grupo de origem quando uma carga sai
 * dele (por exclusão ou por "Rateio: Não"), nunca ao grupo recém-criado, que
 * legitimamente começa com uma carga só à espera da segunda.
 */
function dissolverGrupoUnitario(cargas: Carga[], grupoId: string): Carga[] {
  if (cargas.filter((c) => c.grupoRateio === grupoId).length !== 1) return cargas
  return cargas.map((c) =>
    c.grupoRateio === grupoId ? { ...c, rateio: false, grupoRateio: undefined } : c,
  )
}

export function salvarCarga(cod: number, carga: Carga) {
  alterarVisita(cod, (v) => {
    const anterior = v.cargas.find((c) => c.id === carga.id)
    const base = anterior
      ? v.cargas.map((c) => (c.id === carga.id ? carga : c))
      : [...v.cargas, carga]
    const cargas = sincronizarGrupo(base, carga)
    const origem = anterior?.grupoRateio
    const resumo = resumoDiffCarga(anterior, carga)
    const proximo = {
      ...v,
      cargas:
        origem && origem !== carga.grupoRateio
          ? dissolverGrupoUnitario(cargas, origem)
          : cargas,
    }
    if (!resumo) return proximo
    return appendLog(proximo, {
      origem: 'edicao',
      tipo: 'carga',
      chave: carga.id,
      resumo,
    })
  })
}

export function adicionarCargas(cod: number, novas: Carga[]) {
  alterarVisita(cod, (v) => {
    let cargas = [...v.cargas, ...novas]
    novas.forEach((c) => {
      cargas = sincronizarGrupo(cargas, c)
    })
    const ids = novas.map((c) => c.id).join(', ')
    return appendLog(
      { ...v, cargas },
      {
        origem: 'edicao',
        tipo: 'carga',
        chave: novas.map((c) => c.id).join(','),
        resumo: novas.length === 1 ? `Carga ${ids} inserida` : `Cargas inseridas: ${ids}`,
      },
    )
  })
}

/**
 * Correção em lote: só atualiza o que já existe. Visita que ficar com erro
 * volta para a Central de Correção na 1ª passagem.
 */
export function aplicarCorrecoesEmMassa(
  input: {
    cargas?: PatchCarga[]
    diasAnteriores?: PatchVolumes[]
    acumulados?: PatchVolumes[]
  },
  meta: {
    arquivos: { cargas?: string; diaAnterior?: string; acumulado?: string }
    alertasDe: (v: Visita) => { id: string; regra: string; detalhe: string }[]
  },
): ResumoCorrecao & { reabertas: number[] } {
  const { visitas: novo, resumo, alteracoes } = aplicarPatches(estado, input)
  const por = obterUsuarioLogado().nome
  const ts = Date.now()
  const nomePlanilha = (tipo: 'cargas' | 'dia-anterior' | 'acumulado') => {
    if (tipo === 'cargas') return meta.arquivos.cargas || 'cargas'
    if (tipo === 'dia-anterior') return meta.arquivos.diaAnterior || 'dia-anterior'
    return meta.arquivos.acumulado || 'acumulado'
  }
  const arquivosUsados = [
    meta.arquivos.cargas,
    meta.arquivos.diaAnterior,
    meta.arquivos.acumulado,
  ].filter((n): n is string => Boolean(n))

  const porCod = new Map(novo.map((v) => [v.cod, ajustarRecebimento(v)]))
  const reabertas = new Set<number>()
  let seqLog = Date.now()

  const logsPorVisita = new Map<number, LogAlteracao[]>()
  for (const a of alteracoes) {
    const lista = logsPorVisita.get(a.cod) ?? []
    lista.push({
      id: `LOG-${a.cod}-${++seqLog}`,
      ts,
      por,
      origem: 'import-correcao',
      planilha: nomePlanilha(a.planilha),
      tipo: a.tipo,
      chave: a.chave,
      resumo: a.resumo,
    })
    logsPorVisita.set(a.cod, lista)
  }

  for (const [cod, logs] of logsPorVisita) {
    const atual = porCod.get(cod)
    if (!atual) continue
    let v: Visita = {
      ...atual,
      logAlteracoes: [...(atual.logAlteracoes ?? []), ...logs],
    }
    const erros = v.situacao === 'cancelada' ? [] : meta.alertasDe(v)
    if (erros.length > 0) {
      reabertas.add(cod)
      v = registrarSistema(
        {
          ...v,
          situacao: 'central-correcao',
          rodada: 1,
          avisoImport: { por, ts, arquivos: arquivosUsados, alertaIds: erros.map((e) => e.id) },
        },
        `Importação em massa por ${por} reabriu a visita na Central de Correção (1ª passagem). Planilha(s): ${arquivosUsados.join(', ') || '—'}. ${erros.length} erro(s).`,
      )
    } else {
      v = registrarSistema(
        { ...v, avisoImport: undefined },
        `Importação em massa por ${por} atualizou a visita sem gerar erro. Planilha(s): ${arquivosUsados.join(', ') || '—'}.`,
      )
    }
    porCod.set(cod, v)
    visitasAlteradas.add(cod)
  }

  estado = estado.map((v) => porCod.get(v.cod) ?? v)
  notificar()
  return { ...resumo, reabertas: [...reabertas] }
}

export function excluirCarga(cod: number, cargaId: string) {
  alterarVisita(cod, (v) => {
    const alvo = v.cargas.find((c) => c.id === cargaId)
    if (!alvo) return v
    const restantes = v.cargas.filter((c) => c.id !== cargaId)
    return appendLog(
      {
        ...v,
        cargas: alvo.grupoRateio
          ? dissolverGrupoUnitario(restantes, alvo.grupoRateio)
          : restantes,
      },
      {
        origem: 'edicao',
        tipo: 'carga',
        chave: cargaId,
        resumo: `Carga ${cargaId} excluída`,
      },
    )
  })
}

export function excluirCargas(cod: number, ids: string[]) {
  ids.forEach((id) => excluirCarga(cod, id))
}

/**
 * Move cargas entre acompanhadas e não acompanhadas. Se só parte de um rateio
 * muda de lado, essas cargas saem do grupo — o caminhão não pode ficar partido
 * nas duas abas. O grupo inteiro migrando permanece rateio.
 */
export function migrarCargas(cod: number, ids: string[], acompanhada: boolean) {
  if (ids.length === 0) return
  const idSet = new Set(ids)
  alterarVisita(cod, (v) => {
    const gruposParciais = new Set<string>()
    for (const c of v.cargas) {
      if (!c.grupoRateio || !idSet.has(c.id)) continue
      const membros = v.cargas.filter((x) => x.grupoRateio === c.grupoRateio)
      if (!membros.every((x) => idSet.has(x.id))) gruposParciais.add(c.grupoRateio)
    }

    const cargas = v.cargas.map((c) => {
      if (!idSet.has(c.id)) return c
      const next = { ...c, acompanhada }
      if (c.grupoRateio && gruposParciais.has(c.grupoRateio)) {
        return { ...next, rateio: false, grupoRateio: undefined }
      }
      return next
    })

    let resultado = cargas
    for (const grupo of gruposParciais) {
      resultado = dissolverGrupoUnitario(resultado, grupo)
    }
    const destino = acompanhada ? 'acompanhadas' : 'não acompanhadas'
    return appendLog(
      { ...v, cargas: resultado },
      {
        origem: 'edicao',
        tipo: 'carga',
        chave: ids.join(','),
        resumo: `Cargas ${ids.join(', ')} migradas para ${destino}`,
      },
    )
  })
}

/* ------------------------------------------------------------------ *
 * Conversa e fluxo da visita
 * ------------------------------------------------------------------ */
let sequenciaMensagem = maiorSufixo(estado.flatMap((v) => v.mensagens.map((m) => m.id)))

function novaMensagem(
  texto: string,
  tipo: Mensagem['tipo'],
  responsavel?: string,
): Mensagem {
  return {
    id: `MSG-LOCAL-${++sequenciaMensagem}`,
    autor: tipo === 'sistema' ? 'Sistema' : obterUsuarioLogado().nome,
    papel: tipo === 'sistema' ? 'Registro automático' : obterUsuarioLogado().perfil,
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
      {
        ...sincronizarOcorrenciaFitas(v),
        ultimaValidacao: { por: obterUsuarioLogado().nome, ts: Date.now(), erros, atencoes },
      },
      erros === 0 && atencoes === 0
        ? 'Validação executada: nenhuma inconsistência encontrada.'
        : `Validação executada: ${erros} erro(s) e ${atencoes} ponto(s) de atenção. Detalhes na aba Análise.`,
    ),
  )
}

/** Enviar para operação — devolve a visita ao time de campo */
export function enviarParaOperacao(cod: number) {
  alterarVisita(cod, (v) =>
    registrarSistema(
      { ...v, situacao: 'operacao-correcao' },
      `Visita enviada à Operação por ${obterUsuarioLogado().nome}.`,
    ),
  )
}

/** Certificar — grava as liberações de erro e fecha a visita */
/**
 * Operação devolve a visita para a Central. É esta transição que caracteriza a
 * segunda passagem — e ela não existia: o fluxo desenhava quatro etapas, mas o
 * código só sabia ir da Central para a Operação e certificar.
 */
export function devolverParaCentral(cod: number) {
  alterarVisita(cod, (v) =>
    registrarSistema(
      { ...v, situacao: 'central-correcao', rodada: v.rodada + 1 },
      `Visita enviada à Central por ${obterUsuarioLogado().nome}.`,
    ),
  )
}

export function certificarVisita(
  cod: number,
  liberacoes: Omit<ErroLiberado, 'por' | 'ts'>[],
  snapshot: { erros: number; atencoes: number } = { erros: 0, atencoes: 0 },
) {
  const ts = Date.now()
  const novas: ErroLiberado[] = liberacoes.map((l) => ({ ...l, por: obterUsuarioLogado().nome, ts }))
  const por = obterUsuarioLogado().nome

  alterarVisita(cod, (v) => {
    const comFitas = sincronizarOcorrenciaFitas(v)
    const texto = novas.length
      ? `Visita certificada por ${por} com ${novas.length} erro(s) liberado(s) mediante justificativa.`
      : `Visita certificada por ${por} sem pendências.`
    return registrarSistema(
      {
        ...comFitas,
        situacao: 'certificada',
        errosLiberados: [...comFitas.errosLiberados, ...novas],
        ultimaValidacao: { por, ts, erros: snapshot.erros, atencoes: snapshot.atencoes },
      },
      texto,
    )
  })
}

/** garimpo pós-certificação: a visita continua certificada */
export function marcarAnaliseFinal(cod: number, obs: string) {
  const por = obterUsuarioLogado().nome
  const ts = Date.now()
  alterarVisita(cod, (v) =>
    registrarSistema(
      { ...v, analiseFinal: { por, ts, obs: obs.trim() } },
      `Análise final conferida por ${por}. A certificação não muda.`,
    ),
  )
}

export function visitaNaAnaliseFinal(v: Visita): boolean {
  if (v.situacao !== 'certificada') return false
  if (v.analiseFinal) return true
  const erros = v.ultimaValidacao?.erros ?? 0
  const atencoes = v.ultimaValidacao?.atencoes ?? 0
  return erros + atencoes > 0 || v.errosLiberados.length > 0
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
/* ------------------------------------------------------------------ *
 * Usuários e sessão. O usuário logado fica aqui (e não numa constante de
 * módulo) porque o perfil dele decide o que a visita deixa editar — trocar
 * de usuário precisa repintar a tela.
 * ------------------------------------------------------------------ */
let usuarios: Usuario[] = persistido?.usuarios ?? USUARIOS_INICIAIS
const EM_TESTE = import.meta.env.MODE === 'test'

function lerSessao(): string | null {
  if (!temArmazenamento()) return null
  try {
    const cru = localStorage.getItem(CHAVE_SESSAO)
    if (!cru) return persistido?.usuarioLogadoId ?? null
    const dados = JSON.parse(cru) as { usuarioLogadoId?: string | null }
    return dados?.usuarioLogadoId ?? null
  } catch {
    return persistido?.usuarioLogadoId ?? null
  }
}

function gravarSessao() {
  if (!temArmazenamento()) return
  try {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ usuarioLogadoId }))
  } catch {
    // storage cheio ou bloqueado: a sessão fica só em memória nesta aba
  }
}

function idSessaoInicial(): string | null {
  const candidato = EM_TESTE
    ? persistido?.usuarioLogadoId ?? usuarios[0]?.id ?? null
    : lerSessao()
  if (candidato && usuarios.some((u) => u.id === candidato)) return candidato
  return EM_TESTE ? usuarios[0]?.id ?? null : null
}

let usuarioLogadoId: string | null = idSessaoInicial()
const ouvintesUsuarios = new Set<() => void>()

function notificarUsuarios() {
  gravarSessao()
  ouvintesUsuarios.forEach((fn) => fn())
  agendarGravacao()
}

const assinarUsuarios = (fn: () => void) => {
  ouvintesUsuarios.add(fn)
  return () => ouvintesUsuarios.delete(fn)
}

export function useUsuarios(): Usuario[] {
  return useSyncExternalStore(assinarUsuarios, () => usuarios, () => usuarios)
}

/** o usuário logado some quando a pessoa sai; nas telas protegidas ele existe */
function calcularLogado(): Usuario | null {
  if (!usuarioLogadoId) return null
  return usuarios.find((u) => u.id === usuarioLogadoId) ?? null
}

const GUEST: Usuario = {
  id: '',
  nome: '',
  login: '',
  perfil: 'Support',
  situacao: 'Ativo',
}

let logadoCache = calcularLogado()

export function useUsuarioLogado(): Usuario {
  return useSyncExternalStore(
    assinarUsuarios,
    () => logadoCache ?? GUEST,
    () => logadoCache ?? GUEST,
  )
}

export function useSessaoAtiva(): boolean {
  return useSyncExternalStore(
    assinarUsuarios,
    () => logadoCache !== null,
    () => logadoCache !== null,
  )
}

/** leitura fora de componente (ex.: testes) — nas telas use useUsuarios */
export function obterUsuarios(): Usuario[] {
  return usuarios
}

export function obterUsuarioLogado(): Usuario {
  return logadoCache ?? usuarios[0]
}

/** o perfil do usuário logado libera ou não a edição dos dados da visita */
export function usePodeEditarVisita(): boolean {
  return podeEditarVisita(useUsuarioLogado().perfil)
}

function atualizarLogado() {
  logadoCache = calcularLogado()
}

export function entrarComo(id: string) {
  if (!usuarios.some((u) => u.id === id)) return
  usuarioLogadoId = id
  atualizarLogado()
  notificarUsuarios()
}

/**
 * Confere login (sem diferenciar caixa) e senha. Não diz se o login existe —
 * a mensagem é a mesma para qualquer falha, inclusive conta inativa.
 */
export function autenticar(login: string, senha: string): { ok: boolean; erro?: string } {
  const alvo = login.trim().toLowerCase()
  const u = usuarios.find((x) => x.login.toLowerCase() === alvo)
  if (!u || u.situacao !== 'Ativo' || !u.senha || u.senha !== senha) {
    return { ok: false, erro: 'Login ou senha inválidos.' }
  }
  entrarComo(u.id)
  return { ok: true }
}

export function sair() {
  usuarioLogadoId = null
  atualizarLogado()
  notificarUsuarios()
}

function proximoIdUsuario(): string {
  const maior = usuarios.reduce((max, u) => {
    const n = Number(u.id.split('-').pop())
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, 0)
  return `U-${String(maior + 1).padStart(3, '0')}`
}

export function adicionarUsuario(dados: Omit<Usuario, 'id'>): Usuario {
  const novo: Usuario = { ...dados, id: proximoIdUsuario() }
  usuarios = [...usuarios, novo]
  atualizarLogado()
  notificarUsuarios()
  return novo
}

export function atualizarUsuario(id: string, patch: Partial<Omit<Usuario, 'id'>>) {
  usuarios = usuarios.map((u) => (u.id === id ? { ...u, ...patch } : u))
  atualizarLogado()
  notificarUsuarios()
}

export function removerUsuario(id: string) {
  // sem usuário não há sessão: o último cadastro não pode ser apagado
  if (usuarios.length <= 1) return false
  usuarios = usuarios.filter((u) => u.id !== id)
  if (usuarioLogadoId === id) usuarioLogadoId = usuarios[0].id
  atualizarLogado()
  notificarUsuarios()
  return true
}

export function emailJaCadastrado(email: string, ignorarId?: string): boolean {
  const alvo = email.trim().toLowerCase()
  if (!alvo) return false
  return usuarios.some((u) => (u.email ?? '').toLowerCase() === alvo && u.id !== ignorarId)
}

/** o login identifica a conta, então não pode repetir; comparação sem caixa */
export function loginJaCadastrado(login: string, ignorarId?: string): boolean {
  const alvo = login.trim().toLowerCase()
  if (!alvo) return false
  return usuarios.some((u) => u.login.toLowerCase() === alvo && u.id !== ignorarId)
}

/**
 * Login e senha são alterados à parte do resto do cadastro porque só o Admin
 * pode mexer neles — a checagem de perfil fica aqui, e não só na tela.
 */
export function definirCredenciais(id: string, login: string, senha?: string): boolean {
  if (!podeDefinirCredenciais(obterUsuarioLogado().perfil)) return false

  usuarios = usuarios.map((u) =>
    u.id === id
      ? { ...u, login: login.trim(), ...(senha === undefined ? {} : { senha: senha || undefined }) }
      : u,
  )
  atualizarLogado()
  notificarUsuarios()
  return true
}

/**
 * Troca da própria senha. Diferente de definirCredenciais, não exige Admin —
 * mas exige a senha atual, para que quem passe por uma sessão esquecida aberta
 * não consiga trancar a conta do dono. Quem ainda não tem senha define a
 * primeira sem informar nada.
 */
export function alterarMinhaSenha(atual: string, nova: string): { ok: boolean; erro?: string } {
  const usuario = obterUsuarioLogado()

  if (usuario.senha && usuario.senha !== atual) {
    return { ok: false, erro: 'Senha atual não confere.' }
  }
  if (nova.length < SENHA_MIN) {
    return { ok: false, erro: `A nova senha precisa de pelo menos ${SENHA_MIN} caracteres.` }
  }
  if (usuario.senha && nova === usuario.senha) {
    return { ok: false, erro: 'A nova senha é igual à atual.' }
  }

  usuarios = usuarios.map((u) => (u.id === usuario.id ? { ...u, senha: nova } : u))
  atualizarLogado()
  notificarUsuarios()
  return { ok: true }
}

/** compara só os dígitos: o mesmo CPF pode ter sido digitado com e sem pontuação */
export function cpfJaCadastrado(cpf: string, ignorarId?: string): boolean {
  const alvo = cpf.replace(/\D/g, '')
  if (!alvo) return false
  return usuarios.some((u) => (u.cpf ?? '').replace(/\D/g, '') === alvo && u.id !== ignorarId)
}

/* ------------------------------------------------------------------ *
 * Catálogo de PDRs
 * ------------------------------------------------------------------ */
/** o primeiro cadastro nasce com 9 dígitos, como no cadastro corporativo */
const ID_PDR_INICIAL = 100000001

/** estado gravado antes do id existir recebe um na subida, sem perder cadastro */
function normalizarCatalogo(lista: PdrCatalogo[]): PdrCatalogo[] {
  let proximo = ID_PDR_INICIAL
  const usados = new Set(lista.map((p) => p.id).filter(Boolean))
  return lista.map((p) => {
    if (p.id) return p
    while (usados.has(String(proximo))) proximo++
    const id = String(proximo++)
    usados.add(id)
    return { ...p, id }
  })
}

let pdrsCatalogo: PdrCatalogo[] = normalizarCatalogo(persistido?.pdrs ?? PDRS_CATALOGO_INICIAIS)
const ouvintesPdr = new Set<() => void>()

function notificarPdr() {
  ouvintesPdr.forEach((fn) => fn())
  agendarGravacao()
}

export function usePdrsCatalogo(): PdrCatalogo[] {
  return useSyncExternalStore(
    (fn) => { ouvintesPdr.add(fn); return () => ouvintesPdr.delete(fn) },
    () => pdrsCatalogo,
    () => pdrsCatalogo,
  )
}

/** leitura fora de componente (ex.: testes) — nas telas use usePdrsCatalogo */
export function obterPdrsCatalogo(): PdrCatalogo[] {
  return pdrsCatalogo
}

/**
 * Próximo id a partir do maior já usado — nunca de um contador de módulo, que
 * reiniciaria a cada carga da página e colidiria com o que veio do storage.
 */
function proximoIdPdr(): string {
  const maior = pdrsCatalogo.reduce((max, p) => {
    const n = Number(p.id)
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, ID_PDR_INICIAL - 1)
  return String(maior + 1)
}

/** true quando já existe outro cadastro com o mesmo documento — aviso, não bloqueio */
export function documentoJaCadastrado(cnpj: string, ignorarId?: string): boolean {
  return pdrsCatalogo.some((p) => p.cnpj === cnpj && p.id !== ignorarId)
}

/** o id é do sistema: quem chama informa só os dados do cadastro */
export function adicionarPdr(dados: Omit<PdrCatalogo, 'id'>): PdrCatalogo {
  const novo: PdrCatalogo = { ...dados, id: proximoIdPdr() }
  pdrsCatalogo = [...pdrsCatalogo, novo]
  notificarPdr()
  return novo
}

/**
 * Edição por id, e não por documento: é justamente o CPF/CNPJ que pode estar
 * errado e precisar de correção.
 */
export function atualizarPdr(id: string, patch: Partial<Omit<PdrCatalogo, 'id'>>) {
  pdrsCatalogo = pdrsCatalogo.map((p) => (p.id === id ? { ...p, ...patch } : p))
  notificarPdr()
}

export function removerPdr(id: string) {
  pdrsCatalogo = pdrsCatalogo.filter((p) => p.id !== id)
  notificarPdr()
}

/** ativa/inativa sem tirar do catálogo — o histórico da unidade continua valendo */
export function definirSituacaoPdr(id: string, situacao: SituacaoPdr) {
  pdrsCatalogo = pdrsCatalogo.map((p) => (p.id === id ? { ...p, situacao } : p))
  notificarPdr()
}

/**
 * Importação em lote. A planilha não traz o id, então o casamento é pelo
 * documento; quando o mesmo documento aparece em mais de um cadastro (unidades
 * distintas da mesma inscrição), todos recebem o nome e a situação da linha.
 */
export function importarPdrs(
  lista: Omit<PdrCatalogo, 'id'>[],
): { novos: number; atualizados: number } {
  let novos = 0
  let atualizados = 0
  let catalogo = [...pdrsCatalogo]
  let proximo = Number(proximoIdPdr())

  for (const pdr of lista) {
    const alvos = catalogo.filter((p) => p.cnpj === pdr.cnpj)
    if (alvos.length > 0) {
      // cidade/UF não vêm na planilha de PDR: preserva o que já estava
      catalogo = catalogo.map((p) =>
        p.cnpj === pdr.cnpj ? { ...p, nome: pdr.nome, situacao: pdr.situacao } : p,
      )
      atualizados += alvos.length
    } else {
      catalogo = [...catalogo, { ...pdr, id: String(proximo++) }]
      novos++
    }
  }

  pdrsCatalogo = catalogo
  notificarPdr()
  return { novos, atualizados }
}

/**
 * Observação da unidade para exibir na visita. A ligação é pelo CPF/CNPJ
 * porque a visita ainda carrega uma cópia dos dados do PDR em vez de apontar
 * para o cadastro pelo id — quando essa ligação existir, troque aqui.
 */
export function useObservacaoPdr(cnpj: string): string | undefined {
  const catalogo = usePdrsCatalogo()
  return catalogo.find((p) => p.cnpj === cnpj)?.observacao?.trim() || undefined
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
      valores: { Negativa: 0, Declarada: 0, Positiva: 0, Participante: 0 },
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
}

/** adiciona uma visita ao store */
/**
 * Troca a base inteira pelas visitas importadas. A fila de cada uma não vem da
 * planilha: é o resultado da própria análise que decide — sem erro, a visita
 * já entra certificada; com erro, vai para a Central de Correção. É esse o
 * ponto do teste, ver o que o sistema aponta sozinho.
 *
 * Recebe o avaliador por parâmetro para não criar dependência circular com
 * analise.ts, que já importa deste módulo.
 */
export async function substituirVisitas(
  novas: Visita[],
  contarErros: (v: Visita) => number,
  onProgresso?: (feitos: number, total: number) => void,
): Promise<{ certificadas: number; paraCorrecao: number }> {
  let certificadas = 0
  let paraCorrecao = 0

  const preparadas = novas.map((v) => {
    const ajustada = ajustarRecebimento(v)
    const comErro = contarErros(ajustada) > 0
    if (comErro) paraCorrecao++
    else certificadas++
    return { ...ajustada, rodada: 1, situacao: comErro ? 'central-correcao' : 'certificada' } as Visita
  })

  baseSubstituida = true
  zerarRemoto = false
  visitasAlteradas.clear()
  pontosPorCnpj.clear()

  if (bancoAtivo()) {
    estado = []
    hidratando = true
    try {
      await apagarTodasVisitas()
      await importarVisitasLote(preparadas, onProgresso)
      registrarFalha(null)
    } catch (e) {
      registrarFalha(
        e instanceof Error ? `Importação: ${e.message}` : 'Falha ao importar no banco.',
      )
      throw e
    } finally {
      hidratando = false
      invalidarConsultas()
      notificarLeitura()
    }
    return { certificadas, paraCorrecao }
  }

  estado = preparadas
  estado.forEach((v) => {
    visitasAlteradas.add(v.cod)
    v.cargas.forEach((c) => reservarIdCarga(c.id))
  })
  zerarRemoto = true
  notificar()
  return { certificadas, paraCorrecao }
}

/**
 * Esvazia a base de visitas. Marca a base como substituída pelo mesmo motivo
 * da importação: senão o próximo carregamento traria o gerador de volta e a
 * tela voltaria a mostrar as visitas de demonstração.
 */
export async function limparVisitas() {
  estado = []
  baseSubstituida = true
  zerarRemoto = false
  visitasAlteradas.clear()
  pontosPorCnpj.clear()
  if (bancoAtivo()) {
    hidratando = true
    try {
      await apagarTodasVisitas()
      registrarFalha(null)
    } catch (e) {
      registrarFalha(e instanceof Error ? e.message : 'Falha ao zerar o banco.')
    } finally {
      hidratando = false
      invalidarConsultas()
    }
  } else {
    zerarRemoto = true
  }
  notificar()
}

export function adicionarVisita(visita: Visita) {
  estado = [...estado, visita]
  visitasAlteradas.add(visita.cod)
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

export function datasUnidade(cnpj: string): string[] {
  const pontos = pontosPorCnpj.get(cnpj)
  if (pontos?.length) return pontos.map((p) => p.data)
  return visitasPorCnpj(cnpj).map((v) => v.data)
}

export function pontoUnidade(cnpj: string, data: string): PontoUnidade | undefined {
  return pontosPorCnpj.get(cnpj)?.find((p) => p.data === data)
}

const NOMES_MES_HIST = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function historicoDePontos(
  pontos: { data: string; origem: Acumulado['origem']; valores: Acumulado['valores']; cargas: number }[],
  ate: Date,
): HistoricoAcumulado {
  const limite = ate.getFullYear() * 10000 + (ate.getMonth() + 1) * 100 + ate.getDate()
  const porDia = new Map<number, AcumuladoPeriodo>()
  for (const p of pontos) {
    const n = dataComparavel(p.data)
    if (!n || n > limite) continue
    const atual: AcumuladoPeriodo = {
      periodo: p.data,
      origem: p.origem,
      negativa: p.valores.Negativa,
      declarada: p.valores.Declarada,
      positiva: p.valores.Positiva,
      participante: p.valores.Participante,
      cargas: p.cargas,
      visitas: 1,
    }
    const prev = porDia.get(n)
    const tot = (x: AcumuladoPeriodo) => x.negativa + x.declarada + x.positiva + x.participante
    if (!prev || tot(atual) >= tot(prev)) porDia.set(n, atual)
  }
  const dias = [...porDia.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, p]) => p)

  const mesesMap = new Map<string, AcumuladoPeriodo>()
  for (const d of [...dias].reverse()) {
    const n = dataComparavel(d.periodo)
    const mes = Math.floor((n % 10000) / 100)
    const ano = Math.floor(n / 10000)
    const rotulo = `${NOMES_MES_HIST[mes - 1]}/${ano}`
    mesesMap.set(rotulo, { ...d, periodo: rotulo })
  }
  return { dias, meses: [...mesesMap.values()].reverse() }
}

/**
 * Histórico real da unidade: cada visita no banco vira um ponto. Sem visita
 * naquele dia, o dia não entra — não se preenche calendário. Import de
 * acumulado entra aqui (visita INSERÇÃO_AUTO). A regra 2.5 compara estes pontos.
 */
export function historicoAcumuladoUnidade(cnpj: string, ate: Date): HistoricoAcumulado {
  const cached = pontosPorCnpj.get(cnpj)
  const pontos: PontoUnidade[] = cached
    ? cached.map((p) => ({ ...p, valores: { ...p.valores } }))
    : estado.filter((v) => v.pdr.cnpj === cnpj).map(pontoDeVisita)
  // visita aberta (e qualquer outra já no estado) ganha do cache: o analista
  // acabou de gravar o acumulado e a regra 2.5 tem que ver esse número, não o
  // 0-0-0-0 que ainda está no Postgres
  for (const v of estado) {
    if (v.pdr.cnpj !== cnpj) continue
    const ponto = pontoDeVisita(v)
    const i = pontos.findIndex((p) => p.cod === v.cod || p.data === v.data)
    if (i >= 0) pontos[i] = ponto
    else pontos.push(ponto)
  }
  return historicoDePontos(pontos, ate)
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
    // unidade que ainda não está no catálogo entra sem id de cadastro
    id: pdrDoCatalogo?.id ?? '',
    nome: item.nomePdr || pdrDoCatalogo?.nome || '-',
    cnpj: item.cnpj,
    cidade: municipioEscolhido ?? item.municipio ?? pdrDoCatalogo?.cidade ?? '-',
    uf: item.uf || pdrDoCatalogo?.uf || '-',
    situacao: pdrDoCatalogo?.situacao ?? 'Ativo',
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
    importadoPor: obterUsuarioLogado().nome,
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
let solicitacoes: Solicitacao[] = bancoAtivo()
  ? []
  : semAnexosMortos(persistido?.solicitacoes ?? SOLICITACOES_INICIAIS)
const ouvintesSolicitacoes = new Set<() => void>()
let sequenciaSolicitacao = Math.max(0, ...solicitacoes.map((s) => s.numero))

function notificarSolicitacoes() {
  ouvintesSolicitacoes.forEach((fn) => fn())
  agendarGravacao()
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function novoId(): string {
  return crypto.randomUUID()
}

let salvandoSolicitacoes = 0

async function salvarSolicitacaoRemota(id: string) {
  if (!bancoAtivo() || hidratando) return
  const s = solicitacoes.find((x) => x.id === id)
  if (!s || !UUID.test(s.id)) return
  salvandoSolicitacoes += 1
  ignorarRealtimeAte = Date.now() + 60_000
  try {
    const gravada = await persistirSolicitacao(s)
    const ainda = solicitacoes.find((x) => x.id === id)
    if (!ainda) return
    solicitacoes = solicitacoes.map((x) =>
      x.id === id
        ? {
            ...ainda,
            mensagens: ainda.mensagens.map((m) => {
              const gm = gravada.mensagens.find((y) => y.id === m.id)
              if (!gm) return m
              return {
                ...m,
                anexos: m.anexos.map((a) => {
                  const ga = gm.anexos.find((y) => y.id === a.id)
                  return ga ? { ...a, path: ga.path, url: ga.url || a.url, arquivo: undefined } : a
                }),
              }
            }),
          }
        : x,
    )
    ouvintesSolicitacoes.forEach((fn) => fn())
    registrarFalha(null)
  } catch (e) {
    registrarFalha(
      e instanceof Error ? `Anexo/solicitação: ${e.message}` : 'Falha ao gravar a solicitação.',
    )
  } finally {
    salvandoSolicitacoes = Math.max(0, salvandoSolicitacoes - 1)
    ignorarRealtimeAte = Date.now() + 2500
  }
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
  void salvarSolicitacaoRemota(id)
}

/** remove definitivamente a solicitação — quem pode chamar isso é decidido na tela */
export function excluirSolicitacao(id: string) {
  solicitacoes = solicitacoes.filter((s) => s.id !== id)
  notificarSolicitacoes()
  if (!bancoAtivo() || hidratando || !UUID.test(id)) return
  ignorarRealtimeAte = Date.now() + 2500
  void apagarSolicitacaoRemota(id).catch((e) => {
    registrarFalha(
      e instanceof Error ? `Excluir solicitação: ${e.message}` : 'Falha ao excluir a solicitação.',
    )
  })
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
    id: novoId(),
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
              id: novoId(),
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
  void salvarSolicitacaoRemota(nova.id)
  return nova
}

/** move o card entre as colunas do quadro — pendente, análise, feito */
export function moverSolicitacao(id: string, status: StatusSolicitacao) {
  alterarSolicitacao(id, (s) => ({ ...s, status, atualizadoEm: Date.now() }))
}

/** registra um arquivo anexado ao chat — o File sobe para o bucket `anexos` */
export function criarAnexo(file: File): AnexoArquivo {
  return {
    id: novoId(),
    nome: file.name,
    tamanho: file.size,
    tipo: file.type || 'application/octet-stream',
    url: URL.createObjectURL(file),
    arquivo: file,
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
      { id: novoId(), autor, texto, ts: agora, anexos },
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

/* ------------------------------------------------------------------ *
 * Parâmetros — regras de análise da visita e mensagem padrão do chat,
 * configurados em Administração → Parâmetros
 * ------------------------------------------------------------------ */
const PARAMETROS_INICIAIS: ParametrosRegras = {
  limiteDescontoErro: 25,
  minDigitosPlaca: 6,
  saltoMaxRomaneio: 500,
  toleranciaHorarioMin: 60,
  limiteDiaAnteriorTecnologia: 3_000_000,
  caixaFitaMin: CAIXA_FITA_MIN,
  caixaFitaMax: CAIXA_FITA_MAX,
  mensagemErroChat: '⚠️ {quantidade} erro(s) encontrado(s) na visita:',
  regrasAtivas: regrasAtivasPadrao(),
  visaoProvedor: 'desligado',
  visaoChave: '',
  visaoModelo: '',
  visaoEndpoint: '',
  visaoPrompt: '',
}

function completarParametros(p: Partial<ParametrosRegras> | null | undefined): ParametrosRegras {
  return {
    ...PARAMETROS_INICIAIS,
    ...p,
    regrasAtivas: { ...PARAMETROS_INICIAIS.regrasAtivas, ...p?.regrasAtivas },
    visaoProvedor: p?.visaoProvedor ?? 'desligado',
    visaoChave: p?.visaoChave ?? '',
    visaoModelo: p?.visaoModelo ?? '',
    visaoEndpoint: p?.visaoEndpoint ?? '',
    visaoPrompt: p?.visaoPrompt ?? '',
  }
}

let parametros: ParametrosRegras = completarParametros(persistido?.parametros)
const ouvintesParametros = new Set<() => void>()

function notificarParametros() {
  ouvintesParametros.forEach((fn) => fn())
  agendarGravacao()
}

/** para uso em componentes React — reage a alterações feitas em Parâmetros */
export function useParametros(): ParametrosRegras {
  return useSyncExternalStore(
    (fn) => { ouvintesParametros.add(fn); return () => ouvintesParametros.delete(fn) },
    () => parametros,
    () => parametros,
  )
}

/** para uso fora de componentes (ex.: analise.ts) — lê o valor atual sem se inscrever */
export function obterParametros(): ParametrosRegras {
  return parametros
}

export function salvarParametros(novo: ParametrosRegras) {
  parametros = completarParametros(novo)
  notificarParametros()
}

/** boot: troca o mock pelo catálogo do Postgres. Visitas entram sob demanda. */
export async function hidratarDoBanco(): Promise<void> {
  if (!bancoAtivo()) return
  hidratando = true
  try {
    const dados = await carregarBoot()
    estado = []
    pontosPorCnpj.clear()
    visitasAusentes.clear()
    visitasPedidas.clear()
    if (dados.pdrs.length) pdrsCatalogo = normalizarCatalogo(dados.pdrs)
    if (dados.parametros) parametros = completarParametros(dados.parametros)
    if (dados.usuarios.length) {
      usuarios = dados.usuarios
    } else {
      usuarios = USUARIOS_INICIAIS
      try {
        await persistirUsuarios(usuarios)
      } catch {
        // schema antigo (id uuid / sem senha): a semente local ainda entra
      }
    }
    if (usuarioLogadoId && !usuarios.some((u) => u.id === usuarioLogadoId)) {
      usuarioLogadoId = null
    }
    atualizarLogado()
    visitasAlteradas.clear()
    baseSubstituida = true
    try {
      const lista = await carregarSolicitacoes()
      solicitacoes = lista
      sequenciaSolicitacao = Math.max(0, ...lista.map((s) => s.numero))
    } catch (e) {
      registrarFalha(
        e instanceof Error ? `Solicitações: ${e.message}` : 'Falha ao ler solicitações.',
      )
    }
    try {
      const maior = await maiorCodVisita()
      if (maior >= 900000) contadorFake = maior
    } catch {
      // catálogo sobe mesmo se a tabela de visitas ainda não existir
    }
    registrarFalha(null)
    invalidarConsultas()
  } catch (e) {
    registrarFalha(
      e instanceof Error
        ? `Não foi possível ler o banco (${e.message}). Mostrando dados locais.`
        : 'Não foi possível ler o banco.',
    )
  } finally {
    hidratando = false
    ouvintes.forEach((fn) => fn())
    ouvintesPdr.forEach((fn) => fn())
    ouvintesParametros.forEach((fn) => fn())
    ouvintesUsuarios.forEach((fn) => fn())
    ouvintesSolicitacoes.forEach((fn) => fn())
  }
}

/** outras abas/máquinas veem a mudança de fila e de acumulado */
export function escutarBanco() {
  const sb = supabase()
  if (!sb) return
  sb.channel('harvest-ops')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'visitas' },
      (payload) => {
        if (Date.now() < ignorarRealtimeAte) return
        invalidarConsultas()
        const row = (payload.new ?? payload.old) as { cod?: number } | null
        const cod = Number(row?.cod)
        if (cod && estado.some((v) => v.cod === cod)) void recarregarVisita(cod)
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cargas' },
      (payload) => {
        if (Date.now() < ignorarRealtimeAte) return
        invalidarConsultas()
        const row = (payload.new ?? payload.old) as { visita_cod?: number } | null
        const cod = Number(row?.visita_cod)
        if (cod && estado.some((v) => v.cod === cod)) void recarregarVisita(cod)
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'solicitacoes' },
      () => {
        if (Date.now() < ignorarRealtimeAte || hidratando || salvandoSolicitacoes > 0) return
        void carregarSolicitacoes()
          .then((lista) => {
            solicitacoes = lista
            sequenciaSolicitacao = Math.max(sequenciaSolicitacao, ...lista.map((s) => s.numero))
            ouvintesSolicitacoes.forEach((fn) => fn())
          })
          .catch(() => {
            /* o quadro local continua; o próximo F5 reconcilia */
          })
      },
    )
    .subscribe()
}
