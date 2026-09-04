/// <reference lib="webworker" />
import Typo from 'typo-js'

/**
 * Monta o Hunspell pt-BR fora da thread da tela: o .dic tem ~4 MB e o
 * construtor do typo-js trava o clique se rodar no mesmo lugar do React.
 */
let corretor: Typo | null = null

const TAMANHO_MIN_PALAVRA = 3
const MAX_SUGESTOES = 4

type Pedido =
  | { id: number; tipo: 'carregar'; base: string }
  | { id: number; tipo: 'verificar'; texto: string }
  | { id: number; tipo: 'sugerir'; palavra: string }

self.onmessage = async (e: MessageEvent<Pedido>) => {
  const msg = e.data
  try {
    if (msg.tipo === 'carregar') {
      if (!corretor) {
        const [affRes, dicRes] = await Promise.all([
          fetch(`${msg.base}pt.aff`),
          fetch(`${msg.base}pt.dic`),
        ])
        if (!affRes.ok || !dicRes.ok) throw new Error('Não foi possível baixar o dicionário de português.')
        const [affData, wordsData] = await Promise.all([affRes.text(), dicRes.text()])
        corretor = new Typo('pt_BR', affData, wordsData)
      }
      self.postMessage({ id: msg.id, tipo: 'ok' })
      return
    }

    if (!corretor) throw new Error('Dicionário ainda não foi carregado.')

    if (msg.tipo === 'verificar') {
      self.postMessage({ id: msg.id, tipo: 'ok', erros: listarErros(corretor, msg.texto) })
      return
    }

    self.postMessage({
      id: msg.id,
      tipo: 'ok',
      sugestoes: msg.palavra.length < TAMANHO_MIN_PALAVRA ? [] : corretor.suggest(msg.palavra, MAX_SUGESTOES),
    })
  } catch (err) {
    self.postMessage({
      id: msg.id,
      tipo: 'erro',
      mensagem: err instanceof Error ? err.message : 'Falha no corretor.',
    })
  }
}

function listarErros(c: Typo, texto: string): { palavra: string }[] {
  const palavras = texto.match(/\p{L}+/gu) ?? []
  const vistas = new Set<string>()
  const erros: { palavra: string }[] = []
  for (const palavra of palavras) {
    const chave = palavra.toLowerCase()
    if (vistas.has(chave) || palavra.length < TAMANHO_MIN_PALAVRA) continue
    vistas.add(chave)
    if (c.check(palavra)) continue
    erros.push({ palavra })
  }
  return erros
}
