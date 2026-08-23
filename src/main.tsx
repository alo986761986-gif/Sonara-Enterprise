import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import BootAuth from './components/auth/BootAuth';
import { installRandomPromptGuard } from './randomPromptGuard';
import './index.css';

installRandomPromptGuard();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BootAuth>
      <App />
    </BootAuth>
  </React.StrictMode>
);
