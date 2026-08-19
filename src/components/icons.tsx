type Props = { size?: number }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const IconAdmin = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
)

export const IconVisitas = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M9 11l2 2 4-4" />
    <rect x="3" y="4" width="18" height="17" rx="2.5" />
    <path d="M8 2v4M16 2v4M3 9h18" />
  </svg>
)

export const IconRotas = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M8.5 6H15a3 3 0 010 6H9a3 3 0 000 6h6.5" />
  </svg>
)

export const IconAlerta = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M10.3 3.9L2.6 17.2A2 2 0 004.3 20h15.4a2 2 0 001.7-2.8L13.7 3.9a2 2 0 00-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
)

export const IconRelatorios = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M3 20h18" />
    <rect x="5" y="11" width="3.5" height="6" rx="1" />
    <rect x="10.2" y="6" width="3.5" height="11" rx="1" />
    <rect x="15.5" y="9" width="3.5" height="8" rx="1" />
  </svg>
)

export const IconFotos = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M3 8.5A2 2 0 015 6.5h2l1.3-2h7.4L17 6.5h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
)

export const IconRefresh = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M20 12a8 8 0 10-2.3 5.5" />
    <path d="M20 6v6h-6" />
  </svg>
)

export const IconMapa = ({ size = 18 }: Props) => (
  <svg {...base(size)}>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
)

export const IconArmazem = ({ size = 18 }: Props) => (
  <svg {...base(size)}>
    <path d="M3 10l9-6 9 6v10a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
    <path d="M7 21v-7h10v7M7 17h10" />
  </svg>
)

export const IconUsuarios = ({ size = 18 }: Props) => (
  <svg {...base(size)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0113 0" />
    <path d="M16 5.2a3.5 3.5 0 010 5.6M17.5 20a6.5 6.5 0 00-2.2-4.9" />
  </svg>
)

export const IconBussola = ({ size = 18 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </svg>
)

export const IconLista = ({ size = 18 }: Props) => (
  <svg {...base(size)}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
)

export const IconEngrenagem = ({ size = 18 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 11-4 0v-.1A1.7 1.7 0 005 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 002.6 15H2.4a2 2 0 110-4h.1A1.7 1.7 0 004.6 5l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 009 2.6V2.4a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9h.2a2 2 0 110 4h-.1a1.7 1.7 0 00-1.6 1z" />
  </svg>
)

export const IconEditar = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
  </svg>
)

export const IconLixeira = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
  </svg>
)

export const IconMigrar = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M7 7h11M14 3l4 4-4 4" />
    <path d="M17 17H6M10 13l-4 4 4 4" />
  </svg>
)

export const IconUpload = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M12 3v13M7 8l5-5 5 5" />
  </svg>
)

export const IconDownload = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M12 16V3M7 11l5 5 5-5" />
  </svg>
)

export const IconMais = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconX = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)

export const IconCadeado = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 018 0v3" />
  </svg>
)

export const IconInfo = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
)

export const IconNovaAba = ({ size = 13 }: Props) => (
  <svg {...base(size)}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h5" />
  </svg>
)

export const IconLog = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l2.8 1.6" />
  </svg>
)

export const IconLink = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" />
  </svg>
)

export const IconLupa = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M16.2 16.2L21 21" />
  </svg>
)

export const IconChat = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
  </svg>
)

export const IconSolicitacao = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M9 3h10a1 1 0 011 1v14l-4-2-4 2-4-2-3 2V8z" />
    <path d="M9 8H5a1 1 0 00-1 1v10l4-2" />
    <path d="M12.5 8h3M12.5 11.5h3" />
  </svg>
)

export const IconAnexo = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <path d="M16.5 6.5l-7.1 7.1a3 3 0 004.2 4.2l7.1-7.1a5 5 0 00-7.1-7.1L6.5 10.6a7 7 0 009.9 9.9" />
  </svg>
)

export const IconArrastar = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <circle cx="8" cy="6" r="1" />
    <circle cx="8" cy="12" r="1" />
    <circle cx="8" cy="18" r="1" />
    <circle cx="16" cy="6" r="1" />
    <circle cx="16" cy="12" r="1" />
    <circle cx="16" cy="18" r="1" />
  </svg>
)

export const IconSair = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4" />
    <path d="M16 8l4 4-4 4M10 12h10" />
  </svg>
)

export const IconPlanilha = ({ size = 26 }: Props) => (
  <svg {...base(size)}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h8M8 13v4" />
  </svg>
)
