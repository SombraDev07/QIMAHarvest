import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { Breadcrumb, PageHead, Panel, Toast } from '../components/ui'
import { salvarParametros, useParametros } from '../store'
import { CATALOGO_REGRAS } from '../regras'
import type { ParametrosRegras } from '../types'

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
