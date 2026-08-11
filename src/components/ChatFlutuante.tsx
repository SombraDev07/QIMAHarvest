import { useMemo, useState } from 'react'
import { IconChat, IconNovaAba, IconX } from './icons'
import { Compositor, ListaMensagens, mensagensOrdenadas } from './Conversa'
import type { Visita } from '../types'

/** balão de chat fixo na tela — acesso ao histórico da conversa de qualquer aba da visita */
export default function ChatFlutuante({
  visita,
  onAbrirComunicacao,
}: {
  visita: Visita
  onAbrirComunicacao: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const mensagens = useMemo(() => mensagensOrdenadas(visita), [visita])

  return (
    <>
      <button
        type="button"
        className={`chat-flutuante__botao${aberto ? ' is-aberto' : ''}`}
        onClick={() => setAberto((v) => !v)}
        title="Comunicação da visita"
        aria-label="Abrir comunicação da visita"
      >
        <IconChat size={22} />
        {!aberto && mensagens.length > 0 && (
          <span className="chat-flutuante__badge">{mensagens.length}</span>
        )}
      </button>

      {aberto && (
        <div className="chat-flutuante__painel" role="dialog" aria-label="Comunicação da visita">
          <div className="chat-flutuante__head">
            <div>
              <div className="chat-flutuante__titulo">Comunicação da visita</div>
              <div className="chat-flutuante__sub">
                Visita {visita.cod} · {mensagens.length} registro(s)
              </div>
            </div>
            <div className="chat-flutuante__acoes">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  onAbrirComunicacao()
                  setAberto(false)
                }}
              >
                <IconNovaAba /> Aba completa
              </button>
              <button
                type="button"
                className="chat-flutuante__fechar"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
              >
                <IconX size={16} />
              </button>
            </div>
          </div>

          <ListaMensagens mensagens={mensagens} />
          <Compositor visita={visita} compacto />
        </div>
      )}
    </>
  )
}
