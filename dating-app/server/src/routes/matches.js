import express from 'express';
import db from '../db.js';

const router = express.Router();

// Get discovery profiles (candidates for swipe/matching)
router.get('/discovery', (req, res) => {
  const userId = req.user.userId;

  // Get logged in user details first
  db.get(`SELECT gender, target_gender, latitude, longitude FROM users WHERE id = ?`, [userId], (err, currentUser) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    // Exclude users already liked/passed, blocked users, users in ghost mode, and users not matching gender intent
    const query = `
      SELECT u.id, u.name, u.age, u.gender, u.target_gender, u.bio, u.intent, u.location_name, u.photo_url
      FROM users u
      WHERE u.id != ?
        AND u.is_ghost_mode = 0
        AND (? = 'everyone' OR u.gender = ?)
        AND (u.target_gender = 'everyone' OR u.target_gender = ?)
        AND u.id NOT IN (SELECT target_user_id FROM likes WHERE user_id = ?)
        AND u.id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = ?)
        AND u.id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_id = ?)
      LIMIT 20
    `;

    db.all(
      query,
      [userId, currentUser.target_gender, currentUser.target_gender, currentUser.gender, userId, userId, userId],
      (err, candidates) => {
        if (err) return res.status(500).json({ error: err.message });

        // Attach interests for each candidate
        if (candidates.length === 0) return res.json([]);

        let completed = 0;
        candidates.forEach(candidate => {
          db.all(`SELECT interest FROM user_interests WHERE user_id = ?`, [candidate.id], (err, rows) => {
            candidate.interests = rows ? rows.map(r => r.interest) : [];
            completed++;
            if (completed === candidates.length) {
              res.json(candidates);
            }
          });
        });
      }
    );
  });
});

// Swipe action (like or pass)
router.post('/swipe', (req, res) => {
  const userId = req.user.userId;
  const { targetUserId, type } = req.body; // type: 'like' | 'pass'

  if (!targetUserId || !['like', 'pass'].includes(type)) {
    return res.status(400).json({ error: 'Invalid swipe parameters' });
  }

  db.run(
    `INSERT OR REPLACE INTO likes (user_id, target_user_id, type) VALUES (?, ?, ?)`,
    [userId, targetUserId, type],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      if (type === 'pass') {
        return res.json({ isMatch: false });
      }

      // Check for mutual like
      db.get(
        `SELECT id FROM likes WHERE user_id = ? AND target_user_id = ? AND type = 'like'`,
        [targetUserId, userId],
        (err, reciprocalLike) => {
          if (err) return res.status(500).json({ error: err.message });

          if (reciprocalLike) {
            // It's a match!
            const u1 = Math.min(userId, targetUserId);
            const u2 = Math.max(userId, targetUserId);

            db.run(
              `INSERT OR IGNORE INTO matches (user1_id, user2_id) VALUES (?, ?)`,
              [u1, u2],
              function (err) {
                if (err) return res.status(500).json({ error: err.message });

                // Fetch matched user details for popup
                db.get(
                  `SELECT id, name, photo_url, bio FROM users WHERE id = ?`,
                  [targetUserId],
                  (err, matchedUser) => {
                    return res.json({
                      isMatch: true,
                      matchId: this.lastID || null,
                      matchedUser
                    });
                  }
                );
              }
            );
          } else {
            return res.json({ isMatch: false });
          }
        }
      );
    }
  );
});

// Get user's active matches
router.get('/', (req, res) => {
  const userId = req.user.userId;

  const query = `
    SELECT
      m.id as match_id,
      m.created_at as matched_at,
      u.id as user_id,
      u.name,
      u.photo_url,
      u.bio,
      (SELECT content FROM messages WHERE match_id = m.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages WHERE match_id = m.id ORDER BY created_at DESC LIMIT 1) as last_message_at
    FROM matches m
    JOIN users u ON (u.id = CASE WHEN m.user1_id = ? THEN m.user2_id ELSE m.user1_id END)
    WHERE (m.user1_id = ? OR m.user2_id = ?)
      AND u.id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = ?)
      AND u.id NOT IN (SELECT blocker_id FROM user_blocks WHERE blocked_id = ?)
    ORDER BY COALESCE(last_message_at, matched_at) DESC
  `;

  db.all(query, [userId, userId, userId, userId, userId], (err, matches) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(matches);
  });
});

export default router;
