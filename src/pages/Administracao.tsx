import { useState } from 'react'
import { useT } from '../i18n'
import { Link } from 'react-router-dom'
import { Breadcrumb, Modal, PageHead } from '../components/ui'
import { limparPersistencia } from '../store'
import {
  IconArmazem,
  IconBussola,
  IconEngrenagem,
  IconLista,
  IconMapa,
  IconUpload,
  IconUsuarios,
} from '../components/icons'

const MODULOS = [
  { Icone: IconMapa, titulo: 'Distritos', desc: 'Cadastro e vínculo de distritos por região' },
  { Icone: IconArmazem, titulo: "PDR's", desc: 'Pontos de recebimento, CNPJ e capacidade estática', to: '/administracao/pdrs' },
  { Icone: IconBussola, titulo: 'Regiões', desc: 'Estrutura geográfica da safra' },
  {
    Icone: IconUsuarios,
    titulo: 'Usuários',
    desc: 'Perfis, permissões e equipes de campo',
    to: '/administracao/usuarios',
  },
  { Icone: IconLista, titulo: 'Tipos de Visita', desc: 'Modalidades 1H, 2H, 4H e 8H' },
  {
    Icone: IconUpload,
    titulo: 'Importar visitas',
    desc: 'Carga em lote das planilhas de visita e de cargas',
    to: '/administracao/importar-visitas',
  },
  {
    Icone: IconEngrenagem,
    titulo: 'Parâmetros',
    desc: 'Regras de análise da visita e mensagem padrão do chat',
    to: '/administracao/parametros',
  },
]

export default function Administracao() {
  const [confirmando, setConfirmando] = useState(false)
  const t = useT()

  /** o reload é o que faz o store reler a base; sem ele a tela seguiria com o estado antigo */
  function restaurar() {
    limparPersistencia()
    window.location.reload()
  }

  return (
    <main className="page">
      <Breadcrumb trilha={[{ label: t('Início'), to: '/visitas' }, { label: t('Administração') }]} />
      <PageHead
        titulo={t('Administrativo')}
        subtitulo={t('Cadastros e configurações da safra')}
        acoes={
          <button className="btn btn--ghost" type="button" onClick={() => setConfirmando(true)}>
            {t('Restaurar dados originais')}
          </button>
        }
      />

      <div className="card-grid">
        {MODULOS.map(({ Icone, titulo, desc, to }) =>
          to ? (
            <Link className="module-card" key={titulo} to={to}>
              <div className="module-card__icon">
                <Icone />
              </div>
              <div className="module-card__title">{t(titulo)}</div>
              <div className="module-card__desc">{t(desc)}</div>
            </Link>
          ) : (
            <div className="module-card" key={titulo}>
              <div className="module-card__icon">
                <Icone />
              </div>
              <div className="module-card__title">{t(titulo)}</div>
              <div className="module-card__desc">{t(desc)}</div>
            </div>
          ),
        )}
      </div>

      {confirmando && (
        <Modal
          titulo={t('Restaurar dados originais')}
          onClose={() => setConfirmando(false)}
          rodape={
            <>
              <span className="spacer" />
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => setConfirmando(false)}
              >
                {t('Cancelar')}
              </button>
              <button className="btn btn--primary" type="button" onClick={restaurar}>
                {t('Restaurar e recarregar')}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {t('Isso apaga tudo que foi alterado nesta máquina — cargas editadas, parâmetros, solicitações e PDRs — e volta a base ao estado original. Não tem como desfazer.')}
          </p>
        </Modal>
      )}
    </main>
  )
}
