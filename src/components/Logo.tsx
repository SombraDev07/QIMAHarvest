/**
 * Marca gerada em vetor na identidade QIMA (lupa + vermelho institucional).
 * Para usar o arquivo oficial da empresa, troque este componente por um <img>
 * apontando para o SVG/PNG em /public.
 */
export function LogoQima({ height = 26 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="0 0 210 56"
      role="img"
      aria-label="QIMA"
      style={{ display: 'block' }}
    >
      <circle cx="26" cy="24" r="16" fill="none" stroke="currentColor" strokeWidth="8" />
      <line
        x1="37.5"
        y1="35.5"
        x2="48"
        y2="46"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <text
        x="66"
        y="40"
        fill="currentColor"
        fontFamily="'Segoe UI', system-ui, sans-serif"
        fontSize="38"
        fontWeight="600"
        letterSpacing="6"
      >
        QIMA
      </text>
    </svg>
  )
}

export function MarcaQima({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#fff" />
      <circle cx="28.5" cy="27.5" r="13.5" fill="none" stroke="#e4002b" strokeWidth="7.5" />
      <line
        x1="38.5"
        y1="37.5"
        x2="49.5"
        y2="48.5"
        stroke="#e4002b"
        strokeWidth="7.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
