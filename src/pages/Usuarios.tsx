import { useState } from 'react'
import { useT } from '../i18n'
import { Breadcrumb, Modal, PageHead, Toast } from '../components/ui'
import { IconEditar, IconInfo, IconLixeira, IconMais } from '../components/icons'
import { SituacaoBadgePdr } from './PDRs'
import {
  adicionarUsuario,
  atualizarUsuario,
  cpfJaCadastrado,
  definirCredenciais,
  emailJaCadastrado,
  loginJaCadastrado,
  entrarComo,
  removerUsuario,
  useUsuarioLogado,
  useUsuarios,
} from '../store'
import { cpfValido, emailValido, mascaraCpf, mascaraTelefone } from '../format'
import {
  PERFIS,
  SENHA_MIN,
  SITUACOES_CADASTRO,
  podeDefinirCredenciais,
  podeEditarVisita,
  type Perfil,
  type SituacaoCadastro,
  type Usuario,
} from '../types'
import { corDoNome, iniciais } from '../usuario'

const FORM_VAZIO: Omit<Usuario, 'id'> = {
  nome: '',
  login: '',
  senha: '',
  email: '',
  telefone: '',
  cpf: '',
  perfil: 'Information Analyst',
  situacao: 'Ativo',
}

export default function Usuarios() {
  const usuarios = useUsuarios()
  const logado = useUsuarioLogado()
  const t = useT()

  /** null = formulário fechado; string vazia = novo; id = editando aquele usuário */
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroPerfil, setFiltroPerfil] = useState<'Todos' | Perfil>('Todos')
  const [removendo, setRemovendo] = useState<Usuario | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  function fecharForm() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setErro('')
  }

  function abrirNovo() {
    setForm(FORM_VAZIO)
    setErro('')
    setEditandoId('')
  }

  function abrirEdicao(u: Usuario) {
    setForm({
      nome: u.nome,
      login: u.login,
      // senha nunca volta preenchida: campo em branco significa "manter a atual"
      senha: '',
      email: u.email ?? '',
      telefone: u.telefone ?? '',
      cpf: u.cpf ?? '',
      perfil: u.perfil,
      situacao: u.situacao,
    })
    setErro('')
    setEditandoId(u.id)
  }

  function salvar() {
    // só nome e login são exigidos: o resto do cadastro pode ficar em branco
    if (!form.nome.trim()) return setErro('Nome é obrigatório.')
    if (!form.login.trim()) return setErro('Login é obrigatório.')
    if (loginJaCadastrado(form.login, editandoId || undefined))
      return setErro('Já existe usuário com este login.')
    if (!emailValido(form.email ?? '')) return setErro('E-mail em formato inválido.')
    if (emailJaCadastrado(form.email ?? '', editandoId || undefined))
      return setErro('Já existe usuário com este e-mail.')
    if (!cpfValido(form.cpf ?? '')) return setErro('CPF incompleto — precisa ter 11 dígitos.')
    if (cpfJaCadastrado(form.cpf ?? '', editandoId || undefined))
      return setErro('Já existe usuário com este CPF.')
    if ((form.senha ?? '').length > 0 && (form.senha ?? '').length < SENHA_MIN)
      return setErro(`Senha muito curta — mínimo de ${SENHA_MIN} caracteres.`)

    const { senha, ...cadastro } = form
    const dados = {
      ...cadastro,
      nome: form.nome.trim(),
      login: form.login.trim(),
      email: (form.email ?? '').trim().toLowerCase(),
    }

    if (editandoId) {
      atualizarUsuario(editandoId, dados)
      // senha em branco na edição significa "manter a que já estava"
      if (ehAdmin && senha) definirCredenciais(editandoId, dados.login, senha)
      setAviso(`Usuário ${dados.nome} atualizado.`)
    } else {
      const novo = adicionarUsuario({ ...dados, senha: senha || undefined })
      setAviso(
        senha
          ? `Usuário criado com o ID ${novo.id} e senha definida.`
          : `Usuário criado com o ID ${novo.id}. A senha ainda precisa ser definida por um Admin.`,
      )
    }

    fecharForm()
  }

  function confirmarRemocao() {
    if (!removendo) return
    const ok = removerUsuario(removendo.id)
    setAviso(
      ok
        ? `Usuário ${removendo.nome} removido.`
        : 'O último usuário não pode ser removido — sem ele não há sessão.',
    )
    setRemovendo(null)
  }

  const filtrados = usuarios.filter((u) => {
    if (filtroPerfil !== 'Todos' && u.perfil !== filtroPerfil) return false
    if (!busca) return true
    const b = busca.toLowerCase()
    return (
      u.id.toLowerCase().includes(b) ||
      u.nome.toLowerCase().includes(b) ||
      (u.email ?? '').toLowerCase().includes(b) ||
      (u.cpf ?? '').includes(b) ||
      (u.telefone ?? '').includes(b) ||
      u.login.toLowerCase().includes(b) ||
      u.perfil.toLowerCase().includes(b)
    )
  })

  const comAcesso = usuarios.filter((u) => podeEditarVisita(u.perfil)).length
  const ehAdmin = podeDefinirCredenciais(logado.perfil)
  const semSenha = usuarios.filter((u) => !u.senha).length

  return (
    <main className="page">
      <Breadcrumb
        trilha={[
          { label: 'Início', to: '/visitas' },
          { label: t('Administração'), to: '/administracao' },
          { label: t('Usuários') },
        ]}
      />
      <PageHead
        titulo={t("Usuários")}
        subtitulo="Perfis de acesso ao sistema — o perfil define quem pode alterar os dados de uma visita"
        acoes={
          <button className="btn btn--primary" type="button" onClick={abrirNovo}>
            <IconMais /> {t('Novo usuário')}
          </button>
        }
      />

      <div className="alert alert--info" style={{ marginBottom: 20 }}>
        <IconInfo />
        <span>
          Você está logado como <strong>{logado.nome}</strong> ({logado.perfil}) e{' '}
          <strong>{podeEditarVisita(logado.perfil) ? 'pode' : 'não pode'}</strong> editar os dados
          das visitas. Use <strong>Entrar como</strong> para ver o sistema pelos olhos de outro
          perfil.
        </span>
      </div>

      {editandoId !== null && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel__head">
            <span className="panel__title">
              {editandoId ? `Editar usuário — ${editandoId}` : 'Novo usuário'}
            </span>
          </div>
          <div className="filters__grid" style={{ padding: '4px 0' }}>
            <div className="field">
              <label htmlFor="u-nome">Nome</label>
              <input
                id="u-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Ana Paula Souza"
              />
            </div>
            <div className="field">
              <label htmlFor="u-login">Login</label>
              <input
                id="u-login"
                value={form.login}
                disabled={!!editandoId && !ehAdmin}
                onChange={(e) =>
                  setForm({ ...form, login: e.target.value.trim().toLowerCase() })
                }
                placeholder="nome.sobrenome"
              />
              <span className="field__hint">
                {editandoId && !ehAdmin
                  ? 'Só um Admin altera o login.'
                  : 'É por ele que a pessoa entra no sistema.'}
              </span>
            </div>
            <div className="field">
              <label htmlFor="u-senha">Senha</label>
              <input
                id="u-senha"
                type="password"
                autoComplete="new-password"
                value={form.senha ?? ''}
                disabled={!ehAdmin}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                placeholder={editandoId ? 'deixe em branco para manter' : `mínimo ${SENHA_MIN}`}
              />
              <span className="field__hint">
                {ehAdmin
                  ? editandoId
                    ? 'Em branco mantém a senha atual.'
                    : `Mínimo de ${SENHA_MIN} caracteres. Pode ficar vazia e ser definida depois.`
                  : 'Só um Admin define senha.'}
              </span>
            </div>
            <div className="field">
              <label htmlFor="u-email">E-mail</label>
              <input
                id="u-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value.trim() })}
                placeholder="nome.sobrenome@qima.com"
              />
            </div>
            <div className="field">
              <label htmlFor="u-cpf">CPF</label>
              <input
                id="u-cpf"
                inputMode="numeric"
                maxLength={14}
                value={form.cpf ?? ''}
                onChange={(e) => setForm({ ...form, cpf: mascaraCpf(e.target.value) })}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="field">
              <label htmlFor="u-tel">Celular</label>
              <input
                id="u-tel"
                inputMode="tel"
                value={form.telefone ?? ''}
                onChange={(e) => setForm({ ...form, telefone: mascaraTelefone(e.target.value) })}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="field">
              <label htmlFor="u-perfil">Perfil</label>
              <select
                id="u-perfil"
                value={form.perfil}
                onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })}
              >
                {PERFIS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <span className="field__hint">
                {podeEditarVisita(form.perfil)
                  ? 'Este perfil edita os dados da visita.'
                  : 'Este perfil abre a visita em leitura, mas não altera os dados.'}
              </span>
            </div>
            <div className="field">
              <label htmlFor="u-situacao">Situação</label>
              <select
                id="u-situacao"
                value={form.situacao}
                onChange={(e) =>
                  setForm({ ...form, situacao: e.target.value as SituacaoCadastro })
                }
              >
                {SITUACOES_CADASTRO.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          {erro && <div className="err-msg" style={{ marginTop: 8 }}>{erro}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn--primary" type="button" onClick={salvar}>
              {editandoId ? 'Salvar alterações' : 'Salvar'}
            </button>
            <button className="btn btn--ghost" type="button" onClick={fecharForm}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      <div className="filters__grid" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="u-busca">Buscar usuário</label>
          <input
            id="u-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, e-mail ou perfil…"
          />
        </div>
        <div className="field">
          <label htmlFor="u-filtro-perfil">Perfil</label>
          <select
            id="u-filtro-perfil"
            value={filtroPerfil}
            onChange={(e) => setFiltroPerfil(e.target.value as 'Todos' | Perfil)}
          >
            <option>Todos</option>
            {PERFIS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel__body" style={{ paddingTop: 0 }}>
        <span className="cell-muted">
          {filtrados.length} de {usuarios.length} usuário(s) · {comAcesso} com permissão de editar
          visita{semSenha > 0 && ` · ${semSenha} sem senha definida`}
        </span>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('Usuário')}</th>
                <th>{t('Login')}</th>
                <th>{t('Senha')}</th>
                <th>{t('Contato')}</th>
                <th>{t('CPF')}</th>
                <th>{t('Perfil')}</th>
                <th>{t('Edita visita?')}</th>
                <th>{t('Situação')}</th>
                <th style={{ width: 200 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((u) => {
                const edita = podeEditarVisita(u.perfil)
                const ehLogado = u.id === logado.id
                return (
                  <tr key={u.id} className={u.situacao === 'Inativo' ? 'row-inativo' : undefined}>
                    <td>
                      <div className="usuario-celula">
                        <span
                          className="user__avatar user__avatar--sm"
                          style={{ background: corDoNome(u.nome) }}
                        >
                          {iniciais(u.nome)}
                        </span>
                        <div>
                          <div className="cell-strong">{u.nome}</div>
                          <div className="cell-muted mono">{u.id}</div>
                        </div>
                        {ehLogado && <span className="chip chip--info">você</span>}
                      </div>
                    </td>
                    <td className="mono">{u.login}</td>
                    <td>
                      {u.senha ? (
                        <span className="cell-muted" title="Senha definida">
                          ••••••
                        </span>
                      ) : (
                        <span className="tag-acesso">pendente</span>
                      )}
                    </td>
                    <td className="cell-muted">
                      <div>{u.email || '—'}</div>
                      {u.telefone && <div className="mono">{u.telefone}</div>}
                    </td>
                    <td className="mono cell-muted">{u.cpf || '—'}</td>
                    <td>{u.perfil}</td>
                    <td>
                      <span className={edita ? 'tag-acesso tag-acesso--sim' : 'tag-acesso'}>
                        {edita ? t('Edita') : t('Leitura')}
                      </span>
                    </td>
                    <td>
                      <SituacaoBadgePdr situacao={u.situacao} />
                    </td>
                    <td>
                      <div className="carga-acoes">
                        <button
                          className="btn btn--ghost btn--sm"
                          type="button"
                          disabled={ehLogado || u.situacao === 'Inativo'}
                          title={
                            u.situacao === 'Inativo'
                              ? 'Usuário inativo não entra no sistema'
                              : 'Ver o sistema como este usuário'
                          }
                          onClick={() => {
                            entrarComo(u.id)
                            setAviso(`Agora você está como ${u.nome} (${u.perfil}).`)
                          }}
                        >
                          {t('Entrar como')}
                        </button>
                        <button
                          className="btn btn--ghost btn--sm btn--icon"
                          type="button"
                          title="Editar usuário"
                          onClick={() => abrirEdicao(u)}
                        >
                          <IconEditar />
                        </button>
                        <button
                          className="btn btn--danger btn--sm btn--icon"
                          type="button"
                          title="Remover usuário"
                          onClick={() => setRemovendo(u)}
                        >
                          <IconLixeira />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">
                    Nenhum usuário encontrado com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {removendo && (
        <Modal
          titulo="Remover usuário"
          onClose={() => setRemovendo(null)}
          rodape={
            <>
              <span className="spacer" />
              <button className="btn btn--ghost" type="button" onClick={() => setRemovendo(null)}>
                Cancelar
              </button>
              <button className="btn btn--primary" type="button" onClick={confirmarRemocao}>
                Remover definitivamente
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            Confirma a remoção de <strong>{removendo.nome}</strong> ({removendo.email})?
          </p>
          <div className="alert alert--info" style={{ marginTop: 14 }}>
            As mensagens e validações que ele já registrou continuam nas visitas, com o nome
            preservado. Se o objetivo é só tirar o acesso, use <strong>Inativo</strong>.
          </div>
        </Modal>
      )}

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </main>
  )
}
