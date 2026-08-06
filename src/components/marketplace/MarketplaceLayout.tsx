// MarketplaceLayout.tsx - Enterprise Digital Asset Store Layout with Creator Studio & Library
import React, { useState, useMemo, useEffect } from 'react';
import MarketplaceHeader from './MarketplaceHeader';
import MarketplaceSidebar from './MarketplaceSidebar';
import MarketplaceGrid from './MarketplaceGrid';
import MarketplaceInspector from './MarketplaceInspector';
import PurchasePanel from './PurchasePanel';
import SellerCenter from './SellerCenter';
import MarketplaceDownloads from './MarketplaceDownloads';
import MarketplaceArchitectureReportModal from './MarketplaceArchitectureReportModal';
import CommerceReportModal from './CommerceReportModal';
import AiMarketplaceReportModal from './AiMarketplaceReportModal';
import MarketplaceOperationsModal from './MarketplaceOperationsModal';
import MarketplaceOperationsReportModal from './MarketplaceOperationsReportModal';
import VerificationReportModal from './VerificationReportModal';
import SubscriptionModal from './SubscriptionModal';
import SubscriptionReportModal from './SubscriptionReportModal';
import CollaborationModal from './CollaborationModal';
import CollaborationReportModal from './CollaborationReportModal';
import AiProductionStudioModal from './AiProductionStudioModal';
import AiProductionStudioReportModal from './AiProductionStudioReportModal';
import GlobalDistributionModal from './GlobalDistributionModal';
import DistributionReportModal from './DistributionReportModal';
import SonaraCloudModal from './SonaraCloudModal';
import SonaraCloudReportModal from './SonaraCloudReportModal';
import SonaraEnterpriseModal from './SonaraEnterpriseModal';
import MobileEcosystemModal from './MobileEcosystemModal';
import MobileEcosystemReportModal from './MobileEcosystemReportModal';
import DeveloperPlatformModal from './DeveloperPlatformModal';
import DeveloperPlatformReportModal from './DeveloperPlatformReportModal';
import EnterpriseAIModal from './EnterpriseAIModal';
import EnterpriseAIReportModal from './EnterpriseAIReportModal';
import ReleaseCandidateReportModal from './ReleaseCandidateReportModal';
import GlobalReleaseReportModal from './GlobalReleaseReportModal';
import PrivateBetaModal from './PrivateBetaModal';
import PrivateBetaReportModal from './PrivateBetaReportModal';
import AiOrchestrationModal from './AiOrchestrationModal';
import AiOrchestrationReportModal from './AiOrchestrationReportModal';
import WorkflowAutomationModal from './WorkflowAutomationModal';
import WorkflowAutomationReportModal from './WorkflowAutomationReportModal';
import IntegrationHubModal from './IntegrationHubModal';
import IntegrationHubReportModal from './IntegrationHubReportModal';
import MonitoringCenterModal from './MonitoringCenterModal';
import MonitoringCenterReportModal from './MonitoringCenterReportModal';
import EnterpriseAnalyticsModal from './EnterpriseAnalyticsModal';
import EnterpriseAnalyticsReportModal from './EnterpriseAnalyticsReportModal';
import AdministrationCenterModal from './AdministrationCenterModal';
import AdministrationCenterReportModal from './AdministrationCenterReportModal';
import MusicProviderEngineModal from './MusicProviderEngineModal';
import MusicProviderEngineReportModal from './MusicProviderEngineReportModal';
import MusicCreatorModal from './MusicCreatorModal';
import MusicCreatorReportModal from './MusicCreatorReportModal';
import DigitalAudioWorkspaceModal from './DigitalAudioWorkspaceModal';
import DigitalAudioWorkspaceReportModal from './DigitalAudioWorkspaceReportModal';
import AiMixingMasteringModal from './AiMixingMasteringModal';
import AiMixingMasteringReportModal from './AiMixingMasteringReportModal';
import ReleaseManagerModal from './ReleaseManagerModal';
import ReleaseManagerReportModal from './ReleaseManagerReportModal';
import CopyrightRoyaltyModal from './CopyrightRoyaltyModal';
import CopyrightRoyaltyReportModal from './CopyrightRoyaltyReportModal';
import GlobalDspModal from './GlobalDspModal';
import GlobalDspReportModal from './GlobalDspReportModal';
import AiArtistManagerModal from './AiArtistManagerModal';
import AiArtistManagerReportModal from './AiArtistManagerReportModal';
import LabelManagerModal from './LabelManagerModal';
import LabelManagerReportModal from './LabelManagerReportModal';
import EnterpriseBiModal from './EnterpriseBiModal';
import EnterpriseBiReportModal from './EnterpriseBiReportModal';
import SaosOperatingSystemModal from './SaosOperatingSystemModal';
import SaosOperatingSystemReportModal from './SaosOperatingSystemReportModal';
import MusicGenerationModal from './MusicGenerationModal';
import MusicGenerationReportModal from './MusicGenerationReportModal';
import { MarketplaceItem } from './MarketplaceCard';
import { ShoppingBag, ShieldCheck, Download, Sparkles, Store, Package, Database, CreditCard, BrainCircuit, ShieldAlert, BadgeCheck, Crown, Users, Globe, Cloud, Layers, Smartphone, Code, Award, Workflow, Share2, Activity, BarChart3, Radio, Disc, Scale, Building2, Music, Cpu, Sliders } from 'lucide-react';

const INITIAL_ITEMS: MarketplaceItem[] = [
  {
    id: 'm1',
    title: 'Cyberpunk Synthwave Vol. 1',
    category: 'Samples',
    creator: 'Kaito Beats',
    price: '$24.99',
    rating: 4.9,
    downloads: 1420,
    likes: 380,
    verified: true,
    coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'm2',
    title: 'Tokyo Vocal Stems (WAV)',
    category: 'Vocals',
    creator: 'Aria Sterling',
    price: '$34.99',
    rating: 5.0,
    downloads: 2890,
    likes: 840,
    verified: true,
    coverUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'm3',
    title: 'Serum Analog Heat Presets',
    category: 'Presets',
    creator: 'Modular Lab',
    price: '$19.99',
    rating: 4.8,
    downloads: 980,
    likes: 210,
    verified: false,
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'm4',
    title: 'Sonara AI Voice Model: CyberDiva',
    category: 'AI Models',
    creator: 'Sonara Labs',
    price: '$49.99',
    rating: 5.0,
    downloads: 5120,
    likes: 1950,
    verified: true,
    coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'm5',
    title: 'Ableton Techno Master Template',
    category: 'Templates',
    creator: 'Berlin Underground',
    price: '$39.99',
    rating: 4.7,
    downloads: 640,
    likes: 140,
    verified: true,
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'm6',
    title: 'LoFi Hip-Hop Guitar Loops',
    category: 'Loops',
    creator: 'Chillhop Studio',
    price: '$14.99',
    rating: 4.9,
    downloads: 3200,
    likes: 910,
    verified: true,
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?q=80&w=800&auto=format&fit=crop',
  }
];

export const MarketplaceLayout: React.FC = () => {
  const [activeView, setActiveView] = useState<'store' | 'studio' | 'library'>('store');
  const [items, setItems] = useState<MarketplaceItem[]>(INITIAL_ITEMS);
  const [myItems, setMyItems] = useState<MarketplaceItem[]>([INITIAL_ITEMS[1]]);
  const [purchasedItems, setPurchasedItems] = useState<MarketplaceItem[]>([INITIAL_ITEMS[0]]);
  
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'trending' | 'latest' | 'rating' | 'price'>('trending');
  const [isAiRecommended, setIsAiRecommended] = useState<boolean>(false);

  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(INITIAL_ITEMS[0]);
  const [purchasingItem, setPurchasingItem] = useState<MarketplaceItem | null>(null);
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [isCommerceReportOpen, setIsCommerceReportOpen] = useState<boolean>(false);
  const [isAiReportOpen, setIsAiReportOpen] = useState<boolean>(false);
  const [isOperationsOpen, setIsOperationsOpen] = useState<boolean>(false);
  const [isOperationsReportOpen, setIsOperationsReportOpen] = useState<boolean>(false);
  const [isVerificationReportOpen, setIsVerificationReportOpen] = useState<boolean>(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState<boolean>(false);
  const [isSubscriptionReportOpen, setIsSubscriptionReportOpen] = useState<boolean>(false);
  const [isCollaborationOpen, setIsCollaborationOpen] = useState<boolean>(false);
  const [isCollaborationReportOpen, setIsCollaborationReportOpen] = useState<boolean>(false);
  const [isAiStudioOpen, setIsAiStudioOpen] = useState<boolean>(false);
  const [isAiStudioReportOpen, setIsAiStudioReportOpen] = useState<boolean>(false);
  const [isDistributionOpen, setIsDistributionOpen] = useState<boolean>(false);
  const [isDistributionReportOpen, setIsDistributionReportOpen] = useState<boolean>(false);
  const [isCloudOpen, setIsCloudOpen] = useState<boolean>(false);
  const [isCloudReportOpen, setIsCloudReportOpen] = useState<boolean>(false);
  const [isEnterpriseOpen, setIsEnterpriseOpen] = useState<boolean>(false);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const [isMobileReportOpen, setIsMobileReportOpen] = useState<boolean>(false);
  const [isDevOpen, setIsDevOpen] = useState<boolean>(false);
  const [isDevReportOpen, setIsDevReportOpen] = useState<boolean>(false);
  const [isAiOpen, setIsAiOpen] = useState<boolean>(false);
  const [isEnterpriseAiReportOpen, setIsEnterpriseAiReportOpen] = useState<boolean>(false);
  const [isRcReportOpen, setIsRcReportOpen] = useState<boolean>(false);
  const [isGlobalReleaseReportOpen, setIsGlobalReleaseReportOpen] = useState<boolean>(false);
  const [isPrivateBetaOpen, setIsPrivateBetaOpen] = useState<boolean>(false);
  const [isPrivateBetaReportOpen, setIsPrivateBetaReportOpen] = useState<boolean>(false);
  const [isAiOrchestrationOpen, setIsAiOrchestrationOpen] = useState<boolean>(false);
  const [isAiOrchestrationReportOpen, setIsAiOrchestrationReportOpen] = useState<boolean>(false);
  const [isWorkflowOpen, setIsWorkflowOpen] = useState<boolean>(false);
  const [isWorkflowReportOpen, setIsWorkflowReportOpen] = useState<boolean>(false);
  const [isIntegrationHubOpen, setIsIntegrationHubOpen] = useState<boolean>(false);
  const [isIntegrationHubReportOpen, setIsIntegrationHubReportOpen] = useState<boolean>(false);
  const [isMonitoringOpen, setIsMonitoringOpen] = useState<boolean>(false);
  const [isMonitoringReportOpen, setIsMonitoringReportOpen] = useState<boolean>(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState<boolean>(false);
  const [isAnalyticsReportOpen, setIsAnalyticsReportOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isAdminReportOpen, setIsAdminReportOpen] = useState<boolean>(false);
  const [isMusicProviderOpen, setIsMusicProviderOpen] = useState<boolean>(false);
  const [isMusicProviderReportOpen, setIsMusicProviderReportOpen] = useState<boolean>(false);
  const [isMusicCreatorOpen, setIsMusicCreatorOpen] = useState<boolean>(false);
  const [isMusicCreatorReportOpen, setIsMusicCreatorReportOpen] = useState<boolean>(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState<boolean>(false);
  const [isWorkspaceReportOpen, setIsWorkspaceReportOpen] = useState<boolean>(false);
  const [isAiMixingOpen, setIsAiMixingOpen] = useState<boolean>(false);
  const [isAiMixingReportOpen, setIsAiMixingReportOpen] = useState<boolean>(false);
  const [isReleaseManagerOpen, setIsReleaseManagerOpen] = useState<boolean>(false);
  const [isReleaseManagerReportOpen, setIsReleaseManagerReportOpen] = useState<boolean>(false);
  const [isCopyrightOpen, setIsCopyrightOpen] = useState<boolean>(false);
  const [isCopyrightReportOpen, setIsCopyrightReportOpen] = useState<boolean>(false);
  const [isGlobalDspOpen, setIsGlobalDspOpen] = useState<boolean>(false);
  const [isGlobalDspReportOpen, setIsGlobalDspReportOpen] = useState<boolean>(false);
  const [isArtistManagerOpen, setIsArtistManagerOpen] = useState<boolean>(false);
  const [isArtistManagerReportOpen, setIsArtistManagerReportOpen] = useState<boolean>(false);
  const [isLabelManagerOpen, setIsLabelManagerOpen] = useState<boolean>(false);
  const [isLabelManagerReportOpen, setIsLabelManagerReportOpen] = useState<boolean>(false);
  const [isEnterpriseBiOpen, setIsEnterpriseBiOpen] = useState<boolean>(false);
  const [isEnterpriseBiReportOpen, setIsEnterpriseBiReportOpen] = useState<boolean>(false);
  const [isSaosOpen, setIsSaosOpen] = useState<boolean>(false);
  const [isSaosReportOpen, setIsSaosReportOpen] = useState<boolean>(false);
  const [isMusicGenOpen, setIsMusicGenOpen] = useState<boolean>(false);
  const [isMusicGenReportOpen, setIsMusicGenReportOpen] = useState<boolean>(false);

  useEffect(() => {
    if (localStorage.getItem('open_music_gen') === 'true') {
      localStorage.removeItem('open_music_gen');
      setIsMusicGenOpen(true);
    }
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [items, selectedCategory, searchQuery]);

  const handleAddNewItem = (newItem: Partial<MarketplaceItem>) => {
    const fullItem: MarketplaceItem = {
      id: newItem.id || `item_${Date.now()}`,
      creatorId: newItem.creatorId || 'user_current',
      creatorName: newItem.creatorName || 'Aria Sterling',
      creatorVerified: newItem.creatorVerified ?? true,
      title: newItem.title || 'Untitled Asset',
      subtitle: newItem.subtitle || '',
      description: newItem.description || '',
      category: newItem.category || 'Samples',
      subcategory: newItem.subcategory || 'General',
      tags: newItem.tags || [],
      price: newItem.price || '$29.99',
      currency: 'USD',
      isFree: newItem.isFree ?? false,
      coverUrl: newItem.coverUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
      gallery: newItem.gallery || [],
      previewAudio: newItem.previewAudio,
      downloadFile: newItem.downloadFile,
      license: newItem.license || 'Commercial Royalty-Free',
      version: newItem.version || '1.0.0',
      compatibility: newItem.compatibility || ['Ableton', 'FL Studio'],
      rating: 5.0,
      ratingCount: 1,
      downloads: 0,
      sales: 0,
      favorites: 0,
      views: 1,
      status: newItem.status || 'published',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setItems([fullItem, ...items]);
    setMyItems([fullItem, ...myItems]);
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
    setMyItems(myItems.filter(i => i.id !== id));
  };

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans select-none relative">
      {/* Architecture Report Modal */}
      <MarketplaceArchitectureReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
      />

      {/* Commerce Report Modal */}
      <CommerceReportModal
        isOpen={isCommerceReportOpen}
        onClose={() => setIsCommerceReportOpen(false)}
      />

      {/* AI Marketplace Report Modal */}
      <AiMarketplaceReportModal
        isOpen={isAiReportOpen}
        onClose={() => setIsAiReportOpen(false)}
      />

      {/* Operations Center Modal */}
      <MarketplaceOperationsModal
        isOpen={isOperationsOpen}
        onClose={() => setIsOperationsOpen(false)}
      />

      {/* Operations Report Modal */}
      <MarketplaceOperationsReportModal
        isOpen={isOperationsReportOpen}
        onClose={() => setIsOperationsReportOpen(false)}
      />

      {/* Verification Report Modal */}
      <VerificationReportModal
        isOpen={isVerificationReportOpen}
        onClose={() => setIsVerificationReportOpen(false)}
      />

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={isSubscriptionOpen}
        onClose={() => setIsSubscriptionOpen(false)}
      />

      {/* Subscription Report Modal */}
      <SubscriptionReportModal
        isOpen={isSubscriptionReportOpen}
        onClose={() => setIsSubscriptionReportOpen(false)}
      />

      {/* Collaboration Modal */}
      <CollaborationModal
        isOpen={isCollaborationOpen}
        onClose={() => setIsCollaborationOpen(false)}
      />

      {/* Collaboration Report Modal */}
      <CollaborationReportModal
        isOpen={isCollaborationReportOpen}
        onClose={() => setIsCollaborationReportOpen(false)}
      />

      {/* AI Production Studio Modal */}
      <AiProductionStudioModal
        isOpen={isAiStudioOpen}
        onClose={() => setIsAiStudioOpen(false)}
      />

      {/* AI Production Studio Report Modal */}
      <AiProductionStudioReportModal
        isOpen={isAiStudioReportOpen}
        onClose={() => setIsAiStudioReportOpen(false)}
      />

      {/* Global Distribution Modal */}
      <GlobalDistributionModal
        isOpen={isDistributionOpen}
        onClose={() => setIsDistributionOpen(false)}
      />

      {/* Distribution Report Modal */}
      <DistributionReportModal
        isOpen={isDistributionReportOpen}
        onClose={() => setIsDistributionReportOpen(false)}
      />

      {/* Sonara Cloud Modal */}
      <SonaraCloudModal
        isOpen={isCloudOpen}
        onClose={() => setIsCloudOpen(false)}
      />

      {/* Sonara Cloud Report Modal */}
      <SonaraCloudReportModal
        isOpen={isCloudReportOpen}
        onClose={() => setIsCloudReportOpen(false)}
      />

      {/* Sonara Enterprise Ecosystem Modal */}
      <SonaraEnterpriseModal
        isOpen={isEnterpriseOpen}
        onClose={() => setIsEnterpriseOpen(false)}
      />

      {/* Mobile Ecosystem Modal */}
      <MobileEcosystemModal
        isOpen={isMobileOpen}
        onClose={() => setIsMobileOpen(false)}
      />

      {/* Mobile Ecosystem Report Modal */}
      <MobileEcosystemReportModal
        isOpen={isMobileReportOpen}
        onClose={() => setIsMobileReportOpen(false)}
      />

      {/* Developer Platform Modal */}
      <DeveloperPlatformModal
        isOpen={isDevOpen}
        onClose={() => setIsDevOpen(false)}
      />

      {/* Developer Platform Report Modal */}
      <DeveloperPlatformReportModal
        isOpen={isDevReportOpen}
        onClose={() => setIsDevReportOpen(false)}
      />

      {/* Enterprise AI Modal */}
      <EnterpriseAIModal
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
      />

      {/* Enterprise AI Report Modal */}
      <EnterpriseAIReportModal
        isOpen={isEnterpriseAiReportOpen}
        onClose={() => setIsEnterpriseAiReportOpen(false)}
      />

      {/* Release Candidate Report Modal */}
      <ReleaseCandidateReportModal
        isOpen={isRcReportOpen}
        onClose={() => setIsRcReportOpen(false)}
      />

      {/* Global Release Report Modal */}
      <GlobalReleaseReportModal
        isOpen={isGlobalReleaseReportOpen}
        onClose={() => setIsGlobalReleaseReportOpen(false)}
      />

      {/* Private Beta Modal */}
      <PrivateBetaModal
        isOpen={isPrivateBetaOpen}
        onClose={() => setIsPrivateBetaOpen(false)}
      />

      {/* Private Beta Report Modal */}
      <PrivateBetaReportModal
        isOpen={isPrivateBetaReportOpen}
        onClose={() => setIsPrivateBetaReportOpen(false)}
      />

      {/* AI Orchestration Modal */}
      <AiOrchestrationModal
        isOpen={isAiOrchestrationOpen}
        onClose={() => setIsAiOrchestrationOpen(false)}
      />

      {/* AI Orchestration Report Modal */}
      <AiOrchestrationReportModal
        isOpen={isAiOrchestrationReportOpen}
        onClose={() => setIsAiOrchestrationReportOpen(false)}
      />

      {/* Workflow Automation Modal */}
      <WorkflowAutomationModal
        isOpen={isWorkflowOpen}
        onClose={() => setIsWorkflowOpen(false)}
      />

      {/* Workflow Automation Report Modal */}
      <WorkflowAutomationReportModal
        isOpen={isWorkflowReportOpen}
        onClose={() => setIsWorkflowReportOpen(false)}
      />

      {/* Integration Hub Modal */}
      <IntegrationHubModal
        isOpen={isIntegrationHubOpen}
        onClose={() => setIsIntegrationHubOpen(false)}
      />

      {/* Integration Hub Report Modal */}
      <IntegrationHubReportModal
        isOpen={isIntegrationHubReportOpen}
        onClose={() => setIsIntegrationHubReportOpen(false)}
      />

      {/* Monitoring Center Modal */}
      <MonitoringCenterModal
        isOpen={isMonitoringOpen}
        onClose={() => setIsMonitoringOpen(false)}
      />

      {/* Monitoring Center Report Modal */}
      <MonitoringCenterReportModal
        isOpen={isMonitoringReportOpen}
        onClose={() => setIsMonitoringReportOpen(false)}
      />

      {/* Enterprise Analytics Modal */}
      <EnterpriseAnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
      />

      {/* Enterprise Analytics Report Modal */}
      <EnterpriseAnalyticsReportModal
        isOpen={isAnalyticsReportOpen}
        onClose={() => setIsAnalyticsReportOpen(false)}
      />

      {/* Administration Center Modal */}
      <AdministrationCenterModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
      />

      {/* Administration Center Report Modal */}
      <AdministrationCenterReportModal
        isOpen={isAdminReportOpen}
        onClose={() => setIsAdminReportOpen(false)}
      />

      {/* Music Provider Engine Modal */}
      <MusicProviderEngineModal
        isOpen={isMusicProviderOpen}
        onClose={() => setIsMusicProviderOpen(false)}
      />

      {/* Music Provider Engine Report Modal */}
      <MusicProviderEngineReportModal
        isOpen={isMusicProviderReportOpen}
        onClose={() => setIsMusicProviderReportOpen(false)}
      />

      {/* Music Creator Modal */}
      <MusicCreatorModal
        isOpen={isMusicCreatorOpen}
        onClose={() => setIsMusicCreatorOpen(false)}
      />

      {/* Music Creator Report Modal */}
      <MusicCreatorReportModal
        isOpen={isMusicCreatorReportOpen}
        onClose={() => setIsMusicCreatorReportOpen(false)}
      />

      {/* Digital Audio Workspace Modal */}
      <DigitalAudioWorkspaceModal
        isOpen={isWorkspaceOpen}
        onClose={() => setIsWorkspaceOpen(false)}
      />

      {/* Digital Audio Workspace Report Modal */}
      <DigitalAudioWorkspaceReportModal
        isOpen={isWorkspaceReportOpen}
        onClose={() => setIsWorkspaceReportOpen(false)}
      />

      {/* AI Mixing & Mastering Studio Modal */}
      <AiMixingMasteringModal
        isOpen={isAiMixingOpen}
        onClose={() => setIsAiMixingOpen(false)}
      />

      {/* AI Mixing & Mastering Studio Report Modal */}
      <AiMixingMasteringReportModal
        isOpen={isAiMixingReportOpen}
        onClose={() => setIsAiMixingReportOpen(false)}
      />

      {/* Release Manager Modal */}
      <ReleaseManagerModal
        isOpen={isReleaseManagerOpen}
        onClose={() => setIsReleaseManagerOpen(false)}
      />

      {/* Release Manager Report Modal */}
      <ReleaseManagerReportModal
        isOpen={isReleaseManagerReportOpen}
        onClose={() => setIsReleaseManagerReportOpen(false)}
      />

      {/* Copyright & Royalty Manager Modal */}
      <CopyrightRoyaltyModal
        isOpen={isCopyrightOpen}
        onClose={() => setIsCopyrightOpen(false)}
      />

      {/* Copyright & Royalty Manager Report Modal */}
      <CopyrightRoyaltyReportModal
        isOpen={isCopyrightReportOpen}
        onClose={() => setIsCopyrightReportOpen(false)}
      />

      {/* Global DSP Distribution Center Modal */}
      <GlobalDspModal
        isOpen={isGlobalDspOpen}
        onClose={() => setIsGlobalDspOpen(false)}
      />

      {/* Global DSP Distribution Center Report Modal */}
      <GlobalDspReportModal
        isOpen={isGlobalDspReportOpen}
        onClose={() => setIsGlobalDspReportOpen(false)}
      />

      {/* AI Artist Manager Modal */}
      <AiArtistManagerModal
        isOpen={isArtistManagerOpen}
        onClose={() => setIsArtistManagerOpen(false)}
      />

      {/* AI Artist Manager Report Modal */}
      <AiArtistManagerReportModal
        isOpen={isArtistManagerReportOpen}
        onClose={() => setIsArtistManagerReportOpen(false)}
      />

      {/* Enterprise Label Manager Modal */}
      <LabelManagerModal
        isOpen={isLabelManagerOpen}
        onClose={() => setIsLabelManagerOpen(false)}
      />

      {/* Enterprise Label Manager Report Modal */}
      <LabelManagerReportModal
        isOpen={isLabelManagerReportOpen}
        onClose={() => setIsLabelManagerReportOpen(false)}
      />

      {/* Enterprise Business Intelligence Modal */}
      <EnterpriseBiModal
        isOpen={isEnterpriseBiOpen}
        onClose={() => setIsEnterpriseBiOpen(false)}
      />

      {/* Enterprise Business Intelligence Report Modal */}
      <EnterpriseBiReportModal
        isOpen={isEnterpriseBiReportOpen}
        onClose={() => setIsEnterpriseBiReportOpen(false)}
      />

      {/* Sonara AI Operating System Modal */}
      <SaosOperatingSystemModal
        isOpen={isSaosOpen}
        onClose={() => setIsSaosOpen(false)}
      />

      {/* Sonara AI Operating System Report Modal */}
      <SaosOperatingSystemReportModal
        isOpen={isSaosReportOpen}
        onClose={() => setIsSaosReportOpen(false)}
      />

      {/* Music Generation Modal */}
      <MusicGenerationModal
        isOpen={isMusicGenOpen}
        onClose={() => setIsMusicGenOpen(false)}
      />

      {/* Music Generation Report Modal */}
      <MusicGenerationReportModal
        isOpen={isMusicGenReportOpen}
        onClose={() => setIsMusicGenReportOpen(false)}
      />

      {/* Sub-Navigation Bar for Views */}
      <div className="h-12 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('store')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeView === 'store' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Store size={14} />
            <span>Marketplace Store</span>
          </button>
          <button
            onClick={() => setActiveView('studio')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeView === 'studio' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Package size={14} />
            <span>Creator Studio ({myItems.length})</span>
          </button>
          <button
            onClick={() => setActiveView('library')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeView === 'library' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Download size={14} />
            <span>My Library ({purchasedItems.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMusicGenOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/40 to-blue-500/40 border border-cyan-500/60 text-cyan-100 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/50 transition-colors shadow-lg shadow-cyan-500/20"
          >
            <Music size={14} />
            <span>AI Music Gen v3.1</span>
          </button>
          <button
            onClick={() => setIsMusicGenReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Music size={14} />
            <span>Gen Report</span>
          </button>
          <button
            onClick={() => setIsSaosOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/40 to-cyan-500/40 border border-emerald-500/60 text-emerald-100 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-emerald-500/50 transition-colors shadow-lg shadow-emerald-500/20"
          >
            <Cpu size={14} />
            <span>SAOS v3.0 (Gold Master)</span>
          </button>
          <button
            onClick={() => setIsSaosReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-emerald-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Cpu size={14} />
            <span>SAOS Report</span>
          </button>
          <button
            onClick={() => setIsEnterpriseBiOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/35 to-blue-500/35 border border-cyan-500/50 text-cyan-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/45 transition-colors shadow-lg shadow-cyan-500/15"
          >
            <BarChart3 size={14} />
            <span>Enterprise BI v2.4</span>
          </button>
          <button
            onClick={() => setIsEnterpriseBiReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <BarChart3 size={14} />
            <span>BI Report</span>
          </button>
          <button
            onClick={() => setIsLabelManagerOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500/35 to-blue-500/35 border border-indigo-500/50 text-indigo-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-indigo-500/45 transition-colors shadow-lg shadow-indigo-500/15"
          >
            <Building2 size={14} />
            <span>Label Manager v2.3</span>
          </button>
          <button
            onClick={() => setIsLabelManagerReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-indigo-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Building2 size={14} />
            <span>Label Report</span>
          </button>
          <button
            onClick={() => setIsArtistManagerOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/35 to-purple-500/35 border border-amber-500/50 text-amber-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-amber-500/45 transition-colors shadow-lg shadow-amber-500/15"
          >
            <Crown size={14} />
            <span>Artist Manager v2.3</span>
          </button>
          <button
            onClick={() => setIsArtistManagerReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-amber-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Crown size={14} />
            <span>Manager Report</span>
          </button>
          <button
            onClick={() => setIsGlobalDspOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/35 to-blue-500/35 border border-cyan-500/50 text-cyan-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/45 transition-colors shadow-lg shadow-cyan-500/15"
          >
            <Globe size={14} />
            <span>Global DSP v2.2</span>
          </button>
          <button
            onClick={() => setIsGlobalDspReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Globe size={14} />
            <span>DSP Report</span>
          </button>
          <button
            onClick={() => setIsCopyrightOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/35 to-purple-500/35 border border-emerald-500/50 text-emerald-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-emerald-500/45 transition-colors shadow-lg shadow-emerald-500/15"
          >
            <Scale size={14} />
            <span>Copyright & Royalty v2.2</span>
          </button>
          <button
            onClick={() => setIsCopyrightReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-emerald-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Scale size={14} />
            <span>Copyright Report</span>
          </button>
          <button
            onClick={() => setIsReleaseManagerOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-500/35 to-cyan-500/35 border border-purple-500/50 text-purple-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-purple-500/45 transition-colors shadow-lg shadow-purple-500/15"
          >
            <Disc size={14} />
            <span>Release Manager v2.2</span>
          </button>
          <button
            onClick={() => setIsReleaseManagerReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-purple-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Disc size={14} />
            <span>Release Report</span>
          </button>
          <button
            onClick={() => setIsAiMixingOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/30 to-emerald-500/30 border border-cyan-500/50 text-cyan-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/40 transition-colors shadow-lg shadow-cyan-500/15"
          >
            <Sliders size={14} />
            <span>AI Mixing Studio v2.1</span>
          </button>
          <button
            onClick={() => setIsAiMixingReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Sliders size={14} />
            <span>Mixing Report</span>
          </button>
          <button
            onClick={() => setIsWorkspaceOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-500/30 to-blue-500/30 border border-purple-500/50 text-purple-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-purple-500/40 transition-colors shadow-lg shadow-purple-500/15"
          >
            <Layers size={14} />
            <span>DAW Workspace v2.1</span>
          </button>
          <button
            onClick={() => setIsWorkspaceReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-purple-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Layers size={14} />
            <span>Workspace Report</span>
          </button>
          <button
            onClick={() => setIsMusicProviderOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/30 to-blue-500/30 border border-cyan-500/50 text-cyan-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/40 transition-colors shadow-lg shadow-cyan-500/15"
          >
            <Radio size={14} />
            <span>Provider Engine v2.1</span>
          </button>
          <button
            onClick={() => setIsMusicProviderReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Radio size={14} />
            <span>Provider Report</span>
          </button>
          <button
            onClick={() => setIsAdminOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-500/30 to-purple-500/30 border border-rose-500/50 text-rose-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-rose-500/40 transition-colors shadow-lg shadow-rose-500/15"
          >
            <ShieldAlert size={14} />
            <span>Admin v2.1</span>
          </button>
          <button
            onClick={() => setIsAdminReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-rose-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <ShieldAlert size={14} />
            <span>Admin Report</span>
          </button>
          <button
            onClick={() => setIsAnalyticsOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-500/30 to-cyan-500/30 border border-purple-500/50 text-purple-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-purple-500/40 transition-colors shadow-lg shadow-purple-500/15"
          >
            <BarChart3 size={14} />
            <span>Analytics v2.1</span>
          </button>
          <button
            onClick={() => setIsAnalyticsReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-purple-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <BarChart3 size={14} />
            <span>Analytics Report</span>
          </button>
          <button
            onClick={() => setIsMonitoringOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/30 to-blue-500/30 border border-emerald-500/50 text-emerald-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-emerald-500/40 transition-colors shadow-lg shadow-emerald-500/15"
          >
            <Activity size={14} />
            <span>Monitoring v2.1</span>
          </button>
          <button
            onClick={() => setIsMonitoringReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-emerald-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Activity size={14} />
            <span>Monitor Report</span>
          </button>
          <button
            onClick={() => setIsIntegrationHubOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/30 to-blue-500/30 border border-cyan-500/50 text-cyan-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/40 transition-colors shadow-lg shadow-cyan-500/15"
          >
            <Share2 size={14} />
            <span>Integrations v2.1</span>
          </button>
          <button
            onClick={() => setIsIntegrationHubReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Share2 size={14} />
            <span>Integration Report</span>
          </button>
          <button
            onClick={() => setIsWorkflowOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/30 to-cyan-500/30 border border-emerald-500/50 text-emerald-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-emerald-500/40 transition-colors shadow-lg shadow-emerald-500/15"
          >
            <Workflow size={14} />
            <span>Workflows v2.1</span>
          </button>
          <button
            onClick={() => setIsWorkflowReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-emerald-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Workflow size={14} />
            <span>Workflow Report</span>
          </button>
          <button
            onClick={() => setIsPrivateBetaOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-500/25 to-cyan-500/25 border border-purple-500/40 text-purple-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-purple-500/30 transition-colors shadow-lg shadow-purple-500/10"
          >
            <Users size={14} />
            <span>Private Beta</span>
          </button>
          <button
            onClick={() => setIsPrivateBetaReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-purple-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Users size={14} />
            <span>Beta Report</span>
          </button>
          <button
            onClick={() => setIsGlobalReleaseReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/30 transition-colors shadow-lg shadow-cyan-500/10"
          >
            <Globe size={14} />
            <span>Global Release v2.0</span>
          </button>
          <button
            onClick={() => setIsRcReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-emerald-500/30 transition-colors shadow-lg shadow-emerald-500/10"
          >
            <Award size={14} />
            <span>RC1 Report</span>
          </button>
          <button
            onClick={() => setIsAiOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-pink-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/30 transition-colors shadow-lg shadow-cyan-500/10"
          >
            <BrainCircuit size={14} />
            <span>Enterprise AI</span>
          </button>
          <button
            onClick={() => setIsEnterpriseAiReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <BrainCircuit size={14} />
            <span>AI Report</span>
          </button>
          <button
            onClick={() => setIsDevOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-pink-500/20 border border-pink-500/40 text-pink-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-pink-500/30 transition-colors shadow-lg shadow-pink-500/10"
          >
            <Code size={14} />
            <span>Developer Platform</span>
          </button>
          <button
            onClick={() => setIsDevReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-pink-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Code size={14} />
            <span>Dev Report</span>
          </button>
          <button
            onClick={() => setIsMobileOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/30 transition-colors shadow-lg shadow-cyan-500/10"
          >
            <Smartphone size={14} />
            <span>Mobile Ecosystem</span>
          </button>
          <button
            onClick={() => setIsMobileReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Smartphone size={14} />
            <span>Mobile Report</span>
          </button>
          <button
            onClick={() => setIsEnterpriseOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/30 transition-colors shadow-lg shadow-cyan-500/10"
          >
            <Layers size={14} />
            <span>Enterprise Ecosystem</span>
          </button>
          <button
            onClick={() => setIsCloudOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-purple-500/30 transition-colors shadow-lg shadow-purple-500/10"
          >
            <Cloud size={14} />
            <span>Sonara Cloud</span>
          </button>
          <button
            onClick={() => setIsCloudReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-purple-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Cloud size={14} />
            <span>Cloud Report</span>
          </button>
          <button
            onClick={() => setIsDistributionOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/30 transition-colors shadow-lg shadow-cyan-500/10"
          >
            <Globe size={14} />
            <span>Distribution</span>
          </button>
          <button
            onClick={() => setIsDistributionReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Globe size={14} />
            <span>Dist Report</span>
          </button>
          <button
            onClick={() => setIsAiStudioOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-pink-500/20 border border-pink-500/40 text-pink-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-pink-500/30 transition-colors shadow-lg shadow-pink-500/10"
          >
            <Sparkles size={14} />
            <span>AI Studio</span>
          </button>
          <button
            onClick={() => setIsAiStudioReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-pink-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Sparkles size={14} />
            <span>AI Report</span>
          </button>
          <button
            onClick={() => setIsCollaborationOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-cyan-500/30 transition-colors"
          >
            <Users size={14} />
            <span>Collab Hub</span>
          </button>
          <button
            onClick={() => setIsCollaborationReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Users size={14} />
            <span>Collab Report</span>
          </button>
          <button
            onClick={() => setIsSubscriptionOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-amber-500/30 transition-colors"
          >
            <Crown size={14} />
            <span>Membership Plans</span>
          </button>
          <button
            onClick={() => setIsSubscriptionReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-amber-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Crown size={14} />
            <span>Sub Report</span>
          </button>
          <button
            onClick={() => setIsVerificationReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <BadgeCheck size={14} />
            <span>Verification Report</span>
          </button>
          <button
            onClick={() => setIsOperationsReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-amber-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <ShieldAlert size={14} />
            <span>Ops Report</span>
          </button>
          <button
            onClick={() => setIsAiReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-pink-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <BrainCircuit size={14} />
            <span>AI Report</span>
          </button>
          <button
            onClick={() => setIsCommerceReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-purple-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <CreditCard size={14} />
            <span>Commerce Report</span>
          </button>
          <button
            onClick={() => setIsReportOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
          >
            <Database size={14} />
            <span>Architecture Report</span>
          </button>
        </div>
      </div>

      {/* Main Body Switcher */}
      {activeView === 'store' && (
        <>
          <MarketplaceHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={setSortBy}
            isAiRecommended={isAiRecommended}
            onToggleAiRecommended={() => setIsAiRecommended(!isAiRecommended)}
          />

          <div className="flex-1 flex overflow-hidden relative">
            <MarketplaceSidebar
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />

            <MarketplaceGrid
              items={filteredItems}
              onSelectItem={setSelectedItem}
              onQuickPurchase={setPurchasingItem}
            />

            <MarketplaceInspector
              item={selectedItem}
              onPurchase={setPurchasingItem}
            />
          </div>
        </>
      )}

      {activeView === 'studio' && (
        <div className="flex-1 overflow-hidden">
          <SellerCenter
            myItems={myItems}
            onAddNewItem={handleAddNewItem}
            onDeleteItem={handleDeleteItem}
          />
        </div>
      )}

      {activeView === 'library' && (
        <div className="flex-1 overflow-hidden">
          <MarketplaceDownloads purchasedItems={purchasedItems} />
        </div>
      )}

      {/* Bottom Status Bar */}
      <footer className="h-8 w-full bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-between text-[11px] text-slate-400 shrink-0 font-mono z-30">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-emerald-400 font-bold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sonara Enterprise Rights Engine Active</span>
          </span>
          <span className="text-slate-600">|</span>
          <span>Assets Available: {filteredItems.length}</span>
        </div>
        <div className="flex items-center gap-2 text-purple-400 font-bold">
          <Sparkles className="w-3 h-3" />
          <span>Instant Commercial Clearance</span>
        </div>
      </footer>

      {/* Checkout Modal */}
      {purchasingItem && (
        <PurchasePanel
          assetTitle={purchasingItem.title}
          creatorName={purchasingItem.creator || 'Aria Sterling'}
          price={purchasingItem.price}
          licenseType="Commercial Royalty-Free"
          onClose={() => setPurchasingItem(null)}
          onSuccess={() => {
            setPurchasedItems([purchasingItem, ...purchasedItems]);
            if (selectedItem?.id === purchasingItem.id) {
              setSelectedItem({ ...selectedItem, isOwned: true });
            }
          }}
        />
      )}
    </div>
  );
};

export default MarketplaceLayout;
