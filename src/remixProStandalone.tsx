import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SonaraRemixProPanel from './components/remix/SonaraRemixProPanel';

// Bridge to the actual Remix Pro tab in the previously deployed SONARA bundle.
// The previous bridge searched for .sonara-remix-pro, but that class does not
// exist in the current source (which embeds the older panel inside the Pro tab).
declare global {
  interface Window { __sonaraRemixV3ActualTab?: boolean }
}
if (!window.__sonaraRemixV3ActualTab) {
  window.__sonaraRemixV3ActualTab = true;
  let mount: HTMLElement | null = null;
  let root: Root | null = null;
  let hidden: HTMLElement | null = null;
  let scheduled = false;

  const visible = (node: HTMLElement) => {
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const findActiveProTab = (): HTMLElement | null => {
    const panels = Array.from(document.querySelectorAll<HTMLElement>(
      '.sonara-remix-source-tabs'
    ));
    for (const tabs of panels) {
      if (!tabs.closest('.sonara-remix-shell')) continue;
      const button = Array.from(tabs.querySelectorAll<HTMLButtonElement>('button'))
        .find(b => b.getAttribute('data-active') === 'true' &&
          /remix\s*pro/i.test(b.textContent || ''));
      if (button && visible(tabs)) return tabs;
    }
    return null;
  };
  const cleanup = () => {
    if (root) { root.unmount(); root = null; }
    if (mount) { mount.remove(); mount = null; }
    if (hidden) { hidden.style.removeProperty('display'); hidden = null; }
  };
  const attach = () => {
    scheduled = false;
    const tabs = findActiveProTab();
    if (!tabs || !tabs.isConnected) {
      if (mount || root || hidden) cleanup();
      return;
    }
    const parent = tabs.parentElement as HTMLElement | null;
    if (!parent) return;
    const active = mount?.isConnected && mount?.parentElement === parent;
    if (active) return;

    cleanup();
    // React owns the legacy component. Hide it, never detach/reparent it.
    const next = tabs.nextElementSibling as HTMLElement | null;
    if (next && next !== mount && !next.hasAttribute('data-sonara-remix-v3-mount')) {
      hidden = next;
      hidden.style.setProperty('display', 'none', 'important');
    }
    mount = document.createElement('div');
    mount.dataset.sonaraRemixV3Mount = 'true';
    mount.className = 'sonara-pro-v3-standalone';
    mount.setAttribute('data-sonara-v3-actual-tab', 'true');
    tabs.insertAdjacentElement('afterend', mount);
    root = createRoot(mount);
    root.render(React.createElement(SonaraRemixProPanel));
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(attach);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once:true });
  } else schedule();
  const observe = () => {
    if (document.body) new MutationObserver(schedule).observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-active', 'class']
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe, { once:true });
  } else observe();
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('.sonara-remix-source-tabs button')) schedule();
  }, true);
}
