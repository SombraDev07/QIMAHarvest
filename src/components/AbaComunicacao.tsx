import { useMemo, useState } from 'react'
import { Modal, Panel } from './ui'
import { IconAlerta, IconLista } from './icons'
import { Compositor, ListaMensagens, mensagensOrdenadas } from './Conversa'
import {
  certificarVisita,
  devolverParaCentral,
  enviarMensagem,
  enviarParaOperacao,
  obterParametros,
  registrarValidacao,
} from '../store'
import { aplicarLiberacoes, type Alerta } from '../analise'
import type { Visita } from '../types'
import { fmtDataHora } from '../format'

export default function AbaComunicacao({
  visita,
  alertas,
  onAviso,
  onIrParaAnalise,
}: {
  visita: Visita
  alertas: Alerta[]
  onAviso: (msg: string) => void
  onIrParaAnalise: () => void
}) {
  const [certificando, setCertificando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [enviandoErros, setEnviandoErros] = useState(false)

  const { ativos } = aplicarLiberacoes(alertas, visita.errosLiberados)
  const erros = ativos.filter((a) => a.severidade === 'erro')
  const atencoes = ativos.filter((a) => a.severidade === 'atencao')

  const mensagens = useMemo(() => mensagensOrdenadas(visita), [visita])

  function validar() {
    registrarValidacao(visita.cod, erros.length, atencoes.length)
    onAviso(
      erros.length === 0 && atencoes.length === 0
        ? 'Validação concluída: nenhuma inconsistência.'
        : `Validação concluída: ${erros.length} erro(s) e ${atencoes.length} atenção(ões) registrados na análise.`,
    )
    if (ativos.length) onIrParaAnalise()
  }

  function certificar() {
    if (erros.length === 0) {
      certificarVisita(visita.cod, [])
      onAviso('Visita certificada.')
      return
    }
    setCertificando(true)
  }

  const certificada = visita.situacao === 'certificada'
  const naCentral = visita.situacao === 'central-correcao'
  const naOperacao = visita.situacao === 'operacao-correcao'

  return (
    <>
      <Panel
        numero="7."
        titulo="Comunicação da visita"
        hint={`${mensagens.length} registro(s) · ordem cronológica`}
      >
        <ListaMensagens mensagens={mensagens} />

        <Compositor visita={visita} />

        <div className="acoes-visita">
          <div className="acoes-visita__estado">
            {erros.length > 0 ? (
              <span className="acoes-visita__pendencia">
                <IconAlerta size={15} />
                {erros.length} erro(s) bloqueando a certificação
                {atencoes.length > 0 && ` · ${atencoes.length} de atenção`}
              </span>
            ) : (
              <span className="acoes-visita__ok">
                ✓ Sem erros bloqueando
                {atencoes.length > 0 && ` · ${atencoes.length} ponto(s) de atenção`}
              </span>
            )}
            {visita.ultimaValidacao && (
              <span className="acoes-visita__validacao">
                Última validação por {visita.ultimaValidacao.por} em{' '}
                {fmtDataHora(visita.ultimaValidacao.ts)}
              </span>
            )}
          </div>

          <button className="btn btn--ghost" type="button" onClick={validar}>
            <IconLista size={15} /> Validar
          </button>
          {erros.length > 0 && (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => setEnviandoErros(true)}
            >
              <IconAlerta size={15} /> Enviar erros ao chat
            </button>
          )}
          {naCentral && (
            <button className="btn btn--dark" type="button" onClick={() => setEnviando(true)}>
              Enviar para operação
            </button>
          )}
          {naOperacao && (
            <button className="btn btn--dark" type="button" onClick={() => setEnviando(true)}>
              Enviar para central
            </button>
          )}
          <button
            className="btn btn--certificar"
            type="button"
            onClick={certificar}
            disabled={certificada}
          >
            {certificada ? 'Visita certificada' : 'Certificar'}
          </button>
        </div>
      </Panel>

      {enviando && (
        <ModalConfirmarEnvio
          titulo={naOperacao ? 'Enviar para a Central' : 'Enviar para a Operação'}
          pergunta={
            naOperacao
              ? 'Tem certeza que deseja enviar esta visita para a Central?'
              : 'Tem certeza que deseja enviar esta visita para a Operação?'
          }
          confirmarLabel={naOperacao ? 'Enviar para central' : 'Enviar para operação'}
          onClose={() => setEnviando(false)}
          onConfirmar={() => {
            if (naOperacao) devolverParaCentral(visita.cod)
            else enviarParaOperacao(visita.cod)
            setEnviando(false)
            onAviso(naOperacao ? 'Visita enviada à Central.' : 'Visita enviada à Operação.')
          }}
        />
      )}

      {certificando && (
        <ModalCertificar
          erros={erros}
          onClose={() => setCertificando(false)}
          onConfirmar={(liberacoes) => {
            certificarVisita(visita.cod, liberacoes)
            setCertificando(false)
            onAviso(`Visita certificada com ${liberacoes.length} erro(s) liberado(s).`)
          }}
        />
      )}

      {enviandoErros && (
        <ModalEnviarErros
          erros={erros}
          onClose={() => setEnviandoErros(false)}
          onConfirmar={(selecionados) => {
            enviarMensagem(visita.cod, formatarErrosParaChat(selecionados))
            setEnviandoErros(false)
            onAviso(`${selecionados.length} erro(s) enviado(s) para o chat.`)
          }}
        />
      )}
    </>
  )
}

/** monta a mensagem enviada ao chat: carga, regra quebrada e o detalhe do problema */
function formatarErrosParaChat(erros: Alerta[]) {
  const linhas = erros.map((e) => {
    const alvo = e.cargaId ? `Carga ${e.cargaId}` : 'Visita'
    const valor = e.valor ? ` (${e.valor})` : ''
    return `• ${alvo} — ${e.regra}${valor}: ${e.detalhe}`
  })
  // cabeçalho configurável em Administração → Parâmetros
  const cabecalho = obterParametros().mensagemErroChat.replace(
    '{quantidade}',
    String(erros.length),
  )
  return `${cabecalho}\n${linhas.join('\n')}`
}

/* ------------------------------------------------------------------ */
function ModalConfirmarEnvio({
  titulo,
  pergunta,
  confirmarLabel,
  onClose,
  onConfirmar,
}: {
  titulo: string
  pergunta: string
  confirmarLabel: string
  onClose: () => void
  onConfirmar: () => void
}) {
  return (
    <Modal
      titulo={titulo}
      onClose={onClose}
      rodape={
        <>
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--primary" type="button" onClick={onConfirmar}>
            {confirmarLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{pergunta}</p>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
function ModalCertificar({
  erros,
  onClose,
  onConfirmar,
}: {
  erros: Alerta[]
  onClose: () => void
  onConfirmar: (liberacoes: { alertaId: string; regra: string; justificativa: string }[]) => void
}) {
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const [justificativas, setJustificativas] = useState<Record<string, string>>({})

  const liberados = erros.filter((e) => marcados[e.id])
  const semJustificativa = liberados.filter((e) => !(justificativas[e.id] ?? '').trim())
  const restantes = erros.filter((e) => !marcados[e.id])
  const podeCertificar = restantes.length === 0 && semJustificativa.length === 0

  return (
    <Modal
      titulo="Certificar com erros pendentes"
      subtitulo={`${erros.length} erro(s) ainda bloqueiam esta visita. Para certificar, libere cada um com justificativa.`}
      largo
      onClose={onClose}
      rodape={
        <>
          <span className="err-msg">
            {restantes.length > 0
              ? `${restantes.length} erro(s) ainda não liberado(s).`
              : semJustificativa.length > 0
                ? `${semJustificativa.length} liberação(ões) sem justificativa.`
                : 'Todos os erros liberados e justificados.'}
          </span>
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn--certificar"
            type="button"
            disabled={!podeCertificar}
            onClick={() =>
              onConfirmar(
                liberados.map((e) => ({
                  alertaId: e.id,
                  regra: e.regra,
                  justificativa: justificativas[e.id].trim(),
                })),
              )
            }
          >
            Certificar assim mesmo
          </button>
        </>
      }
    >
      <div className="liberacoes">
        {erros.map((e) => {
          const marcado = Boolean(marcados[e.id])
          return (
            <div className={`liberacao${marcado ? ' is-liberado' : ''}`} key={e.id}>
              <label className="liberacao__topo">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={(ev) =>
                    setMarcados((m) => ({ ...m, [e.id]: ev.target.checked }))
                  }
                />
                <span className="liberacao__regra">{e.regra}</span>
                {e.valor && <span className="liberacao__valor">{e.valor}</span>}
                {e.cargaId && <span className="liberacao__id mono">carga {e.cargaId}</span>}
              </label>
              <div className="liberacao__detalhe">{e.detalhe}</div>
              {marcado && (
                <div className="field" style={{ marginTop: 10 }}>
                  <label htmlFor={`just-${e.id}`}>Por que este erro pode passar?</label>
                  <input
                    id={`just-${e.id}`}
                    value={justificativas[e.id] ?? ''}
                    onChange={(ev) =>
                      setJustificativas((j) => ({ ...j, [e.id]: ev.target.value }))
                    }
                    placeholder="Ex.: desconto confirmado pelo laudo de umidade da unidade, anexo enviado."
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
function ModalEnviarErros({
  erros,
  onClose,
  onConfirmar,
}: {
  erros: Alerta[]
  onClose: () => void
  onConfirmar: (selecionados: Alerta[]) => void
}) {
  const [marcados, setMarcados] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(erros.map((e) => [e.id, true])),
  )

  const selecionados = erros.filter((e) => marcados[e.id])

  return (
    <Modal
      titulo="Enviar erros ao chat"
      subtitulo="Selecione os erros que devem entrar na conversa da visita, com a carga e a regra quebrada."
      largo
      onClose={onClose}
      rodape={
        <>
          <span className="err-msg">
            {selecionados.length === 0 && 'Selecione ao menos um erro.'}
          </span>
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={selecionados.length === 0}
            onClick={() => onConfirmar(selecionados)}
          >
            Enviar {selecionados.length || ''} para o chat
          </button>
        </>
      }
    >
      <div className="liberacoes">
        {erros.map((e) => {
          const marcado = Boolean(marcados[e.id])
          return (
            <div className={`liberacao${marcado ? ' is-liberado' : ''}`} key={e.id}>
              <label className="liberacao__topo">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={(ev) =>
                    setMarcados((m) => ({ ...m, [e.id]: ev.target.checked }))
                  }
                />
                <span className="liberacao__regra">{e.regra}</span>
                {e.valor && <span className="liberacao__valor">{e.valor}</span>}
                {e.cargaId && <span className="liberacao__id mono">carga {e.cargaId}</span>}
              </label>
              <div className="liberacao__detalhe">{e.detalhe}</div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
