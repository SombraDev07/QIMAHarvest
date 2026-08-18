import { useState } from 'react'
import { useT } from '../i18n'
import { Breadcrumb, Modal, PageHead, Toast } from '../components/ui'
import { IconEditar, IconInfo, IconLixeira, IconMais, IconUpload } from '../components/icons'
import ImportarPdrs, { type PdrDaPlanilha } from '../components/ImportarPdrs'
import {
  adicionarPdr,
  atualizarPdr,
  definirSituacaoPdr,
  documentoJaCadastrado,
  importarPdrs,
  removerPdr,
  usePdrsCatalogo,
} from '../store'
import {
  coordenadaValida,
  emailValido,
  mascaraCoordenada,
  mascaraCpfCnpj,
  mascaraProdutor,
  mascaraTelefone,
} from '../format'
import { SITUACOES_CADASTRO, type PdrCatalogo, type SituacaoCadastro } from '../types'

const FORM_VAZIO: PdrDaPlanilha = {
  nome: '',
  cnpj: '',
  cidade: '',
  uf: '',
  situacao: 'Ativo',
  latitude: '',
  longitude: '',
  telefone: '',
  email: '',
  observacao: '',
}

/**
 * Verde para quem opera, vermelho para quem está fora. A cor sozinha não
 * basta — quem não distingue vermelho de verde precisa do ícone e do texto.
 */
export function SituacaoBadgePdr({ situacao }: { situacao: SituacaoCadastro }) {
  const ativo = situacao === 'Ativo'
  return (
    <span className={`situacao situacao--${ativo ? 'ativo' : 'inativo'}`}>
      <span className="situacao__ponto" aria-hidden="true">
        {ativo ? '✓' : '!'}
      </span>
      {situacao}
    </span>
  )
}

export default function PDRs() {
  const pdrs = usePdrsCatalogo()
  const t = useT()
  const [importando, setImportando] = useState(false)
  /** null = formulário fechado; string vazia = novo; id = editando aquele cadastro */
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState<'Todas' | SituacaoCadastro>('Todas')
  const [removendo, setRemovendo] = useState<PdrCatalogo | null>(null)
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

  function abrirEdicao(p: PdrCatalogo) {
    setForm({
      nome: p.nome,
      cnpj: p.cnpj,
      cidade: p.cidade,
      uf: p.uf,
      situacao: p.situacao,
      latitude: p.latitude ?? '',
      longitude: p.longitude ?? '',
      telefone: p.telefone ?? '',
      email: p.email ?? '',
      observacao: p.observacao ?? '',
    })
    setErro('')
    setEditandoId(p.id)
  }

  function salvar() {
    if (!form.nome.trim()) return setErro('Nome do PDR é obrigatório.')
    if (!form.cnpj.trim()) return setErro('CPF/CNPJ é obrigatório.')
    const digitos = form.cnpj.replace(/\D/g, '').length
    if (![11, 14].includes(digitos))
      return setErro('CPF/CNPJ incompleto — precisa ter 11 ou 14 dígitos.')
    if (!form.cidade.trim()) return setErro('Cidade é obrigatória.')
    if (!form.uf.trim()) return setErro('UF é obrigatória.')
    if (!coordenadaValida(form.latitude ?? '', 90))
      return setErro('Latitude fora da faixa — use um valor entre -90 e 90.')
    if (!coordenadaValida(form.longitude ?? '', 180))
      return setErro('Longitude fora da faixa — use um valor entre -180 e 180.')
    if (!emailValido(form.email ?? '')) return setErro('E-mail em formato inválido.')

    const dados = {
      ...form,
      nome: form.nome.trim(),
      cnpj: form.cnpj.trim(),
      cidade: form.cidade.trim(),
      uf: form.uf.trim().toUpperCase(),
    }

    if (editandoId) {
      atualizarPdr(editandoId, dados)
      setAviso(`Cadastro ${editandoId} atualizado.`)
    } else {
      const novo = adicionarPdr(dados)
      setAviso(`PDR cadastrado com o ID ${novo.id}.`)
    }

    fecharForm()
  }

  /** aviso, não bloqueio: a mesma inscrição pode ter mais de uma unidade */
  const documentoRepetido =
    form.cnpj.replace(/\D/g, '').length >= 11 &&
    documentoJaCadastrado(form.cnpj, editandoId || undefined)

  function importar(novos: PdrDaPlanilha[]) {
    const { novos: criados, atualizados } = importarPdrs(novos)
    setImportando(false)
    setAviso(
      `Importação concluída: ${criados} novo(s), ${atualizados} atualizado(s) pelo CPF/CNPJ.`,
    )
  }

  function confirmarRemocao() {
    if (!removendo) return
    removerPdr(removendo.id)
    setAviso(`PDR ${removendo.nome} removido do catálogo.`)
    setRemovendo(null)
  }

  const filtrados = pdrs.filter((p) => {
    if (filtroSituacao !== 'Todas' && p.situacao !== filtroSituacao) return false
    if (!busca) return true
    const b = busca.toLowerCase()
    return (
      p.id.includes(b) ||
      p.nome.toLowerCase().includes(b) ||
      p.cnpj.includes(b) ||
      p.cidade.toLowerCase().includes(b)
    )
  })

  const ativos = pdrs.filter((p) => p.situacao === 'Ativo').length

  return (
    <main className="page">
      <Breadcrumb
        trilha={[
          { label: 'Início', to: '/visitas' },
          { label: t('Administração'), to: '/administracao' },
          { label: "PDR's" },
        ]}
      />
      <PageHead
        titulo={t("Cadastro de PDR's")}
        subtitulo="Pontos de recebimento registrados no sistema — o CPF/CNPJ é o que liga a unidade às visitas"
        acoes={
          <>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => setImportando(true)}
            >
              <IconUpload /> {t('Importar planilha')}
            </button>
            <button className="btn btn--primary" type="button" onClick={abrirNovo}>
              <IconMais /> {t('Novo PDR')}
            </button>
          </>
        }
      />

      {editandoId !== null && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel__head">
            <span className="panel__title">
              {editandoId ? `Editar PDR — ID ${editandoId}` : 'Novo PDR'}
            </span>
          </div>
          <div className="filters__grid" style={{ padding: '4px 0' }}>
            <div className="field">
              <label htmlFor="pdr-nome">Nome do PDR</label>
              <input
                id="pdr-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: mascaraProdutor(e.target.value) })}
                placeholder="Ex: COOPERALFA LTDA"
              />
              <span className="field__hint">Caixa alta, sem acento.</span>
            </div>
            <div className="field">
              <label htmlFor="pdr-cnpj">CPF / CNPJ</label>
              <input
                id="pdr-cnpj"
                value={form.cnpj}
                inputMode="numeric"
                maxLength={18}
                onChange={(e) => setForm({ ...form, cnpj: mascaraCpfCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="field">
              <label htmlFor="pdr-cidade">Cidade</label>
              <input
                id="pdr-cidade"
                value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: mascaraProdutor(e.target.value) })}
                placeholder="Ex: PASSO FUNDO"
              />
            </div>
            <div className="field">
              <label htmlFor="pdr-uf">UF</label>
              <input
                id="pdr-uf"
                value={form.uf}
                onChange={(e) =>
                  setForm({ ...form, uf: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })
                }
                maxLength={2}
                placeholder="RS"
                style={{ maxWidth: 80 }}
              />
            </div>
            <div className="field">
              <label htmlFor="pdr-lat">Latitude</label>
              <input
                id="pdr-lat"
                inputMode="decimal"
                value={form.latitude ?? ''}
                onChange={(e) => setForm({ ...form, latitude: mascaraCoordenada(e.target.value) })}
                placeholder="-28.262500"
              />
              <span className="field__hint">Grau decimal, entre -90 e 90.</span>
            </div>
            <div className="field">
              <label htmlFor="pdr-lon">Longitude</label>
              <input
                id="pdr-lon"
                inputMode="decimal"
                value={form.longitude ?? ''}
                onChange={(e) => setForm({ ...form, longitude: mascaraCoordenada(e.target.value) })}
                placeholder="-52.408300"
              />
              <span className="field__hint">Grau decimal, entre -180 e 180.</span>
            </div>
            <div className="field">
              <label htmlFor="pdr-tel">Telefone</label>
              <input
                id="pdr-tel"
                inputMode="tel"
                value={form.telefone ?? ''}
                onChange={(e) => setForm({ ...form, telefone: mascaraTelefone(e.target.value) })}
                placeholder="(54) 99999-0000"
              />
            </div>
            <div className="field">
              <label htmlFor="pdr-email">E-mail</label>
              <input
                id="pdr-email"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value.trim() })}
                placeholder="contato@unidade.com.br"
              />
            </div>
            <div className="field span-2">
              <label htmlFor="pdr-obs">Observação do PDR</label>
              <textarea
                id="pdr-obs"
                value={form.observacao ?? ''}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                placeholder="Ex: portaria só recebe até as 16h; balança 2 está fora de aferição…"
              />
              <span className="field__hint">
                Aparece em <strong>todas as visitas</strong> desta unidade.
              </span>
            </div>
            <div className="field">
              <label htmlFor="pdr-situacao">Situação</label>
              <select
                id="pdr-situacao"
                value={form.situacao}
                onChange={(e) => setForm({ ...form, situacao: e.target.value as SituacaoCadastro })}
              >
                {SITUACOES_CADASTRO.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          {documentoRepetido && (
            <div className="alert alert--info" style={{ marginTop: 12 }}>
              <IconInfo />
              <span>
                Já existe outro cadastro com este CPF/CNPJ. Isso é permitido — a mesma inscrição
                pode ter mais de uma unidade —, mas confira se não é duplicidade.
              </span>
            </div>
          )}
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
          <label htmlFor="pdr-busca">Buscar PDR</label>
          <input
            id="pdr-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="ID, nome, CPF/CNPJ ou cidade…"
          />
        </div>
        <div className="field">
          <label htmlFor="pdr-filtro-situacao">Situação</label>
          <select
            id="pdr-filtro-situacao"
            value={filtroSituacao}
            onChange={(e) => setFiltroSituacao(e.target.value as 'Todas' | SituacaoCadastro)}
          >
            <option>Todas</option>
            {SITUACOES_CADASTRO.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel__body" style={{ paddingTop: 0 }}>
        <span className="cell-muted">
          {filtrados.length} de {pdrs.length} PDR(s) · {ativos} ativo(s)
        </span>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('PDR')}</th>
                <th>CPF/CNPJ</th>
                <th>Estado/Cidade</th>
                <th>{t('Situação')}</th>
                <th style={{ width: 180 }}>{t('Ações')}</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className={p.situacao === 'Inativo' ? 'row-inativo' : undefined}>
                  <td className="mono cell-muted">{p.id}</td>
                  <td className="cell-strong">{p.nome}</td>
                  <td className="mono">{p.cnpj}</td>
                  <td>{[p.uf, p.cidade].filter(Boolean).join(' - ') || '—'}</td>
                  <td>
                    <SituacaoBadgePdr situacao={p.situacao} />
                  </td>
                  <td>
                    <div className="carga-acoes">
                      <button
                        className="btn btn--ghost btn--sm btn--icon"
                        type="button"
                        title="Editar cadastro"
                        onClick={() => abrirEdicao(p)}
                      >
                        <IconEditar />
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        title={p.situacao === 'Ativo' ? 'Inativar PDR' : 'Reativar PDR'}
                        onClick={() =>
                          definirSituacaoPdr(p.id, p.situacao === 'Ativo' ? 'Inativo' : 'Ativo')
                        }
                      >
                        {p.situacao === 'Ativo' ? t('Inativar') : t('Reativar')}
                      </button>
                      <button
                        className="btn btn--danger btn--sm btn--icon"
                        type="button"
                        title="Remover do catálogo"
                        onClick={() => setRemovendo(p)}
                      >
                        <IconLixeira />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    {pdrs.length === 0
                      ? 'Nenhum PDR cadastrado. Use Novo PDR ou Importar planilha.'
                      : 'Nenhum PDR encontrado com esses filtros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {importando && (
        <ImportarPdrs onImportar={importar} onClose={() => setImportando(false)} />
      )}

      {removendo && (
        <Modal
          titulo="Remover PDR"
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
            Confirma a remoção de <strong>{removendo.nome}</strong> ({removendo.cnpj}) do catálogo?
          </p>
          <div className="alert alert--info" style={{ marginTop: 14 }}>
            As visitas já registradas para este CPF/CNPJ continuam existindo. Se o objetivo é só
            parar de receber visita nova, use <strong>Inativar</strong> em vez de remover.
          </div>
        </Modal>
      )}

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </main>
  )
}
