import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SonaraRemixProPanel from './components/remix/SonaraRemixProPanel';

// This entry mounts the genuine React Remix Pro UI independently from the
// older production application bundle. Authentication and API calls remain
// same-origin and preserve the existing SONARA session.
declare global {
  interface Window { __sonaraRemixV3Standalone?: boolean }
}
if (!window.__sonaraRemixV3Standalone) {
  window.__sonaraRemixV3Standalone = true;
  let current: HTMLElement | null = null;
  let root: Root | null = null;
  const attach = () => {
    const legacy=document.querySelector<HTMLElement>('.sonara-remix-pro:not(.sonara-pro-v3)');
    if (!legacy || !legacy.isConnected) {
      if (current && !current.isConnected) {
        root?.unmount();
        root=null;
        current=null;
      }
      return;
    }
    // Keep a single real Pro panel. Hide the old React-owned UI without
    // removing nodes from its tree or altering its event handlers.
    legacy.style.setProperty('display','none','important');
    if (current && current.isConnected && current.previousElementSibling===legacy) return;
    if (root) root.unmount();
    if (current?.isConnected) current.remove();
    current=document.createElement('div');
    current.dataset.sonaraRemixV3Mount='true';
    current.className='sonara-pro-v3-standalone';
    legacy.insertAdjacentElement('afterend',current);
    root=createRoot(current);
    root.render(React.createElement(SonaraRemixProPanel));
  };
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',attach,{once:true});
  else attach();
  const watcher=new MutationObserver(attach);
  const observe=()=>{
    if(document.body)watcher.observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});
  else observe();
}
