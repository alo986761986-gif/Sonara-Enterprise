export type SupportedEqPresetId =
  | 'flat'
  | 'house'
  | 'tech_house'
  | 'melodic_house'
  | 'afro_house'
  | 'deep_house'
  | 'progressive_house'
  | 'edm'
  | 'techno'
  | 'trance'
  | 'hip_hop'
  | 'trap'
  | 'lo_fi'
  | 'pop'
  | 'rock'
  | 'cinematic'
  | 'podcast'
  | 'mastering';

const normalize = (value?: string): string => (value || '').trim().toLowerCase();

const isTrap = (genre?: string, subgenre?: string): boolean => {
  const merged = `${normalize(genre)} ${normalize(subgenre)}`;
  return merged.includes('trap');
};

const isHipHop = (genre?: string, subgenre?: string): boolean => {
  const merged = `${normalize(genre)} ${normalize(subgenre)}`;
  return merged.includes('hip hop') || merged.includes('hiphop');
};

const isPop = (genre?: string, subgenre?: string): boolean => {
  const merged = `${normalize(genre)} ${normalize(subgenre)}`;
  return merged.includes('pop');
};

export const resolveRecommendedEqPresetId = (
  recommendedLabel: string,
  genre?: string,
  subgenre?: string
): SupportedEqPresetId => {
  const label = normalize(recommendedLabel);

  if (label === 'club master') {
    return 'mastering';
  }

  if (label === 'bass focus') {
    if (isTrap(genre, subgenre)) return 'trap';
    if (isHipHop(genre, subgenre)) return 'hip_hop';
    return 'mastering';
  }

  if (label === 'vocal clarity') {
    if (isPop(genre, subgenre)) return 'pop';
    return 'mastering';
  }

  return 'mastering';
};
