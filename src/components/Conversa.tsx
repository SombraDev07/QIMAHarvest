import { useEffect, useMemo, useRef, useState } from 'react'
import { IconAlerta } from './icons'
import { enviarMensagem } from '../store'
import type { Mensagem, Visita } from '../types'
import { USUARIO, corDoNome, iniciais } from '../usuario'
import { fmtDataHora } from '../format'

/** mensagens da visita em ordem cronológica — usado no resumo e no chat flutuante */
export function mensagensOrdenadas(visita: Visita): Mensagem[] {
  return [...visita.mensagens].sort((a, b) => a.ts - b.ts)
}

export function ListaMensagens({ mensagens }: { mensagens: Mensagem[] }) {
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'nearest' })
  }, [mensagens.length])

  return (
    <div className="conversa">
      {mensagens.length === 0 && (
        <div className="conversa__vazio">
          Nenhuma mensagem ainda. Use o campo abaixo para registrar o primeiro apontamento.
        </div>
      )}

      {mensagens.map((m) =>
        m.tipo === 'sistema' ? (
          <div className="msg-sistema" key={m.id}>
            <span className="msg-sistema__texto">{m.texto}</span>
            <span className="msg-sistema__hora">{fmtDataHora(m.ts)}</span>
          </div>
        ) : (
          <article className={`msg${m.autor === USUARIO.nome ? ' msg--propria' : ''}`} key={m.id}>
            <div className="msg__avatar" style={{ background: corDoNome(m.autor) }}>
              {iniciais(m.autor)}
            </div>
            <div className="msg__balao">
              <div className="msg__topo">
                <span className="msg__autor">{m.autor}</span>
                <span className="msg__papel">{m.papel}</span>
                <span className="msg__hora">{fmtDataHora(m.ts)}</span>
              </div>
              <div className="msg__texto">{m.texto}</div>
              {m.responsavel && (
                <div className="msg__responsavel">
                  <IconAlerta size={12} />
                  Apontado como responsável: <strong>{m.responsavel}</strong>
                </div>
              )}
            </div>
          </article>
        ),
      )}
      <div ref={fim} />
    </div>
  )
}

export function Compositor({
  visita,
  compacto,
  onEnviado,
}: {
  visita: Visita
  /** versão reduzida usada no chat flutuante — sem o seletor de responsável */
  compacto?: boolean
  onEnviado?: () => void
}) {
  const [texto, setTexto] = useState('')
  const [responsavel, setResponsavel] = useState('')

  const equipe = useMemo(
    () =>
      [
        { nome: visita.consultor, papel: 'Consultor' },
        { nome: visita.lider, papel: 'Líder' },
        { nome: visita.liderFocal, papel: 'Líder focal' },
        { nome: visita.supervisor, papel: 'Supervisor' },
      ].filter((p, i, arr) => arr.findIndex((x) => x.nome === p.nome) === i),
    [visita.consultor, visita.lider, visita.liderFocal, visita.supervisor],
  )

  function publicar() {
    const limpo = texto.trim()
    if (!limpo) return
    enviarMensagem(visita.cod, limpo, responsavel || undefined)
    setTexto('')
    setResponsavel('')
    onEnviado?.()
  }

  return (
    <div className="compositor">
      <div className="compositor__avatar" style={{ background: corDoNome(USUARIO.nome) }}>
        {iniciais(USUARIO.nome)}
      </div>
      <div className="compositor__corpo">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`Escreva um apontamento sobre a visita ${visita.cod}…  (Ctrl+Enter envia)`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) publicar()
          }}
        />
        <div className="compositor__rodape">
          {!compacto && (
            <>
              <label className="compositor__label" htmlFor="resp">
                Responsável pelo apontamento
              </label>
              <select id="resp" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                <option value="">Ninguém em específico</option>
                {equipe.map((p) => (
                  <option key={p.nome} value={p.nome}>
                    {p.nome} — {p.papel}
                  </option>
                ))}
              </select>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button
            className="btn btn--primary btn--sm"
            type="button"
            onClick={publicar}
            disabled={!texto.trim()}
          >
            Enviar mensagem
          </button>
        </div>
      </div>
    </div>
  )
}
