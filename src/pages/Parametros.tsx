import { useEffect, useMemo, useState } from 'react'
import { useT } from '../i18n'
import { Breadcrumb, PageHead, Panel, Toast } from '../components/ui'
import { salvarParametros, useParametros } from '../store'
import { CATALOGO_REGRAS } from '../regras'
import type { ParametrosRegras, VisaoProvedor } from '../types'
import {
  MODELO_GEMINI,
  MODELO_OPENAI,
  configVisaoDe,
  listarModelosGemini,
  modelosVisaoDe,
  type ModeloVisaoOpcao,
} from '../fotos/visao'

export default function Parametros() {
  const parametros = useParametros()
  const t = useT()
  const [form, setForm] = useState<ParametrosRegras>(parametros)
  const [aviso, setAviso] = useState<string | null>(null)

  const alterado = JSON.stringify(form) !== JSON.stringify(parametros)

  const secoes = useMemo(
    () => [...new Set(CATALOGO_REGRAS.map((r) => r.secao))],
    [],
  )

  function set<K extends keyof ParametrosRegras>(campo: K, valor: ParametrosRegras[K]) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function escolherProvedor(provedor: VisaoProvedor) {
    setForm((f) => {
      const catalogo = modelosVisaoDe(provedor)
      const atual = f.visaoModelo.trim()
      const modelo =
        !catalogo || catalogo.some((m) => m.id === atual)
          ? atual
          : provedor === 'openai'
            ? MODELO_OPENAI
            : MODELO_GEMINI
      return { ...f, visaoProvedor: provedor, visaoModelo: modelo }
    })
  }

  function setRegraAtiva(codigo: string, ativa: boolean) {
    setForm((f) => ({ ...f, regrasAtivas: { ...f.regrasAtivas, [codigo]: ativa } }))
  }

  function alternarSecao(secao: string, ativar: boolean) {
    setForm((f) => {
      const novo = { ...f.regrasAtivas }
      CATALOGO_REGRAS.filter((r) => r.secao === secao).forEach((r) => {
        novo[r.codigo] = ativar
      })
      return { ...f, regrasAtivas: novo }
    })
  }

  function salvar() {
    salvarParametros(form)
    setAviso('Parâmetros salvos — já valem para a próxima análise de visita.')
  }

  function descartar() {
    setForm(parametros)
  }

  return (
    <main className="page">
      <Breadcrumb
        trilha={[
          { label: t('Início'), to: '/visitas' },
          { label: t('Administração'), to: '/administracao' },
          { label: t('Parâmetros') },
        ]}
      />
      <PageHead
        titulo={t('Parâmetros')}
        subtitulo={t('Regras de análise aplicadas às visitas e a mensagem padrão do chat — o que estiver aqui é o que o sistema usa.')}
        acoes={
          alterado ? (
            <>
              <button className="btn btn--ghost" type="button" onClick={descartar}>
                {t('Descartar')}
              </button>
              <button className="btn btn--primary" type="button" onClick={salvar}>
                {t('Salvar parâmetros')}
              </button>
            </>
          ) : undefined
        }
      />

      <div className="stack">
        <Panel numero="1" titulo={t('Regras de consistência da visita')} hint={t('Aplicadas na aba Análise de cada visita')}>
          <div className="panel__body">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="par-desconto">{t('Desconto acima do qual a carga é erro (%)')}</label>
                <input
                  id="par-desconto"
                  type="number"
                  min={0}
                  max={100}
                  value={form.limiteDescontoErro}
                  onChange={(e) => set('limiteDescontoErro', Number(e.target.value))}
                />
                <span className="field__hint">
                  {t('Hoje: cargas com desconto acima de {n}% do peso líquido bloqueiam a certificação.').replace('{n}', String(form.limiteDescontoErro))}
                </span>
              </div>

              <div className="field">
                <label htmlFor="par-placa">{t('Mínimo de caracteres válidos na placa')}</label>
                <input
                  id="par-placa"
                  type="number"
                  min={1}
                  max={10}
                  value={form.minDigitosPlaca}
                  onChange={(e) => set('minDigitosPlaca', Number(e.target.value))}
                />
                <span className="field__hint">
                  {t('Placas com menos que isso são consideradas digitação incompleta.')}
                </span>
              </div>

              <div className="field">
                <label htmlFor="par-romaneio">{t('Salto máximo entre romaneios consecutivos')}</label>
                <input
                  id="par-romaneio"
                  type="number"
                  min={1}
                  value={form.saltoMaxRomaneio}
                  onChange={(e) => set('saltoMaxRomaneio', Number(e.target.value))}
                />
                <span className="field__hint">
                  {t('Saltos maiores que isso entre romaneios da mesma visita geram erro.')}
                </span>
              </div>

              <div className="field">
                <label htmlFor="par-tolerancia-horario">{t('Tolerância de horário fora da janela (min)')}
                </label>
                <input
                  id="par-tolerancia-horario"
                  type="number"
                  min={0}
                  value={form.toleranciaHorarioMin}
                  onChange={(e) => set('toleranciaHorarioMin', Number(e.target.value))}
                />
                <span className="field__hint">
                  {t('Cargas até {n} min antes do início ou depois do fim da visita não geram o erro 3.1.1.').replace('{n}', String(form.toleranciaHorarioMin))}
                </span>
              </div>

              <div className="field">
                <label htmlFor="par-dia-anterior">{t('Dia Anterior — teto por tecnologia (kg)')}</label>
                <input
                  id="par-dia-anterior"
                  type="number"
                  min={0}
                  step={100000}
                  value={form.limiteDiaAnteriorTecnologia}
                  onChange={(e) =>
                    set('limiteDiaAnteriorTecnologia', Number(e.target.value))
                  }
                />
                <span className="field__hint">
                  {t('Lançamento de Dia Anterior com qualquer tecnologia acima disso vira erro (2.9).')}
                </span>
              </div>

              <div className="field">
                <label htmlFor="par-caixa-min">{t('Caixa de fita teste — mínimo')}</label>
                <input
                  id="par-caixa-min"
                  type="number"
                  value={form.caixaFitaMin}
                  onChange={(e) => set('caixaFitaMin', Number(e.target.value))}
                />
              </div>

              <div className="field">
                <label htmlFor="par-caixa-max">{t('Caixa de fita teste — máximo')}</label>
                <input
                  id="par-caixa-max"
                  type="number"
                  value={form.caixaFitaMax}
                  onChange={(e) => set('caixaFitaMax', Number(e.target.value))}
                />
                <span className="field__hint">
                  {t('Faixa usada na pergunta 2.6 (Dados da Visita) e na regra de análise.')}
                </span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          numero="2"
          titulo={t('Mensagem padrão — Enviar erros ao chat')}
          hint={t('Usada como cabeçalho quando o analista envia os erros da visita para a Comunicação')}
        >
          <div className="panel__body">
            <div className="field">
              <label htmlFor="par-msg">{t('Texto padrão')}</label>
              <textarea
                id="par-msg"
                value={form.mensagemErroChat}
                onChange={(e) => set('mensagemErroChat', e.target.value)}
                style={{ minHeight: 80 }}
              />
              <span className="field__hint">
                {t('Use')} <code>{'{quantidade}'}</code>{' '}
                {t('onde deve entrar o número de erros selecionados. A lista de erros é adicionada automaticamente abaixo deste texto.')}
              </span>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="kv__label" style={{ marginBottom: 6 }}>
                {t('Pré-visualização')}
              </div>
              <div className="msg-sistema" style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
                <span className="msg-sistema__texto" style={{ whiteSpace: 'pre-wrap' }}>
                  {form.mensagemErroChat.replace('{quantidade}', '2')}
                  {'\n'}• {t('Carga')} 30414012 — {t('Desconto acima do limite')} (32,10%): ...
                </span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          numero="3"
          titulo={t('API de visão — Análise de Fotos')}
          hint={t('Lê jpeg/png de romaneio e NF. Sem isso, só o mock SVG é conferido sozinho.')}
        >
          <div className="panel__body">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="par-visao-prov">{t('Provedor')}</label>
                <select
                  id="par-visao-prov"
                  value={form.visaoProvedor}
                  onChange={(e) => escolherProvedor(e.target.value as VisaoProvedor)}
                >
                  <option value="desligado">{t('Desligado (usar .env se houver)')}</option>
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="webhook">{t('Webhook próprio')}</option>
                </select>
                <span className="field__hint">
                  {t(
                    'OpenAI no navegador costuma bloquear CORS. Gemini costuma funcionar. Webhook é um POST seu (Edge Function) que devolve o JSON.',
                  )}
                </span>
              </div>
              <CampoModelo
                provedor={form.visaoProvedor === 'desligado' ? configVisaoDe(form).provedor : form.visaoProvedor}
                valor={form.visaoModelo}
                chave={configVisaoDe(form).chave}
                onChange={(v) => set('visaoModelo', v)}
              />
              <div className="field">
                <label htmlFor="par-visao-chave">{t('Chave da API')}</label>
                <input
                  id="par-visao-chave"
                  type="password"
                  autoComplete="off"
                  value={form.visaoChave}
                  onChange={(e) => set('visaoChave', e.target.value)}
                  placeholder={t('vazio = VITE_VISION_API_KEY')}
                />
              </div>
              <div className="field">
                <label htmlFor="par-visao-endpoint">{t('URL do webhook')}</label>
                <input
                  id="par-visao-endpoint"
                  value={form.visaoEndpoint}
                  onChange={(e) => set('visaoEndpoint', e.target.value)}
                  placeholder="https://…/functions/v1/visao"
                  disabled={form.visaoProvedor !== 'webhook' && form.visaoProvedor !== 'desligado'}
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="par-visao-prompt">{t('Prompt')}</label>
              <textarea
                id="par-visao-prompt"
                value={form.visaoPrompt}
                onChange={(e) => set('visaoPrompt', e.target.value)}
                placeholder={t('Vazio usa o prompt padrão (várias NFs, romaneio com nome variável).')}
                style={{ minHeight: 140, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 }}
              />
              <span className="field__hint">
                {t(
                  'Ajuste se o papel da safra mudar (DANFE, ticket de balança, bloco com várias vias). Deixe vazio para o texto padrão do sistema.',
                )}{' '}
                <button
                  className="btn btn--ghost btn--sm"
                  type="button"
                  onClick={() => set('visaoPrompt', '')}
                >
                  {t('Restaurar padrão')}
                </button>
              </span>
            </div>
          </div>
        </Panel>

        <Panel
          numero="4"
          titulo={t('Regras ativas')}
          hint={`${Object.values(form.regrasAtivas).filter((v) => v !== false).length}/${CATALOGO_REGRAS.length} ${t('ligadas')}`}
        >
          <div className="panel__body">
            {secoes.map((secao) => {
              const regrasDaSecao = CATALOGO_REGRAS.filter((r) => r.secao === secao)
              const todasAtivas = regrasDaSecao.every((r) => form.regrasAtivas[r.codigo] !== false)
              return (
                <div className="bloco" key={secao} style={{ marginBottom: 20 }}>
                  <div className="bloco__head" style={{ justifyContent: 'space-between' }}>
                    <span className="bloco__titulo">{t(secao)}</span>
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() => alternarSecao(secao, !todasAtivas)}
                    >
                      {todasAtivas ? t('Desligar todas') : t('Ligar todas')}
                    </button>
                  </div>
                  <div className="regras-lista">
                    {regrasDaSecao.map((r) => (
                      <label key={r.codigo} className="regra-toggle">
                        <input
                          type="checkbox"
                          checked={form.regrasAtivas[r.codigo] !== false}
                          onChange={(e) => setRegraAtiva(r.codigo, e.target.checked)}
                        />
                        <span className="regra-toggle__codigo mono">{r.codigo}</span>
                        <span className="regra-toggle__label">{t(r.label)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      {aviso && <Toast mensagem={aviso} onFim={() => setAviso(null)} />}
    </main>
  )
}

function CampoModelo({
  provedor,
  valor,
  chave,
  onChange,
}: {
  provedor: VisaoProvedor
  valor: string
  chave: string
  onChange: (v: string) => void
}) {
  const t = useT()
  const catalogoFixo = modelosVisaoDe(provedor)
  const padrao = provedor === 'openai' ? MODELO_OPENAI : MODELO_GEMINI
  const [vivos, setVivos] = useState<ModeloVisaoOpcao[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [erroLista, setErroLista] = useState<string | null>(null)

  async function buscarDaChave() {
    if (provedor !== 'gemini' || buscando) return
    if (!chave.trim()) {
      setErroLista(t('Cole a chave da API Gemini para listar os modelos dela.'))
      return
    }
    setBuscando(true)
    setErroLista(null)
    try {
      const lista = await listarModelosGemini(chave)
      setVivos(lista)
      if (lista.length === 0) {
        setErroLista(t('A chave respondeu, mas nenhum modelo de texto/visão veio na lista.'))
      }
    } catch (e) {
      setVivos(null)
      setErroLista(e instanceof Error ? e.message : t('Não deu para listar os modelos da chave.'))
    } finally {
      setBuscando(false)
    }
  }

  useEffect(() => {
    if (provedor !== 'gemini') {
      setVivos(null)
      setErroLista(null)
      return
    }
    if (!chave.trim()) return
    let viva = true
    setBuscando(true)
    setErroLista(null)
    void listarModelosGemini(chave)
      .then((lista) => {
        if (!viva) return
        setVivos(lista)
        if (lista.length === 0) {
          setErroLista(t('A chave respondeu, mas nenhum modelo de texto/visão veio na lista.'))
        }
      })
      .catch((e) => {
        if (!viva) return
        setVivos(null)
        setErroLista(e instanceof Error ? e.message : t('Não deu para listar os modelos da chave.'))
      })
      .finally(() => {
        if (viva) setBuscando(false)
      })
    return () => {
      viva = false
    }
  }, [provedor, chave])

  if (!catalogoFixo) {
    return (
      <div className="field">
        <label htmlFor="par-visao-modelo">{t('Modelo')}</label>
        <input
          id="par-visao-modelo"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('opcional — o webhook define o modelo')}
        />
      </div>
    )
  }

  const catalogo = vivos && vivos.length ? vivos : catalogoFixo
  const extra = valor.trim() && !catalogo.some((m) => m.id === valor.trim()) ? valor.trim() : ''

  return (
    <div className="field">
      <label htmlFor="par-visao-modelo">{t('Modelo')}</label>
      <select
        id="par-visao-modelo"
        value={valor.trim() || padrao}
        onChange={(e) => onChange(e.target.value)}
        disabled={buscando}
      >
        {catalogo.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.id === padrao ? ` — ${t('padrão')}` : ''}
          </option>
        ))}
        {extra ? <option value={extra}>{extra}</option> : null}
      </select>
      {provedor === 'gemini' && (
        <span className="field__hint" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {buscando
            ? t('Consultando os modelos da sua chave…')
            : vivos
              ? `${vivos.length} ${t('modelo(s) desta chave')}`
              : t('Flash é mais rápido. Pro lê papel mais difícil. Lite é o mais barato.')}
          <button className="btn btn--ghost btn--sm" type="button" disabled={buscando} onClick={() => void buscarDaChave()}>
            {t('Listar modelos da chave')}
          </button>
        </span>
      )}
      {provedor === 'openai' && (
        <span className="field__hint">
          {t('Escolha o modelo da lista. Mini costuma bastar para romaneio.')}
        </span>
      )}
      {erroLista && <span className="field__hint">{erroLista}</span>}
      {vivos && extra ? (
        <span className="field__hint">
          {t('Esse nome não veio na sua chave — escolha um da lista (1.5 e 2.0 Flash já saíram).')}
        </span>
      ) : null}
    </div>
  )
}
