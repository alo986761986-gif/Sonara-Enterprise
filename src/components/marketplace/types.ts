export interface MarketplaceItem {
  id: string;
  title: string;
  creatorName: string;
  coverUrl: string;
  category: string;
  price: string;
  rating: number;
  downloads: string | number;
  description?: string;
  version?: string;
  license?: string;
  creator?: string;
  isOwned?: boolean;
  [key: string]: any;
}
