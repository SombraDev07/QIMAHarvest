import { useState } from 'react'
import { Breadcrumb, PageHead } from '../components/ui'
import { IconLixeira, IconMais } from '../components/icons'
import { adicionarPdr, removerPdr, usePdrsCatalogo } from '../store'
import type { PdrCatalogo } from '../types'

export default function PDRs() {
  const pdrs = usePdrsCatalogo()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState<Omit<PdrCatalogo, 'cnpj'> & { cnpj: string }>({
    nome: '',
    cnpj: '',
    cidade: '',
    uf: '',
  })
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')

  function limparForm() {
    setForm({ nome: '', cnpj: '', cidade: '', uf: '' })
    setErro('')
  }

  function salvar() {
    if (!form.nome.trim()) { setErro('Nome do PDR é obrigatório.'); return }
    if (!form.cnpj.trim()) { setErro('CNPJ é obrigatório.'); return }
    if (!form.cidade.trim()) { setErro('Cidade é obrigatória.'); return }
    if (!form.uf.trim()) { setErro('UF é obrigatória.'); return }

    const ok = adicionarPdr({
      nome: form.nome.trim(),
      cnpj: form.cnpj.trim(),
      cidade: form.cidade.trim().toUpperCase(),
      uf: form.uf.trim().toUpperCase(),
    })

    if (!ok) {
      setErro('CNPJ já cadastrado.')
      return
    }

    limparForm()
    setMostrarForm(false)
  }

  function confirmarRemocao(cnpj: string) {
    if (window.confirm('Remover este PDR do catálogo?')) {
      removerPdr(cnpj)
    }
  }

  const filtrados = pdrs.filter((p) => {
    if (!busca) return true
    const b = busca.toLowerCase()
    return (
      p.nome.toLowerCase().includes(b) ||
      p.cnpj.includes(b) ||
      p.cidade.toLowerCase().includes(b)
    )
  })

  return (
    <main className="page">
      <Breadcrumb trilha={[{ label: 'Início', to: '/visitas' }, { label: 'Administração', to: '/administracao' }, { label: "PDR's" }]} />
      <PageHead
        titulo="Cadastro de PDR's"
        subtitulo="Pontos de recebimento registrados no sistema"
        acoes={
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => { setMostrarForm(!mostrarForm); limparForm() }}
          >
            <IconMais /> Novo PDR
          </button>
        }
      />

      {mostrarForm && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel__head">
            <span className="panel__title">Novo PDR</span>
          </div>
          <div className="filters__grid" style={{ padding: '4px 0' }}>
            <div className="field">
              <label htmlFor="pdr-nome">Nome do PDR</label>
              <input id="pdr-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: COOPERALFA LTDA" />
            </div>
            <div className="field">
              <label htmlFor="pdr-cnpj">CNPJ</label>
              <input id="pdr-cnpj" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
            </div>
            <div className="field">
              <label htmlFor="pdr-cidade">Cidade</label>
              <input id="pdr-cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Ex: PASSO FUNDO" />
            </div>
            <div className="field">
              <label htmlFor="pdr-uf">UF</label>
              <input id="pdr-uf" value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })} maxLength={2} placeholder="RS" style={{ maxWidth: 80 }} />
            </div>
          </div>
          {erro && <div style={{ color: 'var(--err)', fontSize: 13, marginTop: 8 }}>{erro}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn--primary" type="button" onClick={salvar}>Salvar</button>
            <button className="btn btn--ghost" type="button" onClick={() => { setMostrarForm(false); limparForm() }}>Cancelar</button>
          </div>
        </section>
      )}

      <div className="field" style={{ maxWidth: 400, marginBottom: 16 }}>
        <label htmlFor="pdr-busca">Buscar PDR</label>
        <input id="pdr-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, CNPJ ou cidade..." />
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CNPJ</th>
                <th>Cidade</th>
                <th>UF</th>
                <th style={{ width: 80 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.cnpj}>
                  <td className="cell-strong">{p.nome}</td>
                  <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 }}>{p.cnpj}</td>
                  <td>{p.cidade}</td>
                  <td>{p.uf}</td>
                  <td>
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() => confirmarRemocao(p.cnpj)}
                      title="Remover PDR"
                      style={{ color: 'var(--err)' }}
                    >
                      <IconLixeira />
                    </button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    Nenhum PDR cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
