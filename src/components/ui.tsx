import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { situacaoPorId } from '../data/mock'
import type { SimNao, SituacaoId } from '../types'
import { IconX } from './icons'

/* --------------------------------------------------------------- */
export function Breadcrumb({ trilha }: { trilha: { label: string; to?: string }[] }) {
  return (
    <div className="breadcrumb">
      {trilha.map((item, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span>›</span>}
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- */
export function PageHead({
  titulo,
  subtitulo,
  acoes,
}: {
  titulo: string
  subtitulo?: string
  acoes?: ReactNode
}) {
  return (
    <div className="page__head">
      <div>
        <h1 className="page__title">{titulo}</h1>
        {subtitulo && <p className="page__subtitle">{subtitulo}</p>}
      </div>
      {acoes && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{acoes}</div>}
    </div>
  )
}

/* --------------------------------------------------------------- */
export function SituacaoBadge({ id }: { id: SituacaoId }) {
  const s = situacaoPorId(id)
  return (
    <span
      className="badge"
      style={{ color: s.color, borderColor: `${s.color}44`, background: `${s.color}12` }}
    >
      <i className="badge__dot" />
      {s.short}
    </span>
  )
}

/* --------------------------------------------------------------- */
export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="kv__label">{label}</div>
      <div className="kv__value">{children}</div>
    </div>
  )
}

/* --------------------------------------------------------------- */
export function Panel({
  numero,
  titulo,
  hint,
  acoes,
  children,
  rodape,
}: {
  numero?: string
  titulo: string
  hint?: string
  acoes?: ReactNode
  children: ReactNode
  rodape?: ReactNode
}) {
  return (
    <section className="panel">
      <div className="panel__head">
        {numero && <span className="panel__num">{numero}</span>}
        <span className="panel__title">{titulo}</span>
        {hint && !acoes && <span className="panel__hint">{hint}</span>}
        {acoes && <div className="panel__actions">{acoes}</div>}
      </div>
      {children}
      {rodape}
    </section>
  )
}

/* --------------------------------------------------------------- */
/** Controle Sim/Não usado em todo o formulário da visita */
export function SimNaoInput({
  valor,
  onChange,
  disabled,
}: {
  valor: SimNao
  onChange: (v: SimNao) => void
  disabled?: boolean
}) {
  return (
    <div className="segmented" role="group">
      {(['Sim', 'Não'] as SimNao[]).map((v) => (
        <button
          key={v}
          type="button"
          data-v={v}
          disabled={disabled}
          className={valor === v ? 'is-on' : undefined}
          onClick={() => onChange(v)}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- */
export function Question({
  numero,
  texto,
  hint,
  controle,
  extra,
}: {
  numero?: string
  texto: string
  hint?: ReactNode
  controle: ReactNode
  extra?: ReactNode
}) {
  return (
    <div className="question">
      {numero && <div className="question__num">{numero}</div>}
      <div className="question__body">
        <div className="question__text">{texto}</div>
        {hint && <div className="question__hint">{hint}</div>}
        {extra}
      </div>
      <div className="question__control">{controle}</div>
    </div>
  )
}

/* --------------------------------------------------------------- */
export function Modal({
  titulo,
  subtitulo,
  largo,
  onClose,
  children,
  rodape,
}: {
  titulo: string
  subtitulo?: string
  largo?: boolean
  onClose: () => void
  children: ReactNode
  rodape?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${largo ? ' modal--wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal__head">
          <div>
            <div className="modal__title">{titulo}</div>
            {subtitulo && <div className="modal__sub">{subtitulo}</div>}
          </div>
          <button className="modal__close" onClick={onClose} type="button" aria-label="Fechar">
            <IconX />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {rodape && <div className="modal__foot">{rodape}</div>}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- */
export function Toast({ mensagem, onFim }: { mensagem: string; onFim: () => void }) {
  useEffect(() => {
    const t = setTimeout(onFim, 3200)
    return () => clearTimeout(t)
  }, [mensagem, onFim])

  return (
    <div className="toast">
      <i className="toast__dot" />
      {mensagem}
    </div>
  )
}

/* --------------------------------------------------------------- */
export function Placeholder({
  icone,
  titulo,
  texto,
}: {
  icone: ReactNode
  titulo: string
  texto: string
}) {
  return (
    <div className="placeholder">
      <div className="placeholder__icon">{icone}</div>
      <div className="placeholder__title">{titulo}</div>
      <div className="placeholder__text">{texto}</div>
    </div>
  )
}
