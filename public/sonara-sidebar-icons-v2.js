(() => {
  if (window.__sonaraSidebarIconsV2) return;
  window.__sonaraSidebarIconsV2 = true;

  const icon = paths => `
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${paths}
    </svg>`;

  const specs = [
    {
      id: 'overview',
      matches: text => /^(panoramica|overview)/i.test(text),
      color: '#f8fafc',
      svg: icon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')
    },
    {
      id: 'generator',
      matches: text => /^(crea la mia musica|generatore|generator)/i.test(text),
      color: '#a8b4c8',
      svg: icon('<path d="m15 4 5 5L8 21l-5-5L15 4Z"/><path d="m6 14 4 4"/><path d="M5 3v3M3.5 4.5h3M20 14v4M18 16h4M10 2v2M9 3h2"/>')
    },
    {
      id: 'studio',
      matches: text => /^studio/i.test(text),
      color: '#f8fafc',
      svg: icon('<path d="M9 18V5l10-2v13"/><path d="M9 8l10-2"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>')
    },
    {
      id: 'dj-pro',
      matches: text => /^dj\s*pro/i.test(text),
      color: '#39e7ee',
      glow: 'drop-shadow(0 0 6px rgba(57,231,238,.45))',
      svg: icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.25"/><path d="M12 3a9 9 0 0 1 8.3 5.5M3.7 15.5A9 9 0 0 0 12 21"/><path d="M7.1 8.2A6 6 0 0 1 10 6.2M16.9 15.8A6 6 0 0 1 14 17.8"/>')
    },
    {
      id: 'video-ai',
      matches: text => /^video\s*ai/i.test(text),
      color: '#e879f9',
      glow: 'drop-shadow(0 0 6px rgba(232,121,249,.42))',
      svg: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 8h4M17 8h4M3 16h4M17 16h4"/><path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none"/>')
    },
    {
      id: 'production',
      matches: text => /^(produzione|production)/i.test(text),
      color: '#9cacc4',
      svg: icon('<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/><rect x="10" y="10" width="4" height="4" rx=".7"/>')
    },
    {
      id: 'eq-master',
      matches: text => /^eq\s*\/\s*master/i.test(text),
      color: '#9cacc4',
      svg: icon('<path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h9M17 18h3"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="18" r="2"/>')
    },
    {
      id: 'publishing',
      matches: text => /^(pubblicazione|publishing)/i.test(text),
      color: '#9cacc4',
      svg: icon('<path d="M14 4c3-2 5-1 6-1 0 1 1 3-1 6l-7 7-5-5 7-7Z"/><path d="m7 11-3 1-2 4 5-1M12 16l-1 5 4-2 1-3"/><circle cx="16" cy="7" r="1.5"/><path d="M5 19c1.5-2 3-2.5 4-1.5S9.5 20 7 21"/>')
    },
    {
      id: 'marketplace',
      matches: text => /^marketplace/i.test(text),
      color: '#9cacc4',
      svg: icon('<path d="M4 9v11h16V9"/><path d="M3 9l2-5h14l2 5"/><path d="M3 9c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0"/><path d="M9 20v-6h6v6"/>')
    },
    {
      id: 'discovery',
      matches: text => /^(scoperta|discovery)/i.test(text),
      color: '#9cacc4',
      svg: icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>')
    },
    {
      id: 'analytics',
      matches: text => /^(analisi|analytics)/i.test(text),
      color: '#9cacc4',
      svg: icon('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>')
    },
    {
      id: 'assistant',
      matches: text => /^(assistente\s*ai|ai\s*assistant)/i.test(text),
      color: '#9cacc4',
      svg: icon('<rect x="4" y="6" width="16" height="13" rx="3"/><path d="M9 2h6M12 2v4M8 12h.01M16 12h.01M9 16h6"/>')
    },
    {
      id: 'cloud',
      matches: text => /^sonara\s*cloud/i.test(text),
      color: '#9cacc4',
      svg: icon('<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.4 8.2 4.5 4.5 0 0 0 7 18Z"/>')
    },
    {
      id: 'collaboration',
      matches: text => /^(collaborazione|collaboration)/i.test(text),
      color: '#9cacc4',
      svg: icon('<path d="m8 12 3 3 5-5"/><path d="M6 5 2 9l4 4M18 5l4 4-4 4M9 5h6"/>')
    },
    {
      id: 'enterprise',
      matches: text => /^enterprise/i.test(text),
      color: '#9cacc4',
      svg: icon('<path d="M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01"/>')
    },
    {
      id: 'plans',
      matches: text => /^(piani|plans)/i.test(text),
      color: '#9cacc4',
      svg: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>')
    },
    {
      id: 'settings',
      matches: text => /^(impostazioni|settings)/i.test(text),
      color: '#9cacc4',
      svg: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.13.38.34.72.6 1 .3.28.68.42 1.1.4h.1v4h-.1c-.42-.02-.8.12-1.1.4-.26.28-.47.62-.6 1Z"/>')
    }
  ];

  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const generatorLabelPattern = /^(crea la mia musica|generatore|generator)/i;

  function mainSidebar() {
    return Array.from(document.querySelectorAll('aside')).find(aside => {
      const text = normalize(aside.textContent);
      return /(panoramica|overview)/i.test(text) && /(crea la mia musica|generatore|generator)/i.test(text);
    }) || null;
  }

  function renameItalianGenerator(button) {
    const text = normalize(button.textContent);
    if (!/^generatore$/i.test(text)) return;

    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (/^\s*Generatore\s*$/i.test(node.nodeValue || '')) {
        node.nodeValue = (node.nodeValue || '').replace(/Generatore/i, 'Crea la mia musica');
        button.setAttribute('aria-label', 'Crea la mia musica');
        button.setAttribute('title', 'Crea la mia musica');
        break;
      }
      node = walker.nextNode();
    }
  }

  function originalIconElement(button, custom) {
    return Array.from(button.children).find(child => {
      if (child === custom) return false;
      if (child.hasAttribute('data-sonara-sidebar-icon-v2')) return false;
      return child.matches('svg') || Boolean(child.querySelector('svg'));
    }) || null;
  }

  function apply() {
    const aside = mainSidebar();
    if (!aside) return;

    const buttons = Array.from(aside.querySelectorAll('button'));
    for (const button of buttons) {
      renameItalianGenerator(button);
      const text = normalize(button.textContent);
      const spec = specs.find(item => item.matches(text));
      if (!spec) continue;

      let custom = button.querySelector(`:scope > [data-sonara-sidebar-icon-v2="${spec.id}"]`);
      if (!custom) {
        custom = document.createElement('span');
        custom.setAttribute('data-sonara-sidebar-icon-v2', spec.id);
        custom.setAttribute('aria-hidden', 'true');
        custom.innerHTML = spec.svg;
        custom.style.cssText = [
          'display:inline-flex',
          'width:28px',
          'height:28px',
          'min-width:28px',
          'align-items:center',
          'justify-content:center',
          'flex:0 0 28px',
          'pointer-events:none',
          'transition:color .16s ease,filter .16s ease,transform .16s ease'
        ].join(';');
        button.insertBefore(custom, button.firstChild);
      }

      const active = /from-purple-600|text-white/.test(String(button.className));
      custom.style.color = active && !['dj-pro', 'video-ai'].includes(spec.id) ? '#f8fafc' : spec.color;
      custom.style.filter = spec.glow || 'none';

      const original = originalIconElement(button, custom);
      if (original) {
        original.setAttribute('data-sonara-sidebar-original-icon', 'true');
        original.style.setProperty('display', 'none', 'important');
      }

      button.setAttribute('data-sonara-sidebar-polished', spec.id);
    }
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('load', schedule, { once: true });
  window.setInterval(schedule, 1500);
})();
