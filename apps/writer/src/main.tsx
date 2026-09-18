import '@fontsource/young-serif/400.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/atkinson-hyperlegible/400-italic.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import './styles/tokens.css';
import './styles/journal.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CrashNote } from './components/CrashNote';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');
createRoot(root).render(
  <StrictMode>
    <CrashNote>
      <App />
    </CrashNote>
  </StrictMode>,
);
