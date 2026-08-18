import { useState } from 'react'
import { Modal, Toast } from './ui'
import { IconCadeado } from './icons'
import { alterarMinhaSenha, useUsuarioLogado } from '../store'
import { SENHA_MIN } from '../types'

const VAZIO = { atual: '', nova: '', confirmacao: '' }

/**
 * Troca da própria senha, disponível em qualquer tela e para qualquer perfil.
 * Fica no bloco do usuário porque é ali que a pessoa procura o que é dela —
 * a tela de Usuários serve ao Admin mexendo na conta dos outros.
 */
export default function MinhaSenha() {
  const usuario = useUsuarioLogado()
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState(VAZIO)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  /** quem nunca teve senha está definindo a primeira: não há atual para conferir */
  const primeiraDefinicao = !usuario.senha

  function abrir() {
    setForm(VAZIO)
    setErro('')
    setAberto(true)
  }

  function salvar() {
    if (form.nova !== form.confirmacao) {
      setErro('A confirmação não confere com a nova senha.')
      return
    }

    const r = alterarMinhaSenha(form.atual, form.nova)
    if (!r.ok) {
      setErro(r.erro ?? 'Não foi possível alterar a senha.')
      return
    }

    setAberto(false)
    setAviso(primeiraDefinicao ? 'Senha definida.' : 'Senha alterada.')
  }

  return (
    <>
      <button
        className="btn btn--ghost btn--sm"
        type="button"
        onClick={abrir}
        title={primeiraDefinicao ? 'Definir minha senha' : 'Alterar minha senha'}
      >
        <IconCadeado /> {primeiraDefinicao ? 'Definir senha' : 'Minha senha'}
      </button>

      {aberto && (
        <Modal
          titulo={primeiraDefinicao ? 'Definir minha senha' : 'Alterar minha senha'}
          subtitulo={`${usuario.nome} · login ${usuario.login}`}
          onClose={() => setAberto(false)}
          rodape={
            <>
              {erro && <span className="err-msg">{erro}</span>}
              <span className="spacer" />
              <button className="btn btn--ghost" type="button" onClick={() => setAberto(false)}>
                Cancelar
              </button>
              <button className="btn btn--primary" type="button" onClick={salvar}>
                {primeiraDefinicao ? 'Definir senha' : 'Alterar senha'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            {!primeiraDefinicao && (
              <div className="field span-2">
                <label htmlFor="senha-atual">Senha atual</label>
                <input
                  id="senha-atual"
                  type="password"
                  autoComplete="current-password"
                  value={form.atual}
                  onChange={(e) => setForm({ ...form, atual: e.target.value })}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="senha-nova">Nova senha</label>
              <input
                id="senha-nova"
                type="password"
                autoComplete="new-password"
                value={form.nova}
                onChange={(e) => setForm({ ...form, nova: e.target.value })}
              />
              <span className="field__hint">Mínimo de {SENHA_MIN} caracteres.</span>
            </div>
            <div className="field">
              <label htmlFor="senha-confirmacao">Confirmar nova senha</label>
              <input
                id="senha-confirmacao"
                type="password"
                autoComplete="new-password"
                value={form.confirmacao}
                onChange={(e) => setForm({ ...form, confirmacao: e.target.value })}
              />
            </div>
          </div>

          {primeiraDefinicao && (
            <div className="alert alert--info" style={{ marginTop: 16 }}>
              Sua conta ainda não tem senha, então basta escolher uma. Das próximas vezes a senha
              atual será pedida.
            </div>
          )}
        </Modal>
      )}

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </>
  )
}
