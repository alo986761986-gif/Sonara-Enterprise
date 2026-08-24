import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import BootAuth from './components/auth/BootAuth';
import { installMusicHierarchyRuntime } from './musicHierarchyRuntime';
import './index.css';

installMusicHierarchyRuntime();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BootAuth>
      <App />
    </BootAuth>
  </React.StrictMode>
);
