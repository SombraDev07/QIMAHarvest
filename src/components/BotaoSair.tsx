import { useNavigate } from 'react-router-dom'
import { IconSair } from './icons'
import { sair } from '../store'
import { useT } from '../i18n'

export default function BotaoSair() {
  const t = useT()
  const navigate = useNavigate()

  return (
    <button
      className="btn btn--ghost btn--sm"
      type="button"
      title={t('Sair')}
      onClick={() => {
        sair()
        navigate('/login', { replace: true })
      }}
    >
      <IconSair /> {t('Sair')}
    </button>
  )
}
