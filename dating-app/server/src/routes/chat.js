import express from 'express';
import db from '../db.js';

const router = express.Router();

// Get message history for a match
router.get('/history/:matchId', (req, res) => {
  const userId = req.user.userId;
  const matchId = req.params.matchId;

  // Ensure user belongs to this match
  db.get(
    `SELECT id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)`,
    [matchId, userId, userId],
    (err, match) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!match) return res.status(403).json({ error: 'Access denied to this match history' });

      db.all(
        `SELECT id, match_id, sender_id, recipient_id, content, created_at FROM messages WHERE match_id = ? ORDER BY created_at ASC`,
        [matchId],
        (err, messages) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json(messages);
        }
      );
    }
  );
});

export default router;
