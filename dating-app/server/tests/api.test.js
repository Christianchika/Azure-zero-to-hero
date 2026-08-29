import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import db from '../src/db.js';
import authRoutes from '../src/routes/auth.js';
import userRoutes from '../src/routes/users.js';
import matchRoutes from '../src/routes/matches.js';
import { authenticateToken } from '../src/middleware/authMiddleware.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/matches', authenticateToken, matchRoutes);

test('Auth & Safety Tests', async (t) => {
  let femaleToken = '';
  let femaleId = null;
  let maleToken = '';
  let maleId = null;

  await t.test('Registration rejects under 18 users', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'underage@test.com',
        password: 'password123',
        name: 'Underage User',
        age: 17,
        gender: 'female',
        target_gender: 'male'
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'You must be at least 18 years old to use this platform');
  });

  await t.test('Registration succeeds for adult female user', async () => {
    const email = `alice_${Date.now()}@test.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'password123',
        name: 'Alice',
        age: 24,
        gender: 'female',
        target_gender: 'male',
        intent: 'pleasure & fun'
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    femaleToken = res.body.token;
    femaleId = res.body.user.id;
  });

  await t.test('Registration succeeds for adult male user', async () => {
    const email = `bob_${Date.now()}@test.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'password123',
        name: 'Bob',
        age: 27,
        gender: 'male',
        target_gender: 'female',
        intent: 'pleasure'
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    maleToken = res.body.token;
    maleId = res.body.user.id;
  });

  await t.test('Discovery returns matching potential profiles', async () => {
    const res = await request(app)
      .get('/api/matches/discovery')
      .set('Authorization', `Bearer ${femaleToken}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const foundBob = res.body.find(u => u.id === maleId);
    assert.ok(foundBob);
    assert.equal(foundBob.name, 'Bob');
  });

  await t.test('Swiping like creates a match when mutual', async () => {
    // Alice likes Bob
    const res1 = await request(app)
      .post('/api/matches/swipe')
      .set('Authorization', `Bearer ${femaleToken}`)
      .send({ targetUserId: maleId, type: 'like' });

    assert.equal(res1.status, 200);
    assert.equal(res1.body.isMatch, false);

    // Bob likes Alice (Mutual match!)
    const res2 = await request(app)
      .post('/api/matches/swipe')
      .set('Authorization', `Bearer ${maleToken}`)
      .send({ targetUserId: femaleId, type: 'like' });

    assert.equal(res2.status, 200);
    assert.equal(res2.body.isMatch, true);
    assert.ok(res2.body.matchedUser);
    assert.equal(res2.body.matchedUser.name, 'Alice');
  });

  await t.test('User privacy & ghost mode', async () => {
    // Enable Ghost Mode for Bob
    const updateRes = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${maleToken}`)
      .send({ is_ghost_mode: 1 });

    assert.equal(updateRes.status, 200);

    // Verify Bob does not appear in discovery for new users
    const registerCharlie = await request(app)
      .post('/api/auth/register')
      .send({
        email: `charlie_${Date.now()}@test.com`,
        password: 'password123',
        name: 'Charlie',
        age: 22,
        gender: 'female',
        target_gender: 'male'
      });

    const charlieToken = registerCharlie.body.token;

    const discoveryRes = await request(app)
      .get('/api/matches/discovery')
      .set('Authorization', `Bearer ${charlieToken}`);

    assert.equal(discoveryRes.status, 200);
    const foundBob = discoveryRes.body.find(u => u.id === maleId);
    assert.equal(foundBob, undefined);
  });

  await t.test('Blocking a user removes them from matches', async () => {
    const blockRes = await request(app)
      .post('/api/users/block')
      .set('Authorization', `Bearer ${femaleToken}`)
      .send({ blockedId: maleId });

    assert.equal(blockRes.status, 200);

    const matchesRes = await request(app)
      .get('/api/matches')
      .set('Authorization', `Bearer ${femaleToken}`);

    assert.equal(matchesRes.status, 200);
    assert.equal(matchesRes.body.length, 0);
  });
});
