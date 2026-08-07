import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SonaraAuthGate, SonaraAuthProvider } from './auth/SonaraAuth';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SonaraAuthProvider>
      <SonaraAuthGate>
        <App />
      </SonaraAuthGate>
    </SonaraAuthProvider>
  </React.StrictMode>
);
