/**
 * Conector de visão para a Análise de Fotos.
 *
 * Plug: Administração → Parâmetros, ou .env.local
 *   VITE_VISION_PROVIDER=gemini|openai|webhook
 *   VITE_VISION_API_KEY=...
 *   VITE_VISION_MODEL=...          (opcional)
 *   VITE_VISION_ENDPOINT=https://...  (só webhook)
 *
 * Gemini e OpenAI são chamados do navegador. OpenAI costuma bloquear CORS;
 * nesse caso use um webhook (Edge Function, etc.) que receba a imagem e
 * devolva o JSON. O prompt é editável porque romaneio/NF mudam de layout.
 */
import type { ParametrosRegras, VisaoProvedor } from '../types'

export const PROMPT_VISAO_PADRAO = `Você lê uma foto de evidência de carga agrícola no Brasil (romaneio, ticket de balança, DANFE, NF-e ou bloco com várias vias).

Extraia só o que estiver visível. Não invente. Se o campo não aparecer, use null.

O documento PODE ter várias notas fiscais / vias / códigos. Isso é normal:
- "notasFiscais": todos os números de NF, DANFE, chave resumida ou ticket visíveis.
- "romaneio": o número do romaneio / ticket / ordem desta carga. Pode coincidir com uma das NFs, ter outro nome (romaneio, ticket, controle, ordem) ou estar num canto diferente. Não assuma que a maior NF é o romaneio.

Pesos em quilogramas (kg). Aceite 30.000, 30000, 30.000,0 ou 30 t (converta t → kg).
Data em dd/mm/aaaa. Hora em HH:MM (24h). Placa Mercosul ou antiga, sem hífen.

Responda APENAS um JSON:
{
  "data": "dd/mm/aaaa" | null,
  "hora": "HH:MM" | null,
  "placa": "ABC1D23" | null,
  "produtor": "nome do produtor/remetente" | null,
  "romaneio": "número do romaneio desta carga" | null,
  "notasFiscais": ["..."],
  "pesoLiquido": number | null,
  "pesoComDesconto": number | null
}`

export type ConfigVisao = {
  provedor: VisaoProvedor
  chave: string
  modelo: string
  endpoint: string
  prompt: string
  fetchImpl?: typeof fetch
}

const PROVEDORES: VisaoProvedor[] = ['desligado', 'gemini', 'openai', 'webhook']

export function visaoProvedorDe(v: unknown): VisaoProvedor {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  return PROVEDORES.includes(s as VisaoProvedor) ? (s as VisaoProvedor) : 'desligado'
}

/** vazio / ausente → Gemini (padrão da Análise de Fotos) */
export function visaoProvedorOuPadrao(v: unknown): VisaoProvedor {
  const s = String(v ?? '').trim()
  return s ? visaoProvedorDe(s) : 'gemini'
}

function env(nome: 'VITE_VISION_PROVIDER' | 'VITE_VISION_API_KEY' | 'VITE_VISION_MODEL' | 'VITE_VISION_ENDPOINT'): string {
  try {
    if (import.meta.env.MODE === 'test') return ''
    return String(import.meta.env[nome] ?? '').trim()
  } catch {
    return ''
  }
}

export const MODELO_GEMINI = 'gemini-flash-lite-latest'
export const MODELO_OPENAI = 'gpt-4o-mini'

/** fallback se a chave ainda não listou os modelos ao vivo */
export const MODELOS_GEMINI: { id: string; label: string }[] = [
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite (sempre o último)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash (sempre o último)' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
]

export const MODELOS_OPENAI: { id: string; label: string }[] = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
]

export type ModeloVisaoOpcao = { id: string; label: string }

export function modelosVisaoDe(provedor: VisaoProvedor): ModeloVisaoOpcao[] | null {
  if (provedor === 'gemini') return MODELOS_GEMINI
  if (provedor === 'openai') return MODELOS_OPENAI
  return null
}

const IGNORAR_MODELO_GEMINI =
  /embedding|imagen|veo|tts|lyria|robotics|live|aqa|gecko|nano-banana|computer-use|deep-research|-image$|-image-/i

function modeloGeminiUtil(m: Record<string, unknown>): ModeloVisaoOpcao | null {
  const id = String(m.name ?? m.baseModelId ?? '')
    .replace(/^models\//, '')
    .trim()
  if (!id.startsWith('gemini')) return null
  const metodos = Array.isArray(m.supportedGenerationMethods)
    ? m.supportedGenerationMethods.map(String)
    : []
  if (metodos.length && !metodos.includes('generateContent')) return null
  if (IGNORAR_MODELO_GEMINI.test(id)) return null
  const label = String(m.displayName ?? '').trim()
  return { id, label: label && label !== id ? label : id }
}

/**
 * Pergunta à Google quais modelos esta chave ainda enxerga.
 * A lista da tela deixa de ser chute — 1.5/2.0 podem já ter saído.
 */
export async function listarModelosGemini(
  chave: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModeloVisaoOpcao[]> {
  const key = chave.trim()
  if (!key) throw new Error('Informe a chave da API Gemini.')
  const vistos = new Map<string, ModeloVisaoOpcao>()
  let pageToken = ''
  for (let n = 0; n < 8; n++) {
    const qs = new URLSearchParams({ key, pageSize: '100' })
    if (pageToken) qs.set('pageToken', pageToken)
    const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models?${qs}`)
    const corpo = (await r.json().catch(() => ({}))) as {
      models?: Record<string, unknown>[]
      nextPageToken?: string
    }
    if (!r.ok) throw new Error(mensagemErroApi('Gemini', r.status, corpo))
    for (const m of corpo.models ?? []) {
      const item = modeloGeminiUtil(m)
      if (item && !vistos.has(item.id)) vistos.set(item.id, item)
    }
    pageToken = String(corpo.nextPageToken ?? '')
    if (!pageToken) break
  }
  return [...vistos.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt'))
}

export function configVisaoDe(p: ParametrosRegras): ConfigVisao {
  const doForm = visaoProvedorDe(p.visaoProvedor)
  const doEnv = visaoProvedorDe(env('VITE_VISION_PROVIDER'))
  const provedor = doForm !== 'desligado' ? doForm : doEnv
  const chave = (p.visaoChave ?? '').trim() || env('VITE_VISION_API_KEY')
  const endpoint = (p.visaoEndpoint ?? '').trim() || env('VITE_VISION_ENDPOINT')
  const modelo =
    (p.visaoModelo ?? '').trim() ||
    env('VITE_VISION_MODEL') ||
    (provedor === 'openai' ? MODELO_OPENAI : MODELO_GEMINI)
  const prompt = (p.visaoPrompt ?? '').trim() || PROMPT_VISAO_PADRAO
  return { provedor, chave, modelo, endpoint, prompt }
}

export function visaoLigada(c: ConfigVisao): boolean {
  if (c.provedor === 'desligado') return false
  if (c.provedor === 'webhook') return Boolean(c.endpoint)
  return Boolean(c.chave)
}

export interface CamposVisao {
  data?: string
  hora?: string
  placa?: string
  produtor?: string
  romaneio?: string
  notasFiscais: string[]
  pesoLiquido?: number
  pesoComDesconto?: number
}

export function parseRespostaVisao(texto: string): CamposVisao {
  const limpo = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const inicio = limpo.indexOf('{')
  const fim = limpo.lastIndexOf('}')
  const json = inicio >= 0 && fim > inicio ? limpo.slice(inicio, fim + 1) : limpo
  let bruto: unknown
  try {
    bruto = JSON.parse(json)
  } catch {
    throw new Error('A visão não devolveu JSON válido.')
  }
  if (!bruto || typeof bruto !== 'object') throw new Error('A visão não devolveu um objeto.')
  const o = bruto as Record<string, unknown>
  const nfs = Array.isArray(o.notasFiscais)
    ? o.notasFiscais.map((n) => String(n).trim()).filter(Boolean)
    : []
  const romaneio = textoOpcional(o.romaneio)
  if (romaneio && !nfs.includes(romaneio)) nfs.unshift(romaneio)
  return {
    data: dataOpcional(o.data),
    hora: horaOpcional(o.hora),
    placa: textoOpcional(o.placa),
    produtor: textoOpcional(o.produtor),
    romaneio,
    notasFiscais: nfs,
    pesoLiquido: numeroKg(o.pesoLiquido),
    pesoComDesconto: numeroKg(o.pesoComDesconto),
  }
}

function textoOpcional(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  const s = String(v).trim()
  return s && s !== 'null' ? s : undefined
}

function dataOpcional(v: unknown): string | undefined {
  const s = textoOpcional(v)
  if (!s) return undefined
  const m = s.match(/(\d{1,2})\D(\d{1,2})\D(\d{2,4})/)
  if (!m) return s
  const d = m[1].padStart(2, '0')
  const mes = m[2].padStart(2, '0')
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${d}/${mes}/${ano}`
}

function horaOpcional(v: unknown): string | undefined {
  const s = textoOpcional(v)
  if (!s) return undefined
  const m = s.match(/(\d{1,2})\D?(\d{2})/)
  if (!m) return s
  const h = Math.min(23, Number(m[1]))
  const min = Math.min(59, Number(m[2]))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function numeroKg(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  const s = textoOpcional(v)
  if (!s) return undefined
  const t = s.replace(/kg/gi, '').trim()
  const so = t.replace(/[^\d,.-]/g, '')
  if (!so) return undefined
  let n: number
  if (so.includes(',') && so.includes('.')) {
    n = Number(so.replace(/\./g, '').replace(',', '.'))
  } else if (so.includes(',')) {
    n = Number(so.replace(',', '.'))
  } else if (/^\d{1,3}(\.\d{3})+$/.test(so)) {
    n = Number(so.replace(/\./g, ''))
  } else {
    n = Number(so)
  }
  if (!Number.isFinite(n)) return undefined
  if (/[tT]/.test(t) && n < 200) n *= 1000
  return Math.round(n)
}

type ImagemInline = { mime: string; base64: string }

const cache = new Map<string, CamposVisao>()

export function limparCacheVisao() {
  cache.clear()
}

export function leituraVisaoEmCache(fotoUrl: string): CamposVisao | undefined {
  return cache.get(fotoUrl)
}

export async function lerFotoComVisao(fotoUrl: string, cfg: ConfigVisao): Promise<CamposVisao> {
  const hit = cache.get(fotoUrl)
  if (hit) return hit
  if (!visaoLigada(cfg)) throw new Error('Nenhuma API de visão configurada.')
  const img = await imagemInline(fotoUrl, cfg.fetchImpl ?? fetch)
  const bruto = await chamarProvedor(img, cfg)
  const campos = parseRespostaVisao(bruto)
  cache.set(fotoUrl, campos)
  return campos
}

async function imagemInline(fotoUrl: string, fetchImpl: typeof fetch): Promise<ImagemInline> {
  if (fotoUrl.startsWith('data:')) {
    const m = /^data:([^;,]+);base64,(.+)$/s.exec(fotoUrl)
    if (!m) throw new Error('A foto em data-URL não está em base64.')
    return { mime: m[1], base64: m[2] }
  }
  const r = await fetchImpl(fotoUrl)
  if (!r.ok) throw new Error(`Não deu para baixar a foto (${r.status}).`)
  const blob = await r.blob()
  const mime = blob.type || 'image/jpeg'
  const base64 = await blobParaBase64(blob)
  return { mime, base64 }
}

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Falha ao ler a foto.'))
    reader.onload = () => {
      const s = String(reader.result ?? '')
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    reader.readAsDataURL(blob)
  })
}

async function chamarProvedor(img: ImagemInline, cfg: ConfigVisao): Promise<string> {
  const fetchImpl = cfg.fetchImpl ?? fetch
  if (cfg.provedor === 'gemini') return chamarGemini(img, cfg, fetchImpl)
  if (cfg.provedor === 'openai') return chamarOpenAI(img, cfg, fetchImpl)
  return chamarWebhook(img, cfg, fetchImpl)
}

async function chamarGemini(img: ImagemInline, cfg: ConfigVisao, fetchImpl: typeof fetch): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.modelo)}:generateContent?key=${encodeURIComponent(cfg.chave)}`
  const r = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: cfg.prompt },
            { inline_data: { mime_type: img.mime, data: img.base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    }),
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(mensagemErroApi('Gemini', r.status, corpo))
  const texto = (corpo as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]
    ?.content?.parts?.map((p) => p.text ?? '')
    .join('')
    .trim()
  if (!texto) throw new Error('Gemini não devolveu texto.')
  return texto
}

async function chamarOpenAI(img: ImagemInline, cfg: ConfigVisao, fetchImpl: typeof fetch): Promise<string> {
  const r = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.chave}`,
    },
    body: JSON.stringify({
      model: cfg.modelo,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: cfg.prompt },
            { type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } },
          ],
        },
      ],
    }),
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(mensagemErroApi('OpenAI', r.status, corpo))
  const texto = (corpo as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content
  if (!texto) throw new Error('OpenAI não devolveu texto.')
  return texto
}

async function chamarWebhook(img: ImagemInline, cfg: ConfigVisao, fetchImpl: typeof fetch): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.chave) headers.Authorization = `Bearer ${cfg.chave}`
  const r = await fetchImpl(cfg.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: cfg.prompt,
      mimeType: img.mime,
      imageBase64: img.base64,
    }),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`Webhook ${r.status}: ${texto.slice(0, 180)}`)
  return texto
}

function mensagemErroApi(nome: string, status: number, corpo: unknown): string {
  const o = corpo as { error?: { message?: string }; message?: string }
  const msg = o?.error?.message ?? o?.message
  if (status === 0 || status === 404) {
    return `${nome} não respondeu. Se for OpenAI no navegador, o CORS costuma bloquear — use Gemini ou um webhook.`
  }
  return msg ? `${nome}: ${msg}` : `${nome} respondeu ${status}.`
}

export async function comConcorrencia<T, R>(
  itens: T[],
  limite: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const saida: R[] = new Array(itens.length)
  let i = 0
  const n = Math.max(1, Math.min(limite, itens.length))
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < itens.length) {
        const idx = i
        i += 1
        saida[idx] = await fn(itens[idx])
      }
    }),
  )
  return saida
}
