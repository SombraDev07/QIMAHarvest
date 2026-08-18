export const fmtNum = (n: number) => n.toLocaleString('pt-BR')
export const fmtKg = (n: number) => `${Math.round(n).toLocaleString('pt-BR')} kg`
export const fmtTon = (n: number) => `${n.toLocaleString('pt-BR')} t`
const pad = (n: number) => String(n).padStart(2, '0')

export const fmtDataHora = (ts: number) => {
  const d = new Date(ts)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** véspera de uma data "dd/mm/aaaa" — o Date resolve virada de mês e ano */
export function vespera(data: string): string {
  const [d, m, a] = data.split('/').map(Number)
  const dt = new Date(a, m - 1, d - 1)
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`
}

export const fmtPct = (n: number) =>
  `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

/* ================================================================= *
 * Máscaras de entrada — aplicadas no onChange dos formulários, para
 * que o estado já guarde o dado normalizado em vez de só acusar erro
 * na hora de salvar.
 * ================================================================= */

const soDigitos = (v: string) => v.replace(/\D/g, '')

/**
 * "1333" → "13:33". Descarta letras e pontuação, limita a 4 dígitos e
 * trava hora em 23 e minuto em 59.
 */
export function mascaraHora(valor: string): string {
  const d = soDigitos(valor).slice(0, 4)
  if (d.length <= 1) return d
  const h = pad(Math.min(23, Number(d.slice(0, 2))))
  if (d.length === 2) return h
  const m = d.slice(2)
  return d.length === 3 ? `${h}:${m}` : `${h}:${pad(Math.min(59, Number(m)))}`
}

export const horaValida = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

/**
 * normaliza uma hora já completa ("8:30", "0830", "8h30") em "HH:MM", ou null
 * se não for hora válida. Ao contrário de mascaraHora — que trunca e trava
 * porque lida com o valor parcial de quem ainda está digitando — aqui o valor
 * chega inteiro, então lixo tem que ser recusado e não corrigido no escuro.
 */
export function normalizarHora(valor: string): string | null {
  const m = valor.trim().match(/^(\d{1,2})\D?(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

/** placa antiga (ABC1234) ou Mercosul (ABC1D23): 7 alfanuméricos, sem separador */
export const mascaraPlaca = (valor: string) =>
  valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)

/** "Céu Azul" → "CEU AZUL": decompõe o acento e descarta o diacrítico */
export const semAcento = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * nome do produtor em caixa alta, sem acento, sem ponto e sem espaço duplo —
 * mantém & / - porque aparecem em razão social (S/A, COM & IND)
 */
export const mascaraProdutor = (valor: string) =>
  semAcento(valor)
    .toUpperCase()
    .replace(/[^A-Z0-9 &/-]/g, '')
    .replace(/ {2,}/g, ' ')

/** romaneio alfanumérico: sem traço, sem pontuação e sem espaço duplo */
export const mascaraRomaneio = (valor: string) =>
  semAcento(valor)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/ {2,}/g, ' ')

/** até 11 dígitos formata como CPF, acima disso como CNPJ */
export function mascaraCpfCnpj(valor: string): string {
  const d = soDigitos(valor).slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
}

/** CPF isolado: 11 dígitos no formato 000.000.000-00 */
export function mascaraCpf(valor: string): string {
  const d = soDigitos(valor).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

/**
 * Só o tamanho: 11 dígitos. Sem conferência de dígito verificador, para não
 * barrar cadastro em campo por causa de documento que a pessoa não tem em
 * mãos na hora. Vazio é válido — o campo é opcional.
 */
export function cpfValido(valor: string): boolean {
  const d = soDigitos(valor)
  return !d || d.length === 11
}

/** telefone brasileiro: (00) 00000-0000, aceitando fixo de 8 dígitos */
export function mascaraTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Coordenada em grau decimal, como se digita: sinal opcional, ponto decimal.
 * Vírgula vira ponto porque o teclado brasileiro entrega vírgula.
 */
export function mascaraCoordenada(valor: string): string {
  const limpo = valor.replace(',', '.').replace(/[^\d.-]/g, '')
  const negativo = limpo.startsWith('-')
  const [inteiro, ...resto] = limpo.replace(/-/g, '').split('.')
  const decimal = resto.length ? `.${resto.join('').slice(0, 8)}` : ''
  return `${negativo ? '-' : ''}${inteiro}${decimal}`
}

/** vazio é válido (campo opcional); preenchido tem que ser número dentro da faixa */
export const coordenadaValida = (valor: string, limite: number): boolean => {
  if (!valor.trim()) return true
  const n = Number(valor)
  return Number.isFinite(n) && Math.abs(n) <= limite
}

/** validação de e-mail deliberadamente frouxa: só o formato básico */
export const emailValido = (valor: string): boolean =>
  !valor.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim())

/**
 * Número vindo de planilha em pt-BR. Sem vírgula, o ponto é separador de
 * milhar — "47.780" são 47.780 kg, e não 47,78. O parser antigo lia como
 * decimal e importaria uma carga de 47 toneladas como 47 quilos, calado.
 */
export function numeroPlanilha(valor: string): number {
  const limpo = (valor ?? '').trim().replace(/\s/g, '')
  if (!limpo) return 0
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo.replace(/\./g, '')
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Hora de planilha, onde o minuto costuma vir sem o zero à esquerda: "13:2" é
 * 13:02. Completa o minuto e entrega ao normalizarHora, que recusa o resto.
 */
export function normalizarHoraPlanilha(valor: string): string | null {
  const m = (valor ?? '').trim().match(/^(\d{1,2})\D(\d{1})$/)
  return normalizarHora(m ? `${m[1]}:0${m[2]}` : valor)
}

/** nome de estado por extenso → sigla; a planilha traz "Mato Grosso" */
const UF_POR_ESTADO: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA',
  ceara: 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO',
  maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR',
  pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO',
  roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE',
  tocantins: 'TO',
}

export function ufDoEstado(valor: string): string | null {
  const bruto = (valor ?? '').trim()
  if (!bruto) return null
  if (/^[A-Za-z]{2}$/.test(bruto)) return bruto.toUpperCase()
  return UF_POR_ESTADO[semAcento(bruto).toLowerCase()] ?? null
}

/**
 * Data como número comparável (20260625), para filtro de intervalo.
 *
 * Usar Date aqui é armadilha: `new Date('2026-06-25')` é meia-noite UTC e
 * `new Date(2026, 5, 25)` é meia-noite local. No Brasil dá 3 horas de
 * diferença, e o limite superior do intervalo passa a excluir o próprio dia
 * escolhido. Comparar como número não tem fuso.
 */
export function dataComparavel(data: string): number {
  const [d, m, a] = (data ?? '').split('/').map(Number)
  // as três partes precisam existir: só checar o ano deixava passar NaN
  return [d, m, a].every(Number.isFinite) ? a * 10000 + m * 100 + d : 0
}

/** dd/mm/aaaa → aaaa-mm-dd para o Postgres */
export function dataBrParaIso(data: string): string | null {
  const n = dataComparavel(data)
  if (!n) return null
  const a = Math.floor(n / 10000)
  const m = Math.floor((n % 10000) / 100)
  const d = n % 100
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** aaaa-mm-dd (ou timestamptz) → dd/mm/aaaa */
export function dataIsoParaBr(iso: string): string {
  const pedaco = (iso ?? '').slice(0, 10)
  const [a, m, d] = pedaco.split('-')
  if (!a || !m || !d) return iso
  return `${d}/${m}/${a}`
}

export function horaPg(valor: string | null | undefined): string {
  if (!valor) return ''
  return valor.slice(0, 5)
}

/** o mesmo, para o valor de um <input type="date"> (aaaa-mm-dd) */
export function dataIsoComparavel(iso: string): number {
  const [a, m, d] = (iso ?? '').split('-').map(Number)
  return [a, m, d].every(Number.isFinite) ? a * 10000 + m * 100 + d : 0
}

/** dígitos digitados → número; usado junto com fmtNum nos campos de peso */
export const numeroDigitado = (valor: string) => Number(soDigitos(valor) || 0)
