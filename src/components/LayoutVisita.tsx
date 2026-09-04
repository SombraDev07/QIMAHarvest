import { useState } from 'react'
import { Link, Navigate, Outlet, useParams } from 'react-router-dom'
import { LogoQima } from './Logo'
import { Modal, Toast } from './ui'
import { IconLink, IconLista, IconLog } from './icons'
import { situacaoPorId } from '../data/mock'
import { useFalhaPersistencia, useUsuarioLogado, useVisita, useVisitaCarregando } from '../store'
import { iniciais } from '../usuario'
import MinhaSenha from './MinhaSenha'
import BotaoSair from './BotaoSair'
import SeletorIdioma from './SeletorIdioma'
import LogAlteracoes from './LogAlteracoes'
import { ehPerfilRtv } from '../types'

/** copia com fallback para navegadores sem permissão de clipboard */
async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const campo = document.createElement('textarea')
    campo.value = texto
    campo.style.position = 'fixed'
    campo.style.opacity = '0'
    document.body.appendChild(campo)
    campo.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(campo)
    return ok
  }
}

/**
 * Layout dedicado ao registro da visita: sem as abas globais do sistema,
 * com a identificação da visita fixa no topo e o link permanente à mão.
 */
export default function LayoutVisita() {
  const usuario = useUsuarioLogado()
  const falhaAoGravar = useFalhaPersistencia()
  const { cod } = useParams<{ cod: string }>()
  const visita = useVisita(Number(cod))
  const carregando = useVisitaCarregando(Number(cod))
  const [aviso, setAviso] = useState<string | null>(null)
  /** aberto quando o navegador bloqueia a cópia automática */
  const [linkManual, setLinkManual] = useState(false)
  const [mostrarLog, setMostrarLog] = useState(false)

  if (ehPerfilRtv(usuario.perfil)) return <Navigate to="/ocorrencias" replace />

  const meta = visita ? situacaoPorId(visita.situacao) : null
  const link = window.location.href
  const qtdLog = visita?.logAlteracoes.length ?? 0

  return (
    <div className="app">
      <header className="topbar topbar--visita">
        <Link to="/visitas" className="brand" title="Ir para o painel de visitas">
          <LogoQima height={22} />
        </Link>

        <span className="brand__divider" />

        <div className="visita-head">
          <div className="visita-head__cod">
            Visita nº {cod}
            {meta && (
              <span
                className="badge visita-head__situacao"
                style={{ color: meta.color, background: '#fff', borderColor: 'transparent' }}
              >
                {meta.short}
              </span>
            )}
          </div>
          <div className="visita-head__pdr">
            {visita ? visita.pdr.nome : carregando ? 'Carregando…' : 'Visita não encontrada'}
            {visita && (
              <span className="visita-head__meta">
                CNPJ {visita.pdr.cnpj} · {visita.pdr.cidade}/{visita.pdr.uf} · {visita.data}
              </span>
            )}
          </div>
        </div>

        <div className="topbar__spacer" />

        {visita && (
          <button
            type="button"
            className="btn-topo"
            title="Log de alterações desta visita"
            onClick={() => setMostrarLog(true)}
          >
            <IconLog size={15} /> Log
            {qtdLog > 0 && <span className="btn-topo__count">{qtdLog}</span>}
          </button>
        )}

        <button
          type="button"
          className="btn-topo"
          title={`Copiar link permanente: ${link}`}
          onClick={async () => {
            if (await copiar(link)) setAviso('Link da visita copiado para a área de transferência.')
            else setLinkManual(true)
          }}
        >
          <IconLink size={15} /> Copiar link
        </button>

        <Link to="/visitas" className="btn-topo">
          <IconLista size={15} /> Todas as visitas
        </Link>

        <div className="user">
          <div className="user__avatar">{iniciais(usuario.nome)}</div>
          <div className="user__name">
            {usuario.nome}
            <div className="user__role">{usuario.perfil}</div>
          </div>
          <MinhaSenha />
          <BotaoSair />
          <SeletorIdioma />
        </div>
      </header>

      {falhaAoGravar && (
        <div className="faixa-falha" role="alert">
          <strong>Alterações não estão sendo salvas.</strong> {falhaAoGravar}
        </div>
      )}

      <Outlet />

      {mostrarLog && visita && (
        <Modal
          titulo="Log de alterações"
          subtitulo="Quem mudou o quê nesta visita — edição na tela e import em massa"
          largo
          onClose={() => setMostrarLog(false)}
          rodape={
            <>
              <span className="spacer" />
              <button className="btn btn--primary" type="button" onClick={() => setMostrarLog(false)}>
                Fechar
              </button>
            </>
          }
        >
          <LogAlteracoes itens={visita.logAlteracoes} />
        </Modal>
      )}

      {linkManual && (
        <Modal
          titulo="Link permanente da visita"
          subtitulo="Seu navegador bloqueou a cópia automática — selecione e copie com Ctrl+C."
          onClose={() => setLinkManual(false)}
          rodape={
            <>
              <span className="spacer" />
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => setLinkManual(false)}
              >
                Fechar
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="link-visita">Endereço</label>
            <input
              id="link-visita"
              readOnly
              value={link}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }}
            />
            <span className="field__hint">
              Quem receber este endereço abre exatamente esta visita, desde que tenha acesso ao
              sistema.
            </span>
          </div>
        </Modal>
      )}

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </div>
  )
}
