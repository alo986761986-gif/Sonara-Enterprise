import React, { useState } from 'react';
import {
  BarChart3,
  Bot,
  Brain,
  Cloud,
  Globe2,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Music2,
  Package,
  Radio,
  Scale,
  Sparkles,
  Store,
  Users,
  WandSparkles
} from 'lucide-react';
import App from './App';
import { OverviewDashboard } from './components/analytics/OverviewDashboard';
import { IntelligenceCenter } from './components/analytics/IntelligenceCenter';
import { AssistantPanel } from './components/assistant/AssistantPanel';
import { MusicBrainDashboard } from './components/brain/MusicBrainDashboard';
import { CloudDashboard } from './components/cloud/CloudDashboard';
import { TeamsHub } from './components/community/TeamsHub';
import { MessagesHub } from './components/community/MessagesHub';
import WorldwideDiscovery from './components/WorldwideDiscovery';
import { MarketplaceLayout } from './components/marketplace/MarketplaceLayout';
import { PluginDashboard } from './components/plugins/PluginDashboard';
import { ProductionCenter } from './components/production/ProductionCenter';
import { PublishingStudioMobile } from './components/publishing/PublishingStudioMobile';
import { RightsDashboard } from './components/rights/RightsDashboard';

type Section =
  | 'dashboard'
  | 'studio'
  | 'discovery'
  | 'brain'
  | 'plugins'
  | 'publishing'
  | 'marketplace'
  | 'rights'
  | 'cloud'
  | 'production'
  | 'community'
  | 'intelligence';

const NAV: Array<[Section, string, any]> = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['studio', 'Studio', Music2],
  ['discovery', 'Discovery', Globe2],
  ['brain', 'Music Brain', Brain],
  ['plugins', 'Plugins', Package],
  ['publishing', 'Publishing / Marketing', Megaphone],
  ['marketplace', 'Marketplace', Store],
  ['rights', 'Rights', Scale],
  ['cloud', 'Cloud', Cloud],
  ['production', 'Production', WandSparkles],
  ['community', 'Community', Users],
  ['intelligence', 'Intelligence', BarChart3]
];

export default function SonaraEnterpriseShell() {
  const [active, setActive] = useState<Section>('dashboard');
  const [emberOpen, setEmberOpen] = useState(false);
  const [communityTab, setCommunityTab] = useState<'teams' | 'messages'>('teams');

  const renderSection = () => {
    switch (active) {
      case 'studio':
        return <App />;
      case 'discovery':
        return <WorldwideDiscovery />;
      case 'brain':
        return <MusicBrainDashboard />;
      case 'plugins':
        return <PluginDashboard />;
      case 'publishing':
        return <PublishingStudioMobile />;
      case 'marketplace':
        return <MarketplaceLayout />;
      case 'rights':
        return (
          <div className="p-6">
            <RightsDashboard />
          </div>
        );
      case 'cloud':
        return <CloudDashboard />;
      case 'production':
        return <ProductionCenter />;
      case 'community':
        return (
          <div className="p-6">
            <div className="mb-6 flex gap-2">
              <button
                type="button"
                onClick={() => setCommunityTab('teams')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${communityTab === 'teams' ? 'bg-purple-600 text-white' : 'border border-slate-800 bg-slate-900 text-slate-300'}`}
              >
                <Users className="h-4 w-4" /> Teams
              </button>
              <button
                type="button"
                onClick={() => setCommunityTab('messages')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${communityTab === 'messages' ? 'bg-purple-600 text-white' : 'border border-slate-800 bg-slate-900 text-slate-300'}`}
              >
                <MessageSquare className="h-4 w-4" /> Messages
              </button>
            </div>
            {communityTab === 'teams' ? <TeamsHub /> : <MessagesHub />}
          </div>
        );
      case 'intelligence':
        return (
          <div className="space-y-6 p-6">
            <IntelligenceCenter />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                <Sparkles className="mb-3 h-5 w-5 text-purple-400" />
                <div className="text-xs font-black uppercase tracking-wider text-slate-500">Creative AI</div>
                <div className="mt-1 font-bold">Sonara intelligence services</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                <Radio className="mb-3 h-5 w-5 text-cyan-400" />
                <div className="text-xs font-black uppercase tracking-wider text-slate-500">Signals</div>
                <div className="mt-1 font-bold">Discovery and market context</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                <Bot className="mb-3 h-5 w-5 text-amber-400" />
                <div className="text-xs font-black uppercase tracking-wider text-slate-500">Copilot</div>
                <div className="mt-1 font-bold">EMBER workspace assistant</div>
              </div>
            </div>
          </div>
        );
      case 'dashboard':
      default:
        return (
          <div className="space-y-6 p-6">
            <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-purple-950/40 p-6">
              <div className="text-xs font-black uppercase tracking-[0.24em] text-purple-300">Sonara Enterprise</div>
              <h1 className="mt-2 text-3xl font-black">Creative operating system</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                Studio, discovery, intelligence, publishing, marketplace, rights, cloud, collaboration and Ember in one workspace.
              </p>
            </div>
            <OverviewDashboard />
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-slate-800 bg-[#090e18] p-4 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
          <div className="mb-6 flex items-center gap-3 px-2 py-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600">
              <Music2 className="h-6 w-6" />
            </div>
            <div>
              <div className="font-black tracking-wide">SONARA</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple-300">Enterprise OS</div>
            </div>
          </div>

          <nav className="space-y-2">
            {NAV.map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${active === id ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => setEmberOpen(true)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-purple-600/50 bg-purple-950/40 px-4 py-3 text-sm font-black text-purple-200 hover:bg-purple-900/50"
          >
            <Bot className="h-4 w-4" />
            OPEN EMBER
          </button>
        </aside>

        <main className="min-w-0 overflow-x-hidden">{renderSection()}</main>
      </div>

      {emberOpen ? <AssistantPanel onClose={() => setEmberOpen(false)} /> : null}
    </div>
  );
}
