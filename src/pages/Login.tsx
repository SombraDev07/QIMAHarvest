import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogoQima } from '../components/Logo'
import { autenticar, obterUsuarioLogado, useSessaoAtiva } from '../store'
import { rotaInicial, rotaPermitida } from '../types'
import { useT } from '../i18n'

export default function Login() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const logado = useSessaoAtiva()
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (logado) {
    const from = (location.state as { from?: string } | null)?.from
    const perfil = obterUsuarioLogado().perfil
    const destino =
      from && from !== '/login' && rotaPermitida(perfil, from) ? from : rotaInicial(perfil)
    return <Navigate to={destino} replace />
  }

  function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const r = autenticar(login, senha)
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro ?? t('Login ou senha inválidos.'))
      return
    }
    const from = (location.state as { from?: string } | null)?.from
    const perfil = obterUsuarioLogado().perfil
    const destino =
      from && from !== '/login' && rotaPermitida(perfil, from) ? from : rotaInicial(perfil)
    navigate(destino, { replace: true })
  }

  return (
    <div className="login">
      <aside className="login__hero" aria-hidden="true">
        <img className="login__foto" src="/login-safra.png" alt="" />
        <div className="login__hero-copy">
          <span className="login__kicker">QIMA Harvest</span>
          <h1>{t('Coleta de soja em campo')}</h1>
          <p>SAFRA 2025/2026 · BRASIL</p>
        </div>
      </aside>

      <main className="login__panel">
        <div className="login__card">
          <div className="login__brand">
            <LogoQima height={28} />
            <span className="brand__divider" />
            <span className="brand__app">
              <b>Harvest</b> 2026
            </span>
          </div>

          <h2>{t('Acessar o Harvest')}</h2>
          <p className="login__lead">
            {t('Entre com o login e a senha definidos pelo administrador.')}
          </p>

          <form className="login__form" onSubmit={enviar}>
            <div className="field">
              <label htmlFor="login-usuario">{t('Login')}</label>
              <input
                id="login-usuario"
                autoComplete="username"
                autoFocus
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Bruno.Ferreira"
              />
            </div>
            <div className="field">
              <label htmlFor="login-senha">{t('Senha')}</label>
              <input
                id="login-senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>

            {erro && (
              <div className="err-msg" role="alert">
                {erro}
              </div>
            )}

            <button className="btn btn--primary login__submit" type="submit" disabled={enviando}>
              {t('Entrar')}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
