import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { configureAmplifyOnce } from './aws/amplify';
import { attachTitleUnlockEngine } from './sim/titleUnlockEngine';
import './styles/global.css';

attachTitleUnlockEngine();

// No-ops in local-only mode (when AWS env vars aren't set). Must run before
// any component that uses the AppSync client.
configureAmplifyOnce();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element missing — check index.html');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
