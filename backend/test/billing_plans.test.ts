import assert from 'node:assert/strict';
import { SONARA_PLANS, isBillingCadence, isSonaraPlanId } from '../../src/billing/plans';

assert.equal(SONARA_PLANS.free.includedSeconds, 600);
assert.equal(SONARA_PLANS.creator.includedSeconds, 7200);
assert.equal(SONARA_PLANS.studio.includedSeconds, 30000);
assert.equal(SONARA_PLANS.free.maxTrackSeconds, 60);
assert.equal(SONARA_PLANS.creator.maxTrackSeconds, 240);
assert.equal(SONARA_PLANS.studio.maxTrackSeconds, 480);
assert.match(SONARA_PLANS.studio.features.join(' '), /8 minuti/);
assert.equal(SONARA_PLANS.free.commercialUse, false);
assert.equal(SONARA_PLANS.creator.commercialUse, true);
assert.equal(SONARA_PLANS.studio.commercialUse, true);
assert.equal(isSonaraPlanId('creator'), true);
assert.equal(isSonaraPlanId('enterprise'), false);
assert.equal(isBillingCadence('yearly'), true);
assert.equal(isBillingCadence('weekly'), false);
assert.ok(SONARA_PLANS.creator.yearlyPriceEur < SONARA_PLANS.creator.monthlyPriceEur * 12);
assert.ok(SONARA_PLANS.studio.yearlyPriceEur < SONARA_PLANS.studio.monthlyPriceEur * 12);

console.log('SONARA billing plan tests passed.');
