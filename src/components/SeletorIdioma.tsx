import { IDIOMAS, definirIdioma, useIdioma } from '../i18n'

/** troca PT/EN — fica no topo, junto do bloco do usuário, visível de qualquer tela */
export default function SeletorIdioma() {
  const atual = useIdioma()

  return (
    <div className="idioma" role="group" aria-label="Idioma / Language">
      {IDIOMAS.map((i) => (
        <button
          key={i.id}
          type="button"
          className={i.id === atual ? 'is-on' : undefined}
          aria-pressed={i.id === atual}
          title={i.nome}
          onClick={() => definirIdioma(i.id)}
        >
          {i.sigla}
        </button>
      ))}
    </div>
  )
}
