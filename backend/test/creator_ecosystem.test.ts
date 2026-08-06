import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { ArtistProfileService } from '../src/services/ArtistProfileService';
import { TrackPublishingService } from '../src/services/TrackPublishingService';
import { CoverArtAIService } from '../src/services/CoverArtAIService';
import { PlaylistService } from '../src/services/PlaylistService';
import { SocialGraphService } from '../src/services/SocialGraphService';
import { RemixEngineService } from '../src/services/RemixEngineService';
import { ArtistAnalyticsService } from '../src/services/ArtistAnalyticsService';
import { RoyaltyEngineService } from '../src/services/RoyaltyEngineService';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

async function runCreatorEcosystemTestSuite() {
  console.log('=======================================================');
  console.log('[SONARA AI ENTERPRISE CREATOR ECOSYSTEM TEST SUITE v1.0]');
  console.log(`Targeting Server: ${BASE_URL}`);
  console.log('=======================================================');

  const testArtistId = `art_test_${Date.now()}`;
  const testProjectId = `proj_creator_${Date.now()}`;
  let publishingId = '';

  // ---------------------------------------------------------
  // [STEP 1] Testing ArtistProfileService & API
  // ---------------------------------------------------------
  console.log('\n[STEP 1] Testing ArtistProfileService & POST /api/creator/artist...');
  const artistRes = await axios.post(`${BASE_URL}/api/creator/artist`, {
    artistId: testArtistId,
    name: 'Sonara Cyber Vision',
    handle: '@sonara_cyber',
    bio: 'Enterprise AI Music Producer & Synthesizer Virtuoso',
    socialLinks: { twitter: '@sonara_cyber', instagram: '@sonara.ai' }
  });

  if (artistRes.status !== 200 || !artistRes.data.profile) {
    throw new Error('Artist Profile Creation Failed!');
  }
  console.log(`[PASS] Artist Profile Created | ID: ${artistRes.data.profile.artistId} | Handle: ${artistRes.data.profile.handle}`);

  // Verify Artist
  const verifyRes = await axios.post(`${BASE_URL}/api/creator/artist/${testArtistId}/verify`);
  if (!verifyRes.data.profile.verified) {
    throw new Error('Artist Verification Failed!');
  }
  console.log(`[PASS] Artist Verified | Badge Status: ${verifyRes.data.profile.verified}`);

  // ---------------------------------------------------------
  // [STEP 2] Testing TrackPublishingService & ISRC Code
  // ---------------------------------------------------------
  console.log('\n[STEP 2] Testing TrackPublishingService & POST /api/creator/publish...');
  const publishRes = await axios.post(`${BASE_URL}/api/creator/publish`, {
    projectId: testProjectId,
    artistId: testArtistId,
    title: 'Neon Odyssey Horizon',
    genre: 'Cyberpunk Synthwave',
    mood: 'Futuristic Energetic',
    durationSeconds: 210,
    qualityScore: 98
  });

  if (publishRes.status !== 201 || !publishRes.data.track) {
    throw new Error('Track Publishing Failed!');
  }

  publishingId = publishRes.data.track.publishingId;
  const isrcCode = publishRes.data.track.isrcCode;
  console.log(`[PASS] Track Published | Publishing ID: ${publishingId} | ISRC Code: ${isrcCode}`);

  if (!isrcCode.startsWith('US-SNA-26-')) {
    throw new Error(`Invalid ISRC Code Format: ${isrcCode}`);
  }
  console.log(`[PASS] Deterministic ISRC Format Validated: ${isrcCode}`);

  // Record Stream
  const streamRes = await axios.post(`${BASE_URL}/api/creator/track/${publishingId}/stream`);
  console.log(`[PASS] Stream Recorded | New Stream Count: ${streamRes.data.newStreamCount}`);

  // Toggle Like
  const likeRes = await axios.post(`${BASE_URL}/api/creator/track/${publishingId}/like`, { increment: true });
  console.log(`[PASS] Like Toggled | Like Count: ${likeRes.data.likeCount}`);

  // ---------------------------------------------------------
  // [STEP 3] Testing CoverArtAIService Vector & AI Render
  // ---------------------------------------------------------
  console.log('\n[STEP 3] Testing CoverArtAIService & GET /api/creator/cover-art/:projectId...');
  const coverRes = await axios.get(`${BASE_URL}/api/creator/cover-art/${testProjectId}`);
  if (coverRes.status !== 200 || !coverRes.headers['content-type'].includes('svg')) {
    throw new Error('Cover Art Generation Failed!');
  }
  console.log(`[PASS] Cover Art SVG Rendered & Served | Content-Type: ${coverRes.headers['content-type']}`);

  // ---------------------------------------------------------
  // [STEP 4] Testing PlaylistService
  // ---------------------------------------------------------
  console.log('\n[STEP 4] Testing PlaylistService & POST /api/creator/playlist...');
  const playlistRes = await axios.post(`${BASE_URL}/api/creator/playlist`, {
    name: 'Top Sonara Cyber Hits 2026',
    description: 'Curated enterprise AI tracks',
    ownerId: testArtistId,
    initialTrackIds: [publishingId]
  });

  if (playlistRes.status !== 201 || !playlistRes.data.playlist) {
    throw new Error('Playlist Creation Failed!');
  }
  console.log(`[PASS] Playlist Created | ID: ${playlistRes.data.playlist.playlistId} | Tracks: ${playlistRes.data.playlist.trackCount}`);

  // ---------------------------------------------------------
  // [STEP 5] Testing SocialGraphService (Follow, Comments, Feed)
  // ---------------------------------------------------------
  console.log('\n[STEP 5] Testing SocialGraphService & Comments...');
  const followerId = `art_follower_${Date.now()}`;
  const followRes = await axios.post(`${BASE_URL}/api/creator/social/follow`, {
    followerId,
    followingId: testArtistId
  });
  console.log(`[PASS] Social Follow Result | IsFollowing: ${followRes.data.isFollowing} | Subscriber Count: ${followRes.data.followerCount}`);

  const commentRes = await axios.post(`${BASE_URL}/api/creator/social/comment`, {
    publishingId,
    userId: followerId,
    userName: 'Cyber Fan #101',
    text: 'Incredible analog warm bassline and mastering!'
  });
  console.log(`[PASS] Track Comment Added | Comment ID: ${commentRes.data.comment.commentId}`);

  // ---------------------------------------------------------
  // [STEP 6] Testing RemixEngineService & Split Percentages
  // ---------------------------------------------------------
  console.log('\n[STEP 6] Testing RemixEngineService & Split Lineage...');
  const remixProjectId = `proj_remix_${Date.now()}`;
  const remixerId = `art_remixer_${Date.now()}`;

  const remixRes = await axios.post(`${BASE_URL}/api/creator/remix`, {
    originalProjectId: testProjectId,
    originalArtistId: testArtistId,
    remixProjectId,
    remixerArtistId: remixerId,
    remixTitle: 'Neon Odyssey Horizon (VIP Club Remix)',
    originalArtistSplitPercent: 60,
    stemsUsed: ['bass', 'synths', 'vocals']
  });

  if (remixRes.status !== 201 || !remixRes.data.remix) {
    throw new Error('Remix Lineage Record Creation Failed!');
  }
  console.log(`[PASS] Remix Record Created | Remix ID: ${remixRes.data.remix.remixId} | Split: ${remixRes.data.remix.originalArtistSplitPercent}% / ${remixRes.data.remix.remixerSplitPercent}%`);

  // ---------------------------------------------------------
  // [STEP 7] Testing ArtistAnalyticsService Telemetry
  // ---------------------------------------------------------
  console.log('\n[STEP 7] Testing ArtistAnalyticsService Telemetry & Geo Breakdown...');
  const analyticsRes = await axios.get(`${BASE_URL}/api/creator/analytics/${testArtistId}?timeframe=30d`);
  if (analyticsRes.status !== 200 || !analyticsRes.data.report) {
    throw new Error('Analytics Report Retrieval Failed!');
  }
  const report = analyticsRes.data.report;
  console.log(`[PASS] Analytics Report Generated | Total Streams: ${report.totalStreams} | Completion Rate: ${report.avgCompletionRatePercent}%`);
  console.log(`[PASS] Geo Audience Breakdown: Top Country ${report.geographicDistribution[0].country} (${report.geographicDistribution[0].percentage}%)`);

  // ---------------------------------------------------------
  // [STEP 8] Testing RoyaltyEngineService & Ledger Payouts
  // ---------------------------------------------------------
  console.log('\n[STEP 8] Testing RoyaltyEngineService Ledger & Payouts...');
  const royaltyRes = await axios.get(`${BASE_URL}/api/creator/royalties/${testArtistId}`);
  if (royaltyRes.status !== 200 || !royaltyRes.data.statement) {
    throw new Error('Royalty Statement Retrieval Failed!');
  }
  const statement = royaltyRes.data.statement;
  console.log(`[PASS] Royalty Statement Generated | Gross: $${statement.grossRoyaltiesUsd} | Net Payable: $${statement.netPayableUsd}`);

  const payoutRes = await axios.post(`${BASE_URL}/api/creator/royalties/payout`, {
    artistId: testArtistId,
    amountUsd: 5.00
  });

  if (payoutRes.status !== 200 || !payoutRes.data.payout) {
    throw new Error('Royalty Payout Process Failed!');
  }
  console.log(`[PASS] Royalty Payout Processed | Payout ID: ${payoutRes.data.payout.payoutId} | Net Paid: $${payoutRes.data.payout.netEarningsUsd} | TxRef: ${payoutRes.data.payout.transactionRef}`);

  console.log('\n=======================================================');
  console.log('[SUCCESS] CREATOR ECOSYSTEM ENGINE v1.0 TEST SUITE PASSED 100%');
  console.log('=======================================================');
}

runCreatorEcosystemTestSuite().catch(err => {
  console.error('\n[TEST FAILURE] Creator Ecosystem Test Suite Error:', err.message || err);
  process.exit(1);
});
