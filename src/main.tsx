import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { escutarBanco, hidratarDoBanco } from './store'
import './index.css'

async function iniciar() {
  await hidratarDoBanco()
  escutarBanco()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  )
}

void iniciar()
