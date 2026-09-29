import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to migrate the database.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const sql = await readFile(new URL('../sql/001_init.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('EchoGuide database schema initialized.');
} finally { await pool.end(); }
