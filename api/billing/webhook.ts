import { normalizeStripeCatalogEnvironment } from '../../src/billing/stripeCatalogServer';
import billingHandler from './[...path]';

export const config = { api: { bodyParser: false } };

export default async function handler(req: any, res: any) {
  await normalizeStripeCatalogEnvironment();
  return billingHandler(req, res);
}
