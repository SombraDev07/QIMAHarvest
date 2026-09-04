import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import {
  carregarCorretorPortugues,
  ignorarPalavra,
  primeiraLetraMaiuscula,
  sugerirPalavra,
  verificarTexto,
} from '../ortografia'
import { corrigirTextareaOnChange } from '../autocorrecao'

/**
 * Campo de texto com correção ortográfica. O dicionário Hunspell só
 * entra quando a pessoa pede "Verificar ortografia" — focar o campo
 * não baixa nem monta os 5 MB, senão o primeiro clique trava a tela.
 *
 * Palavra não reconhecida fica com linha vermelha ondulada; o botão
 * direito abre sugestões (calculadas na hora, uma palavra só).
 */
export type CampoOrtograficoHandle = {
  verificar: () => Promise<number>
}

const CampoOrtografico = forwardRef<CampoOrtograficoHandle, {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: number
  readOnly?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
}>(function CampoOrtografico({
  id,
  value,
  onChange,
  placeholder,
  minHeight = 84,
  readOnly,
  onKeyDown,
}, ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value
  const prontoRef = useRef(false)

  const [erros, setErros] = useState<Map<string, string[]> | null>(null)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    inicio: number
    fim: number
    palavra: string
    sugestoes: string[]
  } | null>(null)

  useImperativeHandle(ref, () => ({
    async verificar() {
      if (readOnly) return 0
      await carregarCorretorPortugues()
      prontoRef.current = true
      const lista = await verificarTexto(valueRef.current)
      setErros(new Map(lista.map((e) => [e.palavra.toLowerCase(), e.sugestoes])))
      return lista.length
    },
  }))

  useEffect(() => {
    if (!prontoRef.current) return
    const t = setTimeout(() => {
      void verificarTexto(value).then((lista) => {
        setErros(new Map(lista.map((e) => [e.palavra.toLowerCase(), e.sugestoes])))
      })
    }, 300)
    return () => clearTimeout(t)
  }, [value])

  useEffect(() => {
    if (!menu) return
    const fechar = () => setMenu(null)
    window.addEventListener('mousedown', fechar)
    window.addEventListener('scroll', fechar, true)
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && fechar()
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', fechar)
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('keydown', esc)
    }
  }, [menu])

  function sincronizarScroll() {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }

  function aoClicarComBotaoDireito(e: MouseEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget
    if (el.selectionStart !== el.selectionEnd) return

    const pos = el.selectionStart ?? 0
    let inicio = pos
    while (inicio > 0 && /\p{L}/u.test(value[inicio - 1])) inicio--
    let fim = pos
    while (fim < value.length && /\p{L}/u.test(value[fim])) fim++

    const palavra = value.slice(inicio, fim)
    if (!palavra || !erros?.has(palavra.toLowerCase())) return

    e.preventDefault()
    const x = e.clientX
    const y = e.clientY
    const cached = erros.get(palavra.toLowerCase()) ?? []
    if (cached.length > 0) {
      setMenu({ x, y, inicio, fim, palavra, sugestoes: cached })
      return
    }
    void sugerirPalavra(palavra).then((sugestoes) => {
      setErros((atual) => {
        if (!atual) return atual
        const novo = new Map(atual)
        novo.set(palavra.toLowerCase(), sugestoes)
        return novo
      })
      setMenu({ x, y, inicio, fim, palavra, sugestoes })
    })
  }

  function trocarPor(sugestao: string) {
    if (!menu) return
    const corrigida = primeiraLetraMaiuscula(menu.palavra)
      ? sugestao[0].toUpperCase() + sugestao.slice(1)
      : sugestao
    onChange(value.slice(0, menu.inicio) + corrigida + value.slice(menu.fim))
    setMenu(null)
  }

  function ignorar() {
    if (!menu) return
    ignorarPalavra(menu.palavra)
    setErros((atual) => {
      if (!atual) return atual
      const novo = new Map(atual)
      novo.delete(menu.palavra.toLowerCase())
      return novo
    })
    setMenu(null)
  }

  const partesRealcadas = useMemo(() => realcarPalavras(value, erros), [value, erros])

  return (
    <div className="ortografia-campo">
      <div className="ortografia-campo__overlay" ref={overlayRef} aria-hidden="true">
        {partesRealcadas}
      </div>
      <textarea
        id={id}
        className="ortografia-campo__input"
        ref={textareaRef}
        value={value}
        onChange={(e) => corrigirTextareaOnChange(e, onChange)}
        onScroll={sincronizarScroll}
        onContextMenu={aoClicarComBotaoDireito}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck
        lang="pt-BR"
        style={{ minHeight } as CSSProperties}
      />

      {menu && (
        <div className="ortografia-menu" style={{ left: menu.x, top: menu.y }}>
          {menu.sugestoes.length === 0 ? (
            <div className="ortografia-menu__vazio">Sem sugestão</div>
          ) : (
            menu.sugestoes.map((s) => (
              <button key={s} type="button" className="ortografia-menu__item" onClick={() => trocarPor(s)}>
                {s}
              </button>
            ))
          )}
          <div className="ortografia-menu__separador" />
          <button type="button" className="ortografia-menu__item ortografia-menu__ignorar" onClick={ignorar}>
            Ignorar "{menu.palavra}"
          </button>
        </div>
      )}
    </div>
  )
})

export default CampoOrtografico

function realcarPalavras(texto: string, erros: Map<string, string[]> | null) {
  if (!erros || erros.size === 0) return texto || '​'

  const partes: (string | { palavra: string; key: number })[] = []
  const regex = /\p{L}+/gu
  let ultimo = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(texto))) {
    const inicio = m.index
    const fim = inicio + m[0].length
    if (inicio > ultimo) partes.push(texto.slice(ultimo, inicio))
    if (erros.has(m[0].toLowerCase())) {
      partes.push({ palavra: m[0], key: key++ })
    } else {
      partes.push(m[0])
    }
    ultimo = fim
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  if (texto.endsWith('\n')) partes.push('​')

  return partes.map((p) =>
    typeof p === 'string' ? p : (
      <mark className="ortografia-campo__erro" key={p.key}>
        {p.palavra}
      </mark>
    ),
  )
}
