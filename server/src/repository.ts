import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export interface UserRecord { id: string; email: string; passwordHash: string }
export interface Preferences { volume: number; announcementIntervalMs: number; spatialMode: 'stereo' | 'hrtf' }
export const defaultPreferences: Preferences = { volume: 0.7, announcementIntervalMs: 5000, spatialMode: 'hrtf' };
export interface Repository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(email: string, passwordHash: string): Promise<UserRecord>;
  getPreferences(userId: string): Promise<Preferences>;
  setPreferences(userId: string, value: Preferences): Promise<Preferences>;
}

export class PostgresRepository implements Repository {
  constructor(readonly pool: Pool) {}
  async findUserByEmail(email: string) {
    const result = await this.pool.query('SELECT id, email, password_hash AS "passwordHash" FROM users WHERE email = $1', [email]);
    return (result.rows[0] as UserRecord | undefined) ?? null;
  }
  async findUserById(id: string) {
    const result = await this.pool.query('SELECT id, email, password_hash AS "passwordHash" FROM users WHERE id = $1', [id]);
    return (result.rows[0] as UserRecord | undefined) ?? null;
  }
  async createUser(email: string, passwordHash: string) {
    const result = await this.pool.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email, password_hash AS "passwordHash"', [randomUUID(), email, passwordHash]);
    return result.rows[0] as UserRecord;
  }
  async getPreferences(userId: string): Promise<Preferences> {
    const result = await this.pool.query('SELECT volume, announcement_interval_ms AS "announcementIntervalMs", spatial_mode AS "spatialMode" FROM preferences WHERE user_id = $1', [userId]);
    return (result.rows[0] as Preferences | undefined) ?? { ...defaultPreferences };
  }
  async setPreferences(userId: string, value: Preferences): Promise<Preferences> {
    const result = await this.pool.query(`INSERT INTO preferences (user_id, volume, announcement_interval_ms, spatial_mode)
      VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET volume = EXCLUDED.volume,
      announcement_interval_ms = EXCLUDED.announcement_interval_ms, spatial_mode = EXCLUDED.spatial_mode
      RETURNING volume, announcement_interval_ms AS "announcementIntervalMs", spatial_mode AS "spatialMode"`,
    [userId, value.volume, value.announcementIntervalMs, value.spatialMode]);
    return result.rows[0] as Preferences;
  }
}
