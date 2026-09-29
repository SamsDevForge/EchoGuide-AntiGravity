import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { defaultPreferences, type Preferences, type Repository, type UserRecord } from '../src/repository.js';

// Explicit test double; production always uses PostgreSQL for accounts.
class TestRepository implements Repository {
  users = new Map<string, UserRecord>();
  preferences = new Map<string, Preferences>();
  async findUserByEmail(email: string) { return [...this.users.values()].find(user => user.email === email) ?? null; }
  async findUserById(id: string) { return this.users.get(id) ?? null; }
  async createUser(email: string, passwordHash: string) {
    const user = { id: randomUUID(), email, passwordHash };
    this.users.set(user.id, user);
    return user;
  }
  async getPreferences(userId: string) { return this.preferences.get(userId) ?? { ...defaultPreferences }; }
  async setPreferences(userId: string, value: Preferences) { this.preferences.set(userId, value); return value; }
}
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]).toString('base64');
const guestApp = () => createApp({ env: {}, disableRateLimit: true });

describe('guest API', () => {
  it('reports missing integrations without requiring a database', async () => {
    const response = await request(guestApp()).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', databaseConfigured: false, geminiConfigured: false });
  });
  it('returns actionable unavailable errors for missing credentials', async () => {
    const app = guestApp();
    expect((await request(app).post('/api/scene').send({ imageBase64: jpeg, mimeType: 'image/jpeg' })).status).toBe(503);
    const accounts = await request(app).post('/api/auth/register').send({ email: 'a@example.com', password: 'password123' });
    expect(accounts.status).toBe(503);
    expect(accounts.body.error).toContain('DATABASE_URL');
  });
  it('rejects invalid image encodings, image types, and untrusted instruction fields', async () => {
    const app = guestApp();
    for (const body of [
      { imageBase64: 'not-base64', mimeType: 'image/jpeg' },
      { imageBase64: Buffer.from('not jpeg').toString('base64'), mimeType: 'image/jpeg' },
      { imageBase64: jpeg, mimeType: 'image/png' },
      { imageBase64: jpeg, mimeType: 'image/jpeg', observations: [{ label: 'chair', confidence: 0.8, instruction: 'invent a distance' }] },
    ]) expect((await request(app).post('/api/scene').send(body)).status).toBe(400);
  });
  it('rejects images larger than 1 MiB and malformed JSON', async () => {
    const large = Buffer.alloc(1024 * 1024 + 1); large[0] = 0xff; large[1] = 0xd8; large[2] = 0xff;
    expect((await request(guestApp()).post('/api/scene').send({ imageBase64: large.toString('base64'), mimeType: 'image/jpeg' })).status).toBe(400);
    expect((await request(guestApp()).post('/api/scene').set('Content-Type', 'application/json').send('{broken')).status).toBe(400);
    expect((await request(guestApp()).post('/api/scene').send({ imageBase64: 'a'.repeat(1600 * 1024), mimeType: 'image/jpeg' })).status).toBe(413);
  });
  it('rate limits guest scene requests before contacting Gemini', async () => {
    const app = createApp({ env: {} });
    for (let index = 0; index < 12; index++) {
      expect((await request(app).post('/api/scene').send({ imageBase64: jpeg, mimeType: 'image/jpeg' })).status).toBe(503);
    }
    expect((await request(app).post('/api/scene').send({ imageBase64: jpeg, mimeType: 'image/jpeg' })).status).toBe(429);
  });
  it('sends JPEG only to the configured Gemini endpoint and returns a description', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ description: 'A chair is on the left.' }) }] } }] }), { status: 200 }));
    const app = createApp({ env: { GEMINI_API_KEY: 'test-key' }, fetcher, disableRateLimit: true });
    const response = await request(app).post('/api/scene').send({ imageBase64: jpeg, mimeType: 'image/jpeg', observations: [{ label: 'chair', confidence: 0.8, position: 'left' }] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ description: 'A chair is on the left.' });
    expect(fetcher.mock.calls[0][0]).toContain('gemini-2.5-flash:generateContent');
    const config = fetcher.mock.calls[0][1]!;
    expect(config.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': 'test-key' });
    expect(JSON.parse(config.body as string).contents[0].parts[1].inlineData.data).toBe(jpeg);
  });
  it('does not expose upstream responses or accept partial descriptions', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('secret upstream detail', { status: 403 }));
    const app = createApp({ env: { GEMINI_API_KEY: 'test-key' }, fetcher, disableRateLimit: true });
    const response = await request(app).post('/api/scene').send({ imageBase64: jpeg, mimeType: 'image/jpeg' });
    expect(response.status).toBe(502);
    expect(JSON.stringify(response.body)).not.toContain('secret upstream detail');
    fetcher.mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"description":"A chair"}' }] } }] }), { status: 200 }));
    expect((await request(app).post('/api/scene').send({ imageBase64: jpeg, mimeType: 'image/jpeg' })).status).toBe(502);
  });
});

describe('optional accounts', () => {
  it('refuses weak secrets when accounts are configured', () => {
    expect(() => createApp({ env: { DATABASE_URL: 'postgres://local', JWT_SECRET: 'weak' } })).toThrow('JWT_SECRET');
  });
  it('hashes passwords, authenticates, and isolates preferences by verified token subject', async () => {
    const repository = new TestRepository();
    const app = createApp({ repository, env: { JWT_SECRET: 'test-only-secret-that-is-longer-than-thirty-two-characters' }, disableRateLimit: true });
    const register = (email: string) => request(app).post('/api/auth/register').send({ email, password: 'securepass123' });
    const first = await register('FIRST@example.com');
    const second = await register('second@example.com');
    expect(first.status).toBe(201);
    expect(first.body.user.email).toBe('first@example.com');
    expect(repository.users.get(first.body.user.id)!.passwordHash).not.toBe('securepass123');
    expect((await register('first@example.com')).status).toBe(409);
    const login = await request(app).post('/api/auth/login').send({ email: 'first@example.com', password: 'securepass123' });
    expect(login.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'first@example.com', password: 'wrongpass' })).status).toBe(401);
    expect((await request(app).get('/api/preferences')).status).toBe(401);
    expect((await request(app).get('/api/preferences').set('Authorization', 'Bearer invalid')).status).toBe(401);
    const changed = { volume: 0.3, announcementIntervalMs: 9000, spatialMode: 'stereo' };
    expect((await request(app).put('/api/preferences').set('Authorization', `Bearer ${first.body.token}`).send(changed)).body).toEqual(changed);
    expect((await request(app).get('/api/preferences').set('Authorization', `Bearer ${second.body.token}`)).body).toEqual(defaultPreferences);
    expect((await request(app).put('/api/preferences').set('Authorization', `Bearer ${first.body.token}`).send({ ...changed, userId: second.body.user.id })).status).toBe(400);
    expect((await request(app).put('/api/preferences').set('Authorization', `Bearer ${first.body.token}`).send({ ...changed, volume: 2 })).status).toBe(400);
  }, 30_000);
});
