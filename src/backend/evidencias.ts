import { supabase } from './cliente'

const LIMITE_BYTES = 10 * 1024 * 1024
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp'])
const PREFIXO = 'storage:'
const EXPIRA_S = 60 * 60 * 24 * 7

function erro(acao: string, e: { message?: string } | null): Error {
  return new Error(`${acao}: ${e?.message ?? 'falha desconhecida'}`)
}

export function validarFotoCarga(file: File): string | null {
  const tipoOk = TIPOS.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)
  if (!tipoOk) return 'Use jpeg, png ou webp.'
  if (file.size > LIMITE_BYTES) return 'A foto passa de 10 MB.'
  return null
}

export function caminhoFotoCarga(visitaCod: number, cargaId: string, nome: string): string {
  const base = nome.replace(/[/\\]/g, '_').replace(/\.\.+/g, '_').trim() || 'foto.jpg'
  return `cargas/${visitaCod}/${cargaId}/${base}`
}

export function fotoUrlParaBanco(c: { fotoPath?: string; fotoUrl?: string }): string | null {
  if (c.fotoPath) return `${PREFIXO}${c.fotoPath}`
  const u = c.fotoUrl
  if (!u || u.startsWith('blob:')) return null
  return u
}

export function fotoDeBanco(raw: string | null | undefined): { fotoUrl?: string; fotoPath?: string } {
  if (!raw) return {}
  if (raw.startsWith(PREFIXO)) return { fotoPath: raw.slice(PREFIXO.length) }
  return { fotoUrl: raw }
}

export function arquivoParaDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('Não deu para ler a foto.'))
    leitor.onload = () => resolve(String(leitor.result ?? ''))
    leitor.readAsDataURL(file)
  })
}

export async function enviarFotoCarga(
  visitaCod: number,
  cargaId: string,
  file: File,
): Promise<{ fotoUrl: string; fotoPath?: string }> {
  const problema = validarFotoCarga(file)
  if (problema) throw new Error(problema)
  const local = await arquivoParaDataUrl(file)
  const sb = supabase()
  if (!sb) return { fotoUrl: local }
  const path = caminhoFotoCarga(visitaCod, cargaId, file.name)
  const { error: e } = await sb.storage.from('evidencias').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  })
  if (e) throw erro(`enviar foto ${file.name}`, e)
  const { data, error: e2 } = await sb.storage.from('evidencias').createSignedUrl(path, EXPIRA_S)
  if (e2) throw erro('assinar foto', e2)
  return { fotoUrl: data?.signedUrl ?? local, fotoPath: path }
}

export async function assinarFotosCarga<T extends { fotoPath?: string; fotoUrl?: string }>(
  cargas: T[],
): Promise<T[]> {
  const sb = supabase()
  const paths = [...new Set(cargas.map((c) => c.fotoPath).filter((p): p is string => Boolean(p)))]
  if (!sb || paths.length === 0) return cargas
  const mapa = new Map<string, string>()
  for (let i = 0; i < paths.length; i += 80) {
    const fatia = paths.slice(i, i + 80)
    const { data, error: e } = await sb.storage.from('evidencias').createSignedUrls(fatia, EXPIRA_S)
    if (e) throw erro('assinar evidências', e)
    for (let j = 0; j < fatia.length; j++) {
      const url = data?.[j]?.signedUrl
      if (url) mapa.set(fatia[j], url)
    }
  }
  return cargas.map((c) =>
    c.fotoPath && mapa.has(c.fotoPath) ? { ...c, fotoUrl: mapa.get(c.fotoPath) } : c,
  )
}
