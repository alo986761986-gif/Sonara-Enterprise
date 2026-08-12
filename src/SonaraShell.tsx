import React, { useState } from 'react';
import {
  Activity,
  Globe2,
  LayoutDashboard,
  Menu,
  Music,
  ShoppingBag,
  Sparkles,
  X
} from 'lucide-react';
import StudioGenerator from './App';
import { OverviewDashboard } from './components/analytics/OverviewDashboard';
import DiscoveryWorkspace from './components/discovery/DiscoveryWorkspace';
import EmberWorkspace from './components/ember/EmberWorkspace';
import MarketplaceWorkspace from './components/marketplace/MarketplaceWorkspace';
import VocalStudioPanel from './components/studio/VocalStudioPanel';

type SonaraView = 'dashboard' | 'studio' | 'ember' | 'discovery' | 'marketplace';

type NavItem = {
  id: SonaraView;
  label: string;
  description: string;
  icon: React.ElementType;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Overview', icon: LayoutDashboard },
  { id: 'studio', label: 'Studio', description: 'ACE-Step', icon: Music },
  { id: 'ember', label: 'Ember', description: 'Creative AI', icon: Sparkles },
  { id: 'discovery', label: 'Discovery', description: 'Network', icon: Globe2 },
  { id: 'marketplace', label: 'Marketplace', description: 'Assets', icon: ShoppingBag }
];

const VIEW_COPY: Record<SonaraView, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Command Center',
    subtitle: 'A unified overview of the Sonara creative ecosystem.'
  },
  studio: {
    title: 'Music Studio',
    subtitle: 'Generate, inspect and master music with the stable ACE-Step pipeline.'
  },
  ember: {
    title: 'Ember',
    subtitle: 'Creative intelligence workspace, staged with zero paid services.'
  },
  discovery: {
    title: 'Worldwide Discovery',
    subtitle: 'Explore creative hubs and the global Sonara network.'
  },
  marketplace: {
    title: 'Marketplace',
    subtitle: 'Preview the creator asset ecosystem safely in development.'
  }
};

export default function SonaraShell() {
  const [activeView, setActiveView] = useState<SonaraView>('studio');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const copy = VIEW_COPY[activeView];

  const selectView = (view: SonaraView) => {
    setActiveView(view);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
            <OverviewDashboard />
          </div>
        );
      case 'ember':
        return (
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
            <EmberWorkspace />
          </div>
        );
      case 'discovery':
        return (
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
            <DiscoveryWorkspace />
          </div>
        );
      case 'marketplace':
        return (
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
            <MarketplaceWorkspace />
          </div>
        );
      case 'studio':
      default:
        return (
          <>
            <div className="mx-auto max-w-5xl px-6 pt-6">
              <VocalStudioPanel />
            </div>
            <StudioGenerator />
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#060912] text-slate-100">
      <header className="sticky top-0 z-[100] border-b border-white/10 bg-[#070b14]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => selectView('dashboard')}
            className="flex shrink-0 items-center gap-3"
            aria-label="Open Sonara dashboard"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-violet-500 shadow-lg shadow-purple-950/30">
              <Music className="h-5 w-5 text-white" />
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-black tracking-[0.16em] text-white">SONARA</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Enterprise V12</div>
            </div>
          </button>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex" aria-label="Sonara primary navigation">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              const active = item.id === activeView;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectView(item.id)}
                  className={active
                    ? 'flex items-center gap-2 rounded-xl border border-purple-400/30 bg-purple-500/15 px-3.5 py-2 text-xs font-bold text-purple-100'
                    : 'flex items-center gap-2 rounded-xl border border-transparent px-3.5 py-2 text-xs font-semibold text-slate-400 transition hover:border-white/10 hover:bg-white/[0.04] hover:text-white'}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-300">
              <Activity className="h-3.5 w-3.5" />
              Dev workspace
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(previous => !previous)}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] lg:hidden"
            aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav className="border-t border-white/10 bg-[#080c15] p-3 lg:hidden" aria-label="Sonara mobile navigation">
            <div className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-2">
              {NAV_ITEMS.map(item => {
                const Icon = item.icon;
                const active = item.id === activeView;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectView(item.id)}
                    className={active
                      ? 'flex items-center gap-3 rounded-2xl border border-purple-400/30 bg-purple-500/15 p-3 text-left'
                      : 'flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left'}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/20">
                      <Icon className="h-4 w-4 text-purple-300" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{item.label}</div>
                      <div className="text-[10px] text-slate-500">{item.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {activeView !== 'studio' && (
        <div className="border-b border-white/5 bg-[#080c15]">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-black tracking-tight text-white">{copy.title}</h1>
              <p className="text-xs text-slate-500">{copy.subtitle}</p>
            </div>
          </div>
        </div>
      )}

      <main>{renderView()}</main>
    </div>
  );
}
