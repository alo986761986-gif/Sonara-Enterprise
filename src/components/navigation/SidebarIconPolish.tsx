import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  Bot,
  Building2,
  Cloud,
  Cpu,
  CreditCard,
  Disc3,
  Film,
  Globe2,
  Handshake,
  LayoutGrid,
  Music2,
  Rocket,
  Settings2,
  SlidersHorizontal,
  Store,
  WandSparkles
} from 'lucide-react';

type NavSpec = {
  id: string;
  match: RegExp;
  Icon: typeof LayoutGrid;
  iconClassName: string;
  shellClassName?: string;
};

const NAV_SPECS: NavSpec[] = [
  { id: 'overview', match: /^(panoramica|overview)\b/i, Icon: LayoutGrid, iconClassName: 'text-white' },
  { id: 'generator', match: /^(generatore|generator)\b/i, Icon: WandSparkles, iconClassName: 'text-slate-300' },
  { id: 'studio', match: /^studio\b/i, Icon: Music2, iconClassName: 'text-white' },
  { id: 'dj-pro', match: /^dj\s*pro\b/i, Icon: Disc3, iconClassName: 'text-cyan-300', shellClassName: 'drop-shadow-[0_0_7px_rgba(34,211,238,0.35)]' },
  { id: 'video-ai', match: /^video\s*ai\b/i, Icon: Film, iconClassName: 'text-fuchsia-300', shellClassName: 'drop-shadow-[0_0_7px_rgba(232,121,249,0.35)]' },
  { id: 'production', match: /^(produzione|production)\b/i, Icon: Cpu, iconClassName: 'text-slate-300' },
  { id: 'eq-master', match: /^eq\s*\/\s*master\b/i, Icon: SlidersHorizontal, iconClassName: 'text-slate-300' },
  { id: 'publishing', match: /^(pubblicazione|publishing)\b/i, Icon: Rocket, iconClassName: 'text-slate-300' },
  { id: 'marketplace', match: /^marketplace\b/i, Icon: Store, iconClassName: 'text-slate-300' },
  { id: 'discovery', match: /^(scoperta|discovery)\b/i, Icon: Globe2, iconClassName: 'text-slate-300' },
  { id: 'analytics', match: /^(analisi|analytics)\b/i, Icon: BarChart3, iconClassName: 'text-slate-300' },
  { id: 'assistant', match: /^(assistente\s*ai|ai\s*assistant)\b/i, Icon: Bot, iconClassName: 'text-slate-300' },
  { id: 'cloud', match: /^sonara\s*cloud\b/i, Icon: Cloud, iconClassName: 'text-slate-300' },
  { id: 'collaboration', match: /^(collaborazione|collaboration)\b/i, Icon: Handshake, iconClassName: 'text-slate-300' },
  { id: 'enterprise', match: /^enterprise\b/i, Icon: Building2, iconClassName: 'text-slate-300' },
  { id: 'plans', match: /^(piani|plans)\b/i, Icon: CreditCard, iconClassName: 'text-slate-300' },
  { id: 'settings', match: /^(impostazioni|settings)\b/i, Icon: Settings2, iconClassName: 'text-slate-300' }
];

function findMainSidebar(): HTMLElement | null {
  return Array.from(document.querySelectorAll('aside')).find(candidate => {
    const text = candidate.textContent || '';
    return /(panoramica|overview)/i.test(text) && /(generatore|generator)/i.test(text);
  }) as HTMLElement | null;
}

function hasSvg(element: Element | null) {
  if (!element) return false;
  return element.tagName.toLowerCase() === 'svg' || Boolean(element.querySelector('svg'));
}

function sameHosts(a: Record<string, HTMLElement>, b: Record<string, HTMLElement>) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every(key => a[key] === b[key]);
}

export default function SidebarIconPolish() {
  const [hosts, setHosts] = useState<Record<string, HTMLElement>>({});

  useEffect(() => {
    let scheduled = false;

    const scan = () => {
      scheduled = false;
      const aside = findMainSidebar();
      if (!aside) return;

      const buttons = Array.from(aside.querySelectorAll('button')) as HTMLButtonElement[];
      const nextHosts: Record<string, HTMLElement> = {};

      for (const spec of NAV_SPECS) {
        const button = buttons.find(candidate => spec.match.test((candidate.textContent || '').trim()));
        if (!button) continue;

        let host = button.querySelector<HTMLElement>(`:scope > [data-sonara-polished-nav-icon="${spec.id}"]`);
        if (!host) {
          host = document.createElement('span');
          host.dataset.sonaraPolishedNavIcon = spec.id;
          host.setAttribute('aria-hidden', 'true');
          button.insertBefore(host, button.firstChild);
        }

        const originalLeadingIcon = Array.from(button.children).find(child => child !== host && hasSvg(child));
        if (originalLeadingIcon && (originalLeadingIcon instanceof HTMLElement || originalLeadingIcon instanceof SVGElement)) {
          originalLeadingIcon.setAttribute('data-sonara-original-nav-icon-hidden', 'true');
          originalLeadingIcon.style.display = 'none';
        }

        button.dataset.sonaraNavPolished = 'true';
        nextHosts[spec.id] = host;
      }

      setHosts(previous => sameHosts(previous, nextHosts) ? previous : nextHosts);
    };

    const requestScan = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(scan);
    };

    scan();
    const observer = new MutationObserver(requestScan);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(requestScan, 1200);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.querySelectorAll('[data-sonara-original-nav-icon-hidden="true"]').forEach(node => {
        if (node instanceof HTMLElement || node instanceof SVGElement) node.style.display = '';
        node.removeAttribute('data-sonara-original-nav-icon-hidden');
      });
      document.querySelectorAll('[data-sonara-polished-nav-icon]').forEach(node => node.remove());
    };
  }, []);

  return (
    <>
      {NAV_SPECS.map(({ id, Icon, iconClassName, shellClassName = '' }) => {
        const host = hosts[id];
        if (!host) return null;
        return createPortal(
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center ${shellClassName}`}>
            <Icon className={`h-[19px] w-[19px] stroke-[1.8] ${iconClassName}`} />
          </span>,
          host,
          id
        );
      })}
    </>
  );
}
