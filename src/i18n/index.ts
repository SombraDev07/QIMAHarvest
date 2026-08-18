import { useSyncExternalStore } from 'react'
import { EN } from './dicionario'

export type Idioma = 'pt' | 'en'

export const IDIOMAS: { id: Idioma; sigla: string; nome: string }[] = [
  { id: 'pt', sigla: 'PT', nome: 'Português' },
  { id: 'en', sigla: 'EN', nome: 'English' },
]

const CHAVE = 'qima-harvest/idioma'

function lerGravado(): Idioma {
  try {
    const v = localStorage.getItem(CHAVE)
    return v === 'en' || v === 'pt' ? v : 'pt'
  } catch {
    return 'pt'
  }
}

let idioma: Idioma = lerGravado()
const ouvintes = new Set<() => void>()

/**
 * A escolha vive fora do store de dados de propósito: idioma é preferência de
 * quem está usando, não conteúdo do sistema. Assim ela sobrevive a "Restaurar
 * dados originais" e a uma importação em lote, que zeram o resto.
 */
export function definirIdioma(novo: Idioma) {
  if (novo === idioma) return
  idioma = novo
  try {
    localStorage.setItem(CHAVE, novo)
  } catch {
    // sem storage a escolha vale só nesta sessão; melhor que quebrar
  }
  ouvintes.forEach((fn) => fn())
}

export function useIdioma(): Idioma {
  return useSyncExternalStore(
    (fn) => {
      ouvintes.add(fn)
      return () => ouvintes.delete(fn)
    },
    () => idioma,
    () => idioma,
  )
}

/**
 * Traduz pelo próprio texto em português. O que não está no dicionário volta
 * como veio — a tela nunca mostra chave crua nem espaço em branco, só fica em
 * português até alguém traduzir.
 */
export function traduzir(texto: string, alvo: Idioma = idioma): string {
  if (alvo === 'pt') return texto
  return EN[texto] ?? texto
}

/** para uso em componente: repinta quando o idioma muda */
export function useT(): (texto: string) => string {
  const atual = useIdioma()
  return (texto: string) => traduzir(texto, atual)
}

/** cobertura do dicionário, usada nos testes e para acompanhar o avanço */
export const totalTraduzido = () => Object.keys(EN).length
