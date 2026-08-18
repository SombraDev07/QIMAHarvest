import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { OPCOES, situacaoPorId } from '../data/mock'
import { obterUsuarioLogado, useVisitas } from '../store'
import type { SituacaoId, Visita } from '../types'
import { Breadcrumb, PageHead, SituacaoBadge } from '../components/ui'
import { IconAlerta, IconChat, IconDownload, IconNovaAba } from '../components/icons'
import { fmtNum, dataComparavel, dataIsoComparavel } from '../format'

type Coluna = {
  key: string
  label: string
  ordenavel?: boolean
  valor: (v: Visita) => string | number
}

const COLUNAS: Coluna[] = [
  { key: 'cod', label: 'Cód', ordenavel: true, valor: (v) => v.cod },
  { key: 'data', label: 'Data', ordenavel: true, valor: (v) => paraTimestamp(v.data) },
  { key: 'pdr', label: 'PDR', ordenavel: true, valor: (v) => v.pdr.nome },
  { key: 'numeroVisitas', label: 'Nº', ordenavel: true, valor: (v) => v.numeroVisitas },
  { key: 'cargas', label: 'Cargas', ordenavel: true, valor: (v) => v.cargas.length },
  { key: 'situacao', label: 'Situação', ordenavel: true, valor: (v) => v.situacao },
  { key: 'consultor', label: 'Consultor', ordenavel: true, valor: (v) => v.consultor },
  { key: 'lider', label: 'Líder', ordenavel: true, valor: (v) => v.lider },
  { key: 'liderFocal', label: 'Líder Focal', ordenavel: true, valor: (v) => v.liderFocal },
  { key: 'supervisor', label: 'Supervisor', ordenavel: true, valor: (v) => v.supervisor },
]

function paraTimestamp(data: string): number {
  const [d, m, a] = data.split('/').map(Number)
  return new Date(a, m - 1, d).getTime()
}

/** dias em aberto na fila de Operação Correção considerados dentro do prazo */
const PRAZO_DIAS_OPERACAO = 5

function diasDesde(dataBr: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - paraTimestamp(dataBr)) / 86400000)
}

/** visita de Operação Correção parada há mais tempo que o prazo — precisa de atenção */
function estaAtrasada(v: Visita): boolean {
  return v.situacao === 'operacao-correcao' && diasDesde(v.envioTablet) > PRAZO_DIAS_OPERACAO
}

/** true quando a última mensagem da conversa não foi escrita pelo usuário logado — chegou resposta */
function temNovaResposta(v: Visita): boolean {
  const mensagens = v.mensagens.filter((m) => m.tipo === 'mensagem')
  if (mensagens.length === 0) return false
  const ultima = mensagens.reduce((a, b) => (a.ts > b.ts ? a : b))
  return ultima.autor !== obterUsuarioLogado().nome
}

const FILTROS_VAZIOS = {
  codigo: '',
  pdr: '',
  de: '',
  ate: '',
  consultor: '',
  lider: '',
  liderFocal: '',
  supervisor: '',
  regiao: '',
}

const POR_PAGINA = 12

export default function VisitasLista() {
  const { situacao } = useParams<{ situacao: string }>()
  /**
   * O fluxo separa 1ª e 2ª passagem pela mesma fila, e manda a rodada no link.
   * Sem ler isso aqui, clicar no card da 2ª abriria a lista inteira e o número
   * da tela não bateria com o do card.
   */
  const [busca] = useSearchParams()
  const t = useT()
  const rodadaAlvo = Number(busca.get('rodada')) || null
  const situacaoId = situacao as SituacaoId
  const meta = situacaoPorId(situacaoId)

  const [form, setForm] = useState(FILTROS_VAZIOS)
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  const [ordem, setOrdem] = useState<{ key: string; dir: 'asc' | 'desc' }>({
    key: 'data',
    dir: 'desc',
  })
  const [pagina, setPagina] = useState(1)

  const visitas = useVisitas()
  const base = useMemo(
    () =>
      visitas.filter(
        (v) =>
          v.situacao === situacaoId &&
          (!rodadaAlvo || (rodadaAlvo >= 2 ? v.rodada >= 2 : v.rodada <= 1)),
      ),
    [visitas, situacaoId, rodadaAlvo],
  )
  const atrasadas = useMemo(() => base.filter(estaAtrasada), [base])
  const comResposta = useMemo(() => base.filter(temNovaResposta), [base])

  const filtradas = useMemo(() => {
    // comparação por número (20260625), sem Date: o input é UTC e a data da
    // visita é local, e a diferença de fuso excluía o último dia do intervalo
    const de = filtros.de ? dataIsoComparavel(filtros.de) : null
    const ate = filtros.ate ? dataIsoComparavel(filtros.ate) : null

    return base.filter((v) => {
      if (filtros.codigo && !String(v.cod).includes(filtros.codigo.trim())) return false
      if (filtros.pdr) {
        const alvo = filtros.pdr.toLowerCase()
        if (
          !v.pdr.nome.toLowerCase().includes(alvo) &&
          !v.pdr.cnpj.includes(alvo) &&
          !v.pdr.cidade.toLowerCase().includes(alvo)
        )
          return false
      }
      const dia = dataComparavel(v.data)
      if (de !== null && dia < de) return false
      if (ate !== null && dia > ate) return false
      if (filtros.consultor && v.consultor !== filtros.consultor) return false
      if (filtros.lider && v.lider !== filtros.lider) return false
      if (filtros.liderFocal && v.liderFocal !== filtros.liderFocal) return false
      if (filtros.supervisor && v.supervisor !== filtros.supervisor) return false
      if (filtros.regiao && v.pdr.regiao !== filtros.regiao) return false
      return true
    })
  }, [base, filtros])

  const ordenadas = useMemo(() => {
    const col = COLUNAS.find((c) => c.key === ordem.key)
    if (!col) return filtradas
    const mult = ordem.dir === 'asc' ? 1 : -1
    return [...filtradas].sort((a, b) => {
      const va = col.valor(a)
      const vb = col.valor(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult
      return String(va).localeCompare(String(vb), 'pt-BR') * mult
    })
  }, [filtradas, ordem])

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = ordenadas.slice(
    (paginaAtual - 1) * POR_PAGINA,
    paginaAtual * POR_PAGINA,
  )

  const set = (campo: keyof typeof FILTROS_VAZIOS, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }))

  function pesquisar() {
    setFiltros(form)
    setPagina(1)
  }

  function limpar() {
    setForm(FILTROS_VAZIOS)
    setFiltros(FILTROS_VAZIOS)
    setPagina(1)
  }

  function ordenarPor(key: string) {
    setOrdem((o) =>
      o.key === key ? { key, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    )
  }

  return (
    <main className="page">
      <Breadcrumb
        trilha={[
          { label: t('Início'), to: '/visitas' },
          { label: t('Visitas'), to: '/visitas' },
          { label: t(meta.label) },
        ]}
      />
      <PageHead
        titulo={`${t('Visitas')} ${t(meta.label)}`}
        subtitulo={meta.descricao}
        acoes={
          <>
            <Link to="/visitas" className="btn btn--ghost">
              ← Voltar
            </Link>
            <button className="btn btn--primary" type="button" onClick={() => exportarCsv(ordenadas, meta.label)}>
              <IconDownload /> {t('Exportar CSV')}
            </button>
          </>
        }
      />

      <section className="filters">
        <div className="filters__grid">
          <div className="field">
            <label htmlFor="f-cod">Código</label>
            <input
              id="f-cod"
              value={form.codigo}
              onChange={(e) => set('codigo', e.target.value)}
              placeholder="Ex.: 295428"
            />
          </div>
          <div className="field">
            <label htmlFor="f-pdr">PDR / CNPJ / Cidade</label>
            <input
              id="f-pdr"
              value={form.pdr}
              onChange={(e) => set('pdr', e.target.value)}
              placeholder="Buscar…"
            />
          </div>
          <div className="field">
            <label htmlFor="f-de">{t('Data (de)')}</label>
            <input
              id="f-de"
              type="date"
              value={form.de}
              onChange={(e) => set('de', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-ate">{t('Data (até)')}</label>
            <input
              id="f-ate"
              type="date"
              value={form.ate}
              onChange={(e) => set('ate', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-regiao">{t('Região')}</label>
            <select
              id="f-regiao"
              value={form.regiao}
              onChange={(e) => set('regiao', e.target.value)}
            >
              <option value="">Todas</option>
              {OPCOES.regioes.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-consultor">Consultor</label>
            <select
              id="f-consultor"
              value={form.consultor}
              onChange={(e) => set('consultor', e.target.value)}
            >
              <option value="">Todos</option>
              {OPCOES.consultores.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-lider">Líder</label>
            <select
              id="f-lider"
              value={form.lider}
              onChange={(e) => set('lider', e.target.value)}
            >
              <option value="">Todos</option>
              {OPCOES.lideres.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-focal">Líder Focal</label>
            <select
              id="f-focal"
              value={form.liderFocal}
              onChange={(e) => set('liderFocal', e.target.value)}
            >
              <option value="">Todos</option>
              {OPCOES.lideresFocais.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-sup">Supervisor</label>
            <select
              id="f-sup"
              value={form.supervisor}
              onChange={(e) => set('supervisor', e.target.value)}
            >
              <option value="">Todos</option>
              {OPCOES.supervisores.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="filters__actions">
          <button className="btn btn--primary" onClick={pesquisar} type="button">
            {t('Pesquisar')}
          </button>
          <button className="btn btn--ghost" onClick={limpar} type="button">
            Limpar
          </button>
          <span className="filters__count">
            {fmtNum(ordenadas.length)} de {fmtNum(base.length)} visitas
          </span>
          {atrasadas.length > 0 && (
            <span className="chip chip--bad" title={`Envio tablet há mais de ${PRAZO_DIAS_OPERACAO} dias sem conclusão`}>
              {atrasadas.length} atrasada{atrasadas.length > 1 ? 's' : ''} (+{PRAZO_DIAS_OPERACAO} dias)
            </span>
          )}
          {comResposta.length > 0 && (
            <span className="chip chip--info" title="A última mensagem da conversa não é sua">
              <IconChat size={11} /> {comResposta.length} com resposta nova
            </span>
          )}
        </div>
      </section>

      <div className="table-wrap">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                {COLUNAS.map((c) => (
                  <th
                    key={c.key}
                    className={c.ordenavel ? 'sortable' : undefined}
                    onClick={c.ordenavel ? () => ordenarPor(c.key) : undefined}
                  >
                    {t(c.label)}
                    {c.ordenavel && (
                      <span className="arrow">
                        {ordem.key === c.key ? (ordem.dir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    )}
                  </th>
                ))}
                <th>{t('Ações')}</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((v) => (
                <tr key={v.cod} className={estaAtrasada(v) ? 'row-atrasada' : undefined}>
                  <td>
                    <Link
                      className="link-cod"
                      to={`/visita/${v.cod}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir o registro da visita em nova aba"
                    >
                      {v.cod}
                    </Link>
                    {temNovaResposta(v) && (
                      <div
                        className="chip chip--info"
                        style={{ marginTop: 5 }}
                        title="A última mensagem desta visita não é sua"
                      >
                        <IconChat size={11} /> Nova resposta
                      </div>
                    )}
                  </td>
                  <td className="cell-strong">
                    {v.data}
                    <div className="cell-muted">envio {v.envioTablet}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{v.pdr.nome}</div>
                    <div className="cell-muted">
                      {v.pdr.cidade}/{v.pdr.uf} · CNPJ {v.pdr.cnpj}
                    </div>
                  </td>
                  <td className="num cell-strong">{v.numeroVisitas}</td>
                  <td className="num">
                    {v.cargas.length}
                    {v.cargas.some((c) => c.rateio) && (
                      <div className="cell-muted">
                        {v.cargas.filter((c) => c.rateio).length} rateio
                      </div>
                    )}
                  </td>
                  <td>
                    <SituacaoBadge id={v.situacao} />
                    {estaAtrasada(v) && (
                      <div
                        className="chip chip--bad"
                        style={{ marginTop: 5 }}
                        title={`Envio tablet em ${v.envioTablet}`}
                      >
                        <IconAlerta size={11} /> {diasDesde(v.envioTablet)}d em atraso
                      </div>
                    )}
                  </td>
                  <td>{v.consultor}</td>
                  <td>{v.lider}</td>
                  <td>{v.liderFocal}</td>
                  <td>{v.supervisor}</td>
                  <td>
                    <Link
                      className="btn btn--ghost btn--sm"
                      to={`/visita/${v.cod}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir em nova aba"
                    >
                      Detalhar <IconNovaAba size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {visiveis.length === 0 && (
          <div className="empty">Nenhuma visita encontrada com os filtros aplicados.</div>
        )}

        <div className="pagination">
          <span>
            Página {paginaAtual} de {totalPaginas}
          </span>
          <div className="pagination__pages">
            <button
              type="button"
              disabled={paginaAtual === 1}
              onClick={() => setPagina(paginaAtual - 1)}
            >
              ‹
            </button>
            {paginasVisiveis(paginaAtual, totalPaginas).map((p) => (
              <button
                type="button"
                key={p}
                className={p === paginaAtual ? 'is-active' : undefined}
                onClick={() => setPagina(p)}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              disabled={paginaAtual === totalPaginas}
              onClick={() => setPagina(paginaAtual + 1)}
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

function exportarCsv(visitas: Visita[], rotulo: string) {
  const cab = [
    'Código',
    'Data',
    'Envio tablet',
    'PDR',
    'CNPJ',
    'Cidade',
    'UF',
    'Região',
    'Nº visitas',
    'Cargas',
    'Situação',
    'Consultor',
    'Líder',
    'Líder Focal',
    'Supervisor',
  ]
  const linhas = visitas.map((v) =>
    [
      v.cod,
      v.data,
      v.envioTablet,
      v.pdr.nome,
      v.pdr.cnpj,
      v.pdr.cidade,
      v.pdr.uf,
      v.pdr.regiao,
      v.numeroVisitas,
      v.cargas.length,
      situacaoPorId(v.situacao).label,
      v.consultor,
      v.lider,
      v.liderFocal,
      v.supervisor,
    ].join(';'),
  )

  const blob = new Blob(['﻿' + [cab.join(';'), ...linhas].join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `visitas-${rotulo.toLowerCase().replace(/\s+/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function paginasVisiveis(atual: number, total: number): number[] {
  const inicio = Math.max(1, Math.min(atual - 2, total - 4))
  const fim = Math.min(total, inicio + 4)
  const paginas: number[] = []
  for (let p = inicio; p <= fim; p++) paginas.push(p)
  return paginas
}
