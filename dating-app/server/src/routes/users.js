import express from 'express';
import db from '../db.js';

const router = express.Router();

// Get current user profile
router.get('/me', (req, res) => {
  const userId = req.user.userId;

  db.get(`SELECT id, email, name, age, gender, target_gender, bio, intent, latitude, longitude, location_name, is_ghost_mode, photo_url, created_at FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.all(`SELECT interest FROM user_interests WHERE user_id = ?`, [userId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      user.interests = rows ? rows.map(r => r.interest) : [];
      res.json(user);
    });
  });
});

// Update profile & privacy settings (e.g., Ghost Mode)
router.put('/me', (req, res) => {
  const userId = req.user.userId;
  const { name, bio, intent, target_gender, latitude, longitude, location_name, is_ghost_mode, photo_url, interests } = req.body;

  db.run(
    `UPDATE users SET
      name = COALESCE(?, name),
      bio = COALESCE(?, bio),
      intent = COALESCE(?, intent),
      target_gender = COALESCE(?, target_gender),
      latitude = COALESCE(?, latitude),
      longitude = COALESCE(?, longitude),
      location_name = COALESCE(?, location_name),
      is_ghost_mode = COALESCE(?, is_ghost_mode),
      photo_url = COALESCE(?, photo_url)
     WHERE id = ?`,
    [name, bio, intent, target_gender, latitude, longitude, location_name, is_ghost_mode, photo_url, userId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      if (Array.isArray(interests)) {
        db.run(`DELETE FROM user_interests WHERE user_id = ?`, [userId], (err) => {
          if (!err && interests.length > 0) {
            const stmt = db.prepare(`INSERT INTO user_interests (user_id, interest) VALUES (?, ?)`);
            interests.forEach(interest => stmt.run(userId, interest));
            stmt.finalize();
          }
        });
      }

      res.json({ message: 'Profile updated successfully' });
    }
  );
});

// Safety: Report user
router.post('/report', (req, res) => {
  const reporterId = req.user.userId;
  const { reportedId, reason } = req.body;

  if (!reportedId || !reason) {
    return res.status(400).json({ error: 'Reported user ID and reason are required' });
  }

  db.run(
    `INSERT INTO user_reports (reporter_id, reported_id, reason) VALUES (?, ?, ?)`,
    [reporterId, reportedId, reason],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'User reported successfully' });
    }
  );
});

// Safety: Block user
router.post('/block', (req, res) => {
  const blockerId = req.user.userId;
  const { blockedId } = req.body;

  if (!blockedId) {
    return res.status(400).json({ error: 'Blocked user ID is required' });
  }

  db.run(
    `INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)`,
    [blockerId, blockedId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'User blocked successfully' });
    }
  );
});

export default router;
