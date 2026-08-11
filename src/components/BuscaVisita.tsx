import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SituacaoBadge } from './ui'
import { IconLupa, IconX } from './icons'
import type { Visita } from '../types'

const MAX_RESULTADOS = 8

export default function BuscaVisita({ visitas }: { visitas: Visita[] }) {
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState(false)
  const [indice, setIndice] = useState(0)
  const caixa = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const resultados = useMemo(() => {
    const t = termo.trim().toLowerCase()
    if (t.length < 2) return []
    const soDigitos = t.replace(/\D/g, '')

    return visitas
      .filter((v) => {
        if (String(v.cod).includes(t)) return true
        if (soDigitos && v.pdr.cnpj.replace(/\D/g, '').includes(soDigitos)) return true
        if (v.pdr.nome.toLowerCase().includes(t)) return true
        if (v.pdr.cidade.toLowerCase().includes(t)) return true
        if (v.consultor.toLowerCase().includes(t)) return true
        return false
      })
      .slice(0, MAX_RESULTADOS)
  }, [visitas, termo])

  function abrir(cod: number) {
    setAberto(false)
    setTermo('')
    navigate(`/visita/${cod}`)
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (!resultados.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndice((i) => (i + 1) % resultados.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndice((i) => (i - 1 + resultados.length) % resultados.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      abrir(resultados[Math.min(indice, resultados.length - 1)].cod)
    } else if (e.key === 'Escape') {
      setAberto(false)
    }
  }

  return (
    <div
      className="busca"
      ref={caixa}
      onBlur={(e) => {
        if (!caixa.current?.contains(e.relatedTarget as Node)) setAberto(false)
      }}
    >
      <div className="busca__campo">
        <IconLupa size={17} />
        <input
          value={termo}
          placeholder="Buscar visita por código, PDR, CNPJ, cidade ou consultor…"
          onChange={(e) => {
            setTermo(e.target.value)
            setIndice(0)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={aoTeclar}
          aria-label="Buscar visita"
        />
        {termo && (
          <button
            type="button"
            className="busca__limpar"
            onClick={() => {
              setTermo('')
              setAberto(false)
            }}
            aria-label="Limpar busca"
          >
            <IconX size={15} />
          </button>
        )}
      </div>

      {aberto && termo.trim().length >= 2 && (
        <div className="busca__lista">
          {resultados.length === 0 ? (
            <div className="busca__vazio">Nenhuma visita encontrada para “{termo}”.</div>
          ) : (
            resultados.map((v, i) => (
              <button
                key={v.cod}
                type="button"
                className={`busca__item${i === indice ? ' is-ativo' : ''}`}
                onMouseEnter={() => setIndice(i)}
                onClick={() => abrir(v.cod)}
              >
                <span className="busca__cod mono">{v.cod}</span>
                <span className="busca__info">
                  <span className="busca__pdr">{v.pdr.nome}</span>
                  <span className="busca__meta">
                    {v.pdr.cidade}/{v.pdr.uf} · CNPJ {v.pdr.cnpj} · {v.data} · {v.consultor}
                  </span>
                </span>
                <SituacaoBadge id={v.situacao} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
