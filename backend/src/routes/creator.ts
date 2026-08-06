import { Router, Request, Response } from 'express';
import { ArtistProfileService } from '../services/ArtistProfileService';
import { TrackPublishingService } from '../services/TrackPublishingService';
import { CoverArtAIService } from '../services/CoverArtAIService';
import { PlaylistService } from '../services/PlaylistService';
import { SocialGraphService } from '../services/SocialGraphService';
import { RemixEngineService } from '../services/RemixEngineService';
import { ArtistAnalyticsService } from '../services/ArtistAnalyticsService';
import { RoyaltyEngineService } from '../services/RoyaltyEngineService';
import { rateLimiterMiddleware, sanitizeInput } from '../middleware/SecurityHardening';

const router = Router();

// ==========================================
// ARTIST PROFILE ENDPOINTS
// ==========================================

// POST /api/creator/artist - Create or update profile
router.post('/artist', rateLimiterMiddleware, async (req: Request, res: Response) => {
  try {
    const { artistId, name, handle, bio, avatarUrl, bannerUrl, socialLinks } = req.body;
    if (!name || !handle) {
      return res.status(400).json({ error: 'Name and handle parameters are required' });
    }

    const profile = await ArtistProfileService.createOrUpdateProfile({
      artistId: artistId ? sanitizeInput(artistId, 50) : undefined,
      name: sanitizeInput(name, 100),
      handle: sanitizeInput(handle, 50),
      bio: bio ? sanitizeInput(bio, 500) : undefined,
      avatarUrl,
      bannerUrl,
      socialLinks
    });

    return res.status(200).json({ status: 'SUCCESS', profile });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed managing artist profile', message: err.message });
  }
});

// GET /api/creator/artist/:artistId - Get artist profile
router.get('/artist/:artistId', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const artistId = sanitizeInput(req.params.artistId, 50);
    const profile = ArtistProfileService.getProfile(artistId);
    if (!profile) {
      return res.status(404).json({ error: `Artist profile ${artistId} not found` });
    }
    return res.status(200).json({ status: 'SUCCESS', profile });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed getting artist profile', message: err.message });
  }
});

// GET /api/creator/artists - List creator artists
router.get('/artists', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const profiles = ArtistProfileService.listProfiles(limit);
    return res.status(200).json({ status: 'SUCCESS', count: profiles.length, profiles });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed listing profiles', message: err.message });
  }
});

// POST /api/creator/artist/:artistId/verify - Verify artist
router.post('/artist/:artistId/verify', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const artistId = sanitizeInput(req.params.artistId, 50);
    const updated = ArtistProfileService.verifyArtist(artistId, true);
    if (!updated) {
      return res.status(404).json({ error: 'Artist not found' });
    }
    return res.status(200).json({ status: 'SUCCESS', profile: updated });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed verifying artist', message: err.message });
  }
});

// ==========================================
// TRACK PUBLISHING ENDPOINTS
// ==========================================

// POST /api/creator/publish - Publish track
router.post('/publish', rateLimiterMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId, artistId, title, genre, mood, visibility, durationSeconds, qualityScore, key, bpm } = req.body;
    if (!projectId || !artistId || !title || !genre) {
      return res.status(400).json({ error: 'projectId, artistId, title, and genre are required' });
    }

    const track = await TrackPublishingService.publishTrack({
      projectId: sanitizeInput(projectId, 100),
      artistId: sanitizeInput(artistId, 50),
      title: sanitizeInput(title, 100),
      genre: sanitizeInput(genre, 50),
      mood: mood ? sanitizeInput(mood, 50) : undefined,
      visibility,
      durationSeconds,
      qualityScore,
      key,
      bpm
    });

    // Auto-generate AI Cover Art for track
    CoverArtAIService.generateCoverArt(projectId, title, genre).catch(err => {
      console.warn('[CREATOR_ROUTE] Cover art background generation deferred:', err);
    });

    return res.status(201).json({ status: 'SUCCESS', track });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed publishing track', message: err.message });
  }
});

// GET /api/creator/track/:publishingId - Get published track
router.get('/track/:publishingId', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const publishingId = sanitizeInput(req.params.publishingId, 100);
    const track = TrackPublishingService.getTrack(publishingId);
    if (!track) {
      return res.status(404).json({ error: `Track ${publishingId} not found` });
    }
    return res.status(200).json({ status: 'SUCCESS', track });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed getting track', message: err.message });
  }
});

// GET /api/creator/tracks - List published tracks
router.get('/tracks', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const artistId = req.query.artistId ? sanitizeInput(req.query.artistId as string, 50) : undefined;
    const genre = req.query.genre ? sanitizeInput(req.query.genre as string, 50) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const tracks = TrackPublishingService.listTracks({ artistId, genre, limit });
    return res.status(200).json({ status: 'SUCCESS', count: tracks.length, tracks });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed listing tracks', message: err.message });
  }
});

// POST /api/creator/track/:publishingId/stream - Record stream
router.post('/track/:publishingId/stream', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const publishingId = sanitizeInput(req.params.publishingId, 100);
    const result = TrackPublishingService.recordStream(publishingId);
    if (!result) {
      return res.status(404).json({ error: 'Track not found' });
    }
    return res.status(200).json({ status: 'SUCCESS', ...result });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed recording stream', message: err.message });
  }
});

// POST /api/creator/track/:publishingId/like - Toggle like
router.post('/track/:publishingId/like', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const publishingId = sanitizeInput(req.params.publishingId, 100);
    const increment = req.body.increment !== false;
    const track = TrackPublishingService.toggleLike(publishingId, increment);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }
    return res.status(200).json({ status: 'SUCCESS', likeCount: track.likeCount, track });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed updating like', message: err.message });
  }
});

// ==========================================
// COVER ART AI ENDPOINTS
// ==========================================

// POST /api/creator/cover-art/generate - Generate cover art
router.post('/cover-art/generate', rateLimiterMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId, title, genre, prompt } = req.body;
    if (!projectId || !title) {
      return res.status(400).json({ error: 'projectId and title required' });
    }

    const result = await CoverArtAIService.generateCoverArt(
      sanitizeInput(projectId, 100),
      sanitizeInput(title, 100),
      genre ? sanitizeInput(genre, 50) : 'Electronic',
      prompt ? sanitizeInput(prompt, 300) : undefined
    );

    return res.status(200).json({ status: 'SUCCESS', coverArt: result });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed generating cover art', message: err.message });
  }
});

// GET /api/creator/cover-art/:projectId - Serve cover art image
router.get('/cover-art/:projectId', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const projectId = sanitizeInput(req.params.projectId, 100);
    const { filePath, exists } = CoverArtAIService.getCoverArtFile(projectId);

    if (exists) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(filePath);
    }

    // Generate on-the-fly if missing
    CoverArtAIService.generateCoverArt(projectId, `Track ${projectId}`, 'Electronic').then(result => {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.sendFile(result.localPath);
    }).catch(err => {
      return res.status(404).json({ error: 'Cover art asset missing', message: err.message });
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed serving cover art', message: err.message });
  }
});

// ==========================================
// PLAYLIST ENDPOINTS
// ==========================================

// POST /api/creator/playlist - Create playlist
router.post('/playlist', rateLimiterMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description, ownerId, ownerName, isPublic, initialTrackIds } = req.body;
    if (!name || !ownerId) {
      return res.status(400).json({ error: 'name and ownerId required' });
    }

    const playlist = await PlaylistService.createPlaylist({
      name: sanitizeInput(name, 100),
      description: description ? sanitizeInput(description, 300) : undefined,
      ownerId: sanitizeInput(ownerId, 50),
      ownerName: ownerName ? sanitizeInput(ownerName, 50) : undefined,
      isPublic,
      initialTrackIds
    });

    return res.status(201).json({ status: 'SUCCESS', playlist });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed creating playlist', message: err.message });
  }
});

// GET /api/creator/playlist/:playlistId - Get playlist
router.get('/playlist/:playlistId', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const playlistId = sanitizeInput(req.params.playlistId, 50);
    const playlist = PlaylistService.getPlaylist(playlistId);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    return res.status(200).json({ status: 'SUCCESS', playlist });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed getting playlist', message: err.message });
  }
});

// GET /api/creator/playlists - List playlists
router.get('/playlists', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const ownerId = req.query.ownerId ? sanitizeInput(req.query.ownerId as string, 50) : undefined;
    const playlists = PlaylistService.listPlaylists(ownerId);
    return res.status(200).json({ status: 'SUCCESS', count: playlists.length, playlists });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed listing playlists', message: err.message });
  }
});

// POST /api/creator/playlist/:playlistId/tracks - Add track to playlist
router.post('/playlist/:playlistId/tracks', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const playlistId = sanitizeInput(req.params.playlistId, 50);
    const { publishingId } = req.body;
    if (!publishingId) {
      return res.status(400).json({ error: 'publishingId required' });
    }

    const playlist = PlaylistService.addTrackToPlaylist(playlistId, sanitizeInput(publishingId, 100));
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    return res.status(200).json({ status: 'SUCCESS', playlist });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed adding track to playlist', message: err.message });
  }
});

// ==========================================
// SOCIAL GRAPH ENDPOINTS
// ==========================================

// POST /api/creator/social/follow - Follow / Unfollow
router.post('/social/follow', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const { followerId, followingId } = req.body;
    if (!followerId || !followingId) {
      return res.status(400).json({ error: 'followerId and followingId required' });
    }

    const result = SocialGraphService.followArtist(sanitizeInput(followerId, 50), sanitizeInput(followingId, 50));
    return res.status(200).json({ status: 'SUCCESS', ...result });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed follow operation', message: err.message });
  }
});

// POST /api/creator/social/comment - Add comment
router.post('/social/comment', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const { publishingId, userId, userName, text } = req.body;
    if (!publishingId || !userId || !text) {
      return res.status(400).json({ error: 'publishingId, userId, and text required' });
    }

    const comment = SocialGraphService.addComment(
      sanitizeInput(publishingId, 100),
      sanitizeInput(userId, 50),
      userName ? sanitizeInput(userName, 50) : 'Creator User',
      sanitizeInput(text, 500)
    );

    return res.status(201).json({ status: 'SUCCESS', comment });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed posting comment', message: err.message });
  }
});

// GET /api/creator/social/comments/:publishingId - Get track comments
router.get('/social/comments/:publishingId', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const publishingId = sanitizeInput(req.params.publishingId, 100);
    const comments = SocialGraphService.getComments(publishingId);
    return res.status(200).json({ status: 'SUCCESS', count: comments.length, comments });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed getting comments', message: err.message });
  }
});

// GET /api/creator/social/feed - Social activity feed
router.get('/social/feed', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
    const feed = SocialGraphService.getFeed(limit);
    return res.status(200).json({ status: 'SUCCESS', count: feed.length, feed });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed getting feed', message: err.message });
  }
});

// ==========================================
// REMIX ENGINE ENDPOINTS
// ==========================================

// POST /api/creator/remix - Create remix record
router.post('/remix', rateLimiterMiddleware, async (req: Request, res: Response) => {
  try {
    const { originalProjectId, originalArtistId, remixProjectId, remixerArtistId, remixTitle, licenseType, originalArtistSplitPercent, stemsUsed } = req.body;
    if (!originalProjectId || !originalArtistId || !remixProjectId || !remixerArtistId || !remixTitle) {
      return res.status(400).json({ error: 'originalProjectId, originalArtistId, remixProjectId, remixerArtistId, and remixTitle required' });
    }

    const remix = await RemixEngineService.createRemixRecord({
      originalProjectId: sanitizeInput(originalProjectId, 100),
      originalArtistId: sanitizeInput(originalArtistId, 50),
      remixProjectId: sanitizeInput(remixProjectId, 100),
      remixerArtistId: sanitizeInput(remixerArtistId, 50),
      remixTitle: sanitizeInput(remixTitle, 100),
      licenseType,
      originalArtistSplitPercent,
      stemsUsed
    });

    return res.status(201).json({ status: 'SUCCESS', remix });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed creating remix record', message: err.message });
  }
});

// GET /api/creator/remix/:projectId - Get remix lineage
router.get('/remix/:projectId', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const projectId = sanitizeInput(req.params.projectId, 100);
    const lineage = RemixEngineService.getRemixLineage(projectId);
    return res.status(200).json({ status: 'SUCCESS', projectId, lineage });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed getting remix lineage', message: err.message });
  }
});

// ==========================================
// ANALYTICS & ROYALTIES ENDPOINTS
// ==========================================

// GET /api/creator/analytics/:artistId - Get analytics report
router.get('/analytics/:artistId', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const artistId = sanitizeInput(req.params.artistId, 50);
    const timeframe = (req.query.timeframe as any) || '30d';
    const report = ArtistAnalyticsService.getArtistAnalytics(artistId, timeframe);
    return res.status(200).json({ status: 'SUCCESS', report });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed getting analytics', message: err.message });
  }
});

// GET /api/creator/royalties/:artistId - Get royalty statement
router.get('/royalties/:artistId', rateLimiterMiddleware, (req: Request, res: Response) => {
  try {
    const artistId = sanitizeInput(req.params.artistId, 50);
    const statement = RoyaltyEngineService.getRoyaltyStatement(artistId);
    return res.status(200).json({ status: 'SUCCESS', statement });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed getting royalty statement', message: err.message });
  }
});

// POST /api/creator/royalties/payout - Process royalty payout
router.post('/royalties/payout', rateLimiterMiddleware, async (req: Request, res: Response) => {
  try {
    const { artistId, amountUsd } = req.body;
    if (!artistId) {
      return res.status(400).json({ error: 'artistId required' });
    }

    const payout = await RoyaltyEngineService.processPayout(sanitizeInput(artistId, 50), amountUsd);
    return res.status(200).json({ status: 'SUCCESS', payout });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed processing payout', message: err.message });
  }
});

export default router;
