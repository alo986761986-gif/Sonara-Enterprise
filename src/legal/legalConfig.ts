const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;

function value(name: string): string {
  return String(env[name] || '').trim();
}

export const legalConfig = {
  operatorName: value('VITE_LEGAL_OPERATOR_NAME'),
  taxId: value('VITE_LEGAL_OPERATOR_TAX_ID'),
  address: value('VITE_LEGAL_OPERATOR_ADDRESS'),
  contactEmail: value('VITE_LEGAL_CONTACT_EMAIL'),
  country: value('VITE_LEGAL_COUNTRY') || 'Italia',
  effectiveDate: value('VITE_LEGAL_EFFECTIVE_DATE') || '24 agosto 2026',
  version: value('VITE_LEGAL_VERSION') || '2026-08-24-v1'
};

export const missingLegalFields = [
  !legalConfig.operatorName && 'nome o ragione sociale',
  !legalConfig.taxId && 'Partita IVA o codice fiscale',
  !legalConfig.address && 'indirizzo della sede',
  !legalConfig.contactEmail && 'email di assistenza'
].filter(Boolean) as string[];

export const legalDocumentReady = missingLegalFields.length === 0;

export function legalValue(value: string, label: string): string {
  return value || `[DA COMPLETARE: ${label}]`;
}

