import type Typo from 'typo-js'

/**
 * Corretor ortográfico offline (Hunspell/pt-BR via typo-js) — sem IA,
 * sem serviço externo. Os arquivos do dicionário ficam em
 * `public/dicionario/` (ver README ali).
 *
 * A montagem do dicionário (~5 MB) roda num Web Worker para não travar
 * a tela. Ao entrar em Ocorrências o worker já começa a aquecer; na
 * sessão ele fica pronto. Focar o textarea não dispara nada.
 *
 * Sem Worker (testes em Node) a montagem cai na thread principal, e
 * só então no clique de "Verificar ortografia" — nunca no preload.
 *
 * `check` é barato; `suggest` não — por isso a verificação ao vivo só
 * marca a palavra, e as sugestões vêm no botão direito.
 */
let corretorPromise: Promise<void> | null = null
let worker: Worker | null = null
let seq = 0
const pendentes = new Map<number, { resolve: (v: Resposta) => void; reject: (e: Error) => void }>()

/** fallback quando não há Worker (testes em Node) */
let corretorLocal: Typo | null = null

type Resposta = {
  tipo: 'ok' | 'erro'
  erros?: { palavra: string }[]
  sugestoes?: string[]
  mensagem?: string
}

function baseDicionario(): string {
  return `${import.meta.env.BASE_URL}dicionario/`
}

function obterWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./ortografia.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<Resposta & { id: number }>) => {
    const pendente = pendentes.get(e.data.id)
    if (!pendente) return
    pendentes.delete(e.data.id)
    if (e.data.tipo === 'erro') pendente.reject(new Error(e.data.mensagem ?? 'Falha no corretor.'))
    else pendente.resolve(e.data)
  }
  worker.onerror = (e) => {
    for (const p of pendentes.values()) p.reject(new Error(e.message || 'Worker do corretor falhou.'))
    pendentes.clear()
  }
  return worker
}

function pedirAoWorker(msg: object): Promise<Resposta> {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pendentes.set(id, { resolve, reject })
    obterWorker().postMessage({ id, ...msg })
  })
}

async function montarNoThreadPrincipal(): Promise<void> {
  const [{ default: TypoCtor }, affRes, dicRes] = await Promise.all([
    import('typo-js'),
    fetch(`${baseDicionario()}pt.aff`),
    fetch(`${baseDicionario()}pt.dic`),
  ])
  if (!affRes.ok || !dicRes.ok) {
    throw new Error('Não foi possível baixar o dicionário de português.')
  }
  const [affData, wordsData] = await Promise.all([affRes.text(), dicRes.text()])
  corretorLocal = new TypoCtor('pt_BR', affData, wordsData)
}

export function carregarCorretorPortugues(): Promise<void> {
  corretorPromise ??= (async () => {
    if (typeof Worker === 'undefined') {
      await montarNoThreadPrincipal()
      return
    }
    await pedirAoWorker({ tipo: 'carregar', base: baseDicionario() })
  })()
  return corretorPromise
}

/**
 * Começa a montar o dicionário em segundo plano, sem bloquear a tela.
 * Só usa o Worker: na thread principal isso travaria a entrada da página.
 */
export function preaquecerCorretorPortugues(): void {
  if (typeof Worker === 'undefined') return
  const iniciar = () => {
    void carregarCorretorPortugues()
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(iniciar, { timeout: 1500 })
    return
  }
  setTimeout(iniciar, 0)
}

export interface ErroOrtografico {
  palavra: string
  sugestoes: string[]
}

const TAMANHO_MIN_PALAVRA = 3
const MAX_SUGESTOES = 4

const palavrasIgnoradas = new Set<string>()

export function ignorarPalavra(palavra: string): void {
  palavrasIgnoradas.add(palavra.toLowerCase())
}

function filtrarIgnoradas(erros: ErroOrtografico[]): ErroOrtografico[] {
  return erros.filter((e) => !palavrasIgnoradas.has(e.palavra.toLowerCase()))
}

function verificarLocal(texto: string): ErroOrtografico[] {
  const corretor = corretorLocal
  if (!corretor) return []
  const palavras = texto.match(/\p{L}+/gu) ?? []
  const vistas = new Set<string>()
  const erros: ErroOrtografico[] = []
  for (const palavra of palavras) {
    const chave = palavra.toLowerCase()
    if (vistas.has(chave) || palavra.length < TAMANHO_MIN_PALAVRA || palavrasIgnoradas.has(chave)) continue
    vistas.add(chave)
    if (corretor.check(palavra)) continue
    erros.push({ palavra, sugestoes: [] })
  }
  return erros
}

/** só marca palavras desconhecidas — não calcula sugestão (isso trava) */
export async function verificarTexto(texto: string): Promise<ErroOrtografico[]> {
  await carregarCorretorPortugues()
  if (corretorLocal) return verificarLocal(texto)
  const r = await pedirAoWorker({ tipo: 'verificar', texto })
  return filtrarIgnoradas((r.erros ?? []).map((e) => ({ palavra: e.palavra, sugestoes: [] })))
}

export async function sugerirPalavra(palavra: string): Promise<string[]> {
  if (palavra.length < TAMANHO_MIN_PALAVRA || palavrasIgnoradas.has(palavra.toLowerCase())) return []
  await carregarCorretorPortugues()
  if (corretorLocal) return corretorLocal.suggest(palavra, MAX_SUGESTOES)
  const r = await pedirAoWorker({ tipo: 'sugerir', palavra })
  return r.sugestoes ?? []
}

export function primeiraLetraMaiuscula(v: string): boolean {
  return v[0] !== undefined && v[0] === v[0].toUpperCase() && v[0] !== v[0].toLowerCase()
}

/** troca todas as ocorrências da palavra pela sugestão, preservando maiúscula inicial de cada uma */
export function substituirPalavra(texto: string, palavra: string, sugestao: string): string {
  const escapada = palavra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\b${escapada}\\b`, 'g')
  return texto.replace(regex, (encontrada) =>
    primeiraLetraMaiuscula(encontrada) ? sugestao[0].toUpperCase() + sugestao.slice(1) : sugestao,
  )
}
