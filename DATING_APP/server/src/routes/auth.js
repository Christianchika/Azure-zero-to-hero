import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { JWT_SECRET } from '../middleware/authMiddleware.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  const {
    email,
    password,
    name,
    age,
    gender,
    target_gender,
    bio,
    intent,
    interests,
    latitude,
    longitude,
    location_name,
    photo_url
  } = req.body;

  if (!email || !password || !name || !age || !gender || !target_gender) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Mandatory Age Verification Gate
  if (Number(age) < 18) {
    return res.status(403).json({ error: 'You must be at least 18 years old to use this platform' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    db.run(
      `INSERT INTO users (email, password_hash, name, age, gender, target_gender, bio, intent, latitude, longitude, location_name, photo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email,
        password_hash,
        name,
        Number(age),
        gender,
        target_gender,
        bio || '',
        intent || 'pleasure',
        latitude || 0.0,
        longitude || 0.0,
        location_name || 'Nearby',
        photo_url || ''
      ],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already registered' });
          }
          return res.status(500).json({ error: err.message });
        }

        const userId = this.lastID;

        // Save interests if provided
        if (Array.isArray(interests) && interests.length > 0) {
          const stmt = db.prepare(`INSERT INTO user_interests (user_id, interest) VALUES (?, ?)`);
          interests.forEach(interest => {
            stmt.run(userId, interest);
          });
          stmt.finalize();
        }

        const token = jwt.sign({ userId, email, name }, JWT_SECRET, { expiresIn: '7d' });

        return res.status(201).json({
          message: 'User registered successfully',
          token,
          user: {
            id: userId,
            email,
            name,
            age: Number(age),
            gender,
            target_gender,
            bio: bio || '',
            intent: intent || 'pleasure',
            photo_url: photo_url || '',
            is_ghost_mode: 0
          }
        });
      }
    );
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Age enforcement double-check
    if (user.age < 18) {
      return res.status(403).json({ error: 'Access denied: Must be 18+' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    delete user.password_hash;
    return res.json({
      message: 'Logged in successfully',
      token,
      user
    });
  });
});

export default router;
