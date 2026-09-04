import type { ChangeEvent } from 'react'

/**
 * Autocorreção leve para os campos de texto livre das ocorrências —
 * sem IA nem serviço externo, só um dicionário local de abreviações e
 * erros de digitação comuns, sem ambiguidade com outra palavra válida.
 * Não tenta corrigir gramática nem ortografia em geral: isso fica por
 * conta do corretor nativo do navegador (spellCheck + lang="pt-BR"),
 * que já sublinha e sugere correção com o botão direito do mouse.
 */
export const DICIONARIO_AUTOCORRECAO: Record<string, string> = {
  vc: 'você',
  vcs: 'vocês',
  pq: 'porque',
  tb: 'também',
  tbm: 'também',
  naum: 'não',
  nao: 'não',
  entao: 'então',
  ateh: 'até',
  obg: 'obrigado',
  qdo: 'quando',
  qq: 'qualquer',
  qlqr: 'qualquer',
  msm: 'mesmo',
  td: 'tudo',
  eh: 'é',
  seje: 'seja',
  numca: 'nunca',
}

function preservarCapitalizacao(original: string, corrigida: string): string {
  if (!original || !corrigida) return corrigida
  const primeira = original[0]
  if (primeira !== primeira.toUpperCase() || primeira === primeira.toLowerCase()) return corrigida
  return corrigida[0].toUpperCase() + corrigida.slice(1)
}

/**
 * Chamada a cada tecla: só age quando a pessoa acabou de terminar uma
 * palavra (espaço, pontuação ou Enter) e ela bate com o dicionário.
 * Retorna null quando não há nada a corrigir.
 */
export function autocorrigirAoDigitar(
  texto: string,
  posicaoCursor: number,
): { texto: string; posicaoCursor: number } | null {
  if (posicaoCursor <= 0) return null
  const charAnterior = texto[posicaoCursor - 1]
  if (!/[\s.,!?;:\n]/.test(charAnterior)) return null

  const antes = texto.slice(0, posicaoCursor - 1)
  const match = /([a-zà-úA-ZÀ-Ú]+)$/.exec(antes)
  if (!match) return null

  const palavra = match[1]
  const corrigida = DICIONARIO_AUTOCORRECAO[palavra.toLowerCase()]
  if (!corrigida || corrigida === palavra.toLowerCase()) return null

  const inicioPalavra = posicaoCursor - 1 - palavra.length
  const substituida = preservarCapitalizacao(palavra, corrigida)
  const novoTexto = texto.slice(0, inicioPalavra) + substituida + texto.slice(posicaoCursor - 1)
  const novaPosicao = inicioPalavra + substituida.length + 1

  return { texto: novoTexto, posicaoCursor: novaPosicao }
}

/**
 * Handler pronto para `onChange` de um textarea controlado: aplica a
 * autocorreção quando cabe. O valor e o cursor do próprio elemento são
 * ajustados na hora (antes de avisar o React) — esperar o re-render
 * para só então mexer no cursor (ex.: via requestAnimationFrame) perde
 * a corrida quando a pessoa digita rápido: a tecla seguinte chega
 * antes do ajuste e cai na posição errada.
 */
export function corrigirTextareaOnChange(
  e: ChangeEvent<HTMLTextAreaElement>,
  setValor: (v: string) => void,
) {
  const el = e.target
  const resultado = autocorrigirAoDigitar(el.value, el.selectionStart ?? el.value.length)
  if (!resultado) {
    setValor(el.value)
    return
  }
  el.value = resultado.texto
  el.setSelectionRange(resultado.posicaoCursor, resultado.posicaoCursor)
  setValor(resultado.texto)
}
