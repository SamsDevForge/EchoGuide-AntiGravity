import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Pool } from 'pg';
import { PostgresRepository, type Repository, type UserRecord } from './repository.js';
import { describeScene, sceneSchema, SceneServiceError } from './scene.js';

export interface AppOptions {
  env?: NodeJS.ProcessEnv;
  repository?: Repository;
  fetcher?: typeof fetch;
  disableRateLimit?: boolean;
}
const credentialsSchema = z.object({
  email: z.email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(8).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.'),
}).strict();
const preferencesSchema = z.object({
  volume: z.number().min(0).max(1),
  announcementIntervalMs: z.number().int().min(2000).max(15000),
  spatialMode: z.enum(['stereo', 'hrtf']),
}).strict();

export function createApp(options: AppOptions = {}) {
  const env = options.env ?? process.env;
  const databaseConfigured = Boolean(env.DATABASE_URL);
  const repository = options.repository ?? (databaseConfigured ? new PostgresRepository(new Pool({ connectionString: env.DATABASE_URL })) : undefined);
  const secret = env.JWT_SECRET ?? '';
  if (repository && (secret.length < 32 || /replace-with|change.?me|your.?secret/i.test(secret))) {
    throw new Error('JWT_SECRET must be a strong random secret of at least 32 characters when accounts are configured.');
  }
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json({ limit: '1500kb' }));
  const accountsRequired = (_req: Request, res: Response, next: NextFunction) => {
    if (!repository) { res.status(503).json({ error: 'Accounts are unavailable. Configure DATABASE_URL and JWT_SECRET on the server.' }); return; }
    next();
  };
  const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) { res.status(401).json({ error: 'Sign in to access saved preferences.' }); return; }
    let userId: string;
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'echoguide', audience: 'echoguide-client' });
      if (typeof payload === 'string' || typeof payload.sub !== 'string' || !z.uuid().safeParse(payload.sub).success) throw new Error();
      userId = payload.sub;
    } catch { res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' }); return; }
    try {
      const user = await repository!.findUserById(userId);
      if (!user) { res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' }); return; }
      res.locals.userId = user.id;
      next();
    } catch (error) { next(error); }
  };
  const session = (user: UserRecord) => ({
    token: jwt.sign({}, secret, { algorithm: 'HS256', subject: user.id, issuer: 'echoguide', audience: 'echoguide-client', expiresIn: '7d' }),
    user: { id: user.id, email: user.email },
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', databaseConfigured, geminiConfigured: Boolean(env.GEMINI_API_KEY) }));
  if (!options.disableRateLimit) app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Please try again later.' } }));
  app.post('/api/auth/register', accountsRequired, async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    if (await repository!.findUserByEmail(input.email)) { res.status(409).json({ error: 'An account with this email already exists.' }); return; }
    try { res.status(201).json(session(await repository!.createUser(input.email, await bcrypt.hash(input.password, 12)))); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') { res.status(409).json({ error: 'An account with this email already exists.' }); return; }
      throw error;
    }
  });
  // Use a fixed dummy hash so nonexistent accounts still perform password work.
  const dummyHash = repository ? bcrypt.hashSync('dummy-password-for-timing', 12) : '';
  app.post('/api/auth/login', accountsRequired, async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    const user = await repository!.findUserByEmail(input.email);
    const valid = await bcrypt.compare(input.password, user?.passwordHash ?? dummyHash);
    if (!user || !valid) { res.status(401).json({ error: 'Email or password is incorrect.' }); return; }
    res.json(session(user));
  });
  app.get('/api/preferences', accountsRequired, authenticate, async (_req, res) => res.json(await repository!.getPreferences(res.locals.userId)));
  app.put('/api/preferences', accountsRequired, authenticate, async (req, res) => res.json(await repository!.setPreferences(res.locals.userId, preferencesSchema.parse(req.body))));
  if (!options.disableRateLimit) app.use('/api/scene', rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many scene requests. Please wait a moment.' } }));
  app.post('/api/scene', async (req, res) => {
    const input = sceneSchema.parse(req.body);
    if (!env.GEMINI_API_KEY) { res.status(503).json({ error: 'Scene descriptions are unavailable. Configure GEMINI_API_KEY on the server.' }); return; }
    res.json({ description: await describeScene(input, env.GEMINI_API_KEY, env.GEMINI_MODEL ?? 'gemini-2.5-flash', options.fetcher) });
  });
  app.use((_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request.', details: error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) }); return; }
    if (error instanceof SceneServiceError) { res.status(error.status).json({ error: error.message }); return; }
    if (typeof error === 'object' && error !== null && 'type' in error) {
      if (error.type === 'entity.too.large') { res.status(413).json({ error: 'Request is too large. Use a JPEG of at most 1 MiB.' }); return; }
      if (error.type === 'entity.parse.failed') { res.status(400).json({ error: 'Request must contain valid JSON.' }); return; }
    }
    // Never log request bodies, image data, passwords, or upstream responses.
    res.status(503).json({ error: 'The server could not complete this request. Please try again.' });
  });
  return app;
}
