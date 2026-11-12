import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { installChunkRecovery } from './lib/chunkRecovery'

// Avant React : capture les erreurs de préchargement Vite et les rejets
// d'import dynamique, y compris si l'arbre React n'est pas encore monté.
installChunkRecovery();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
