import { neon } from '@neondatabase/serverless';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ensureClubSchema } from '../api/_lib/clubs.ts';

// Read-only source. All migration writes run in an isolated, in-memory PostgreSQL instance.
const source=neon(process.env.DATABASE_URL!);
const accounts=await source`SELECT * FROM club_accounts ORDER BY id`;
const stores=await source`SELECT * FROM club_stores ORDER BY account_id,area`;
const db=new PGlite();
const sql=(async(parts:TemplateStringsArray,...values:unknown[]) => (await db.query(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows) as unknown as Parameters<typeof ensureClubSchema>[0];
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='club_id').sort().map(k=>[k,canonical(v[k])])):v;
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
try {
 await db.exec('CREATE TABLE club_accounts(id TEXT PRIMARY KEY,role TEXT,pin_hash TEXT,active BOOLEAN); CREATE TABLE club_stores(account_id TEXT REFERENCES club_accounts(id),area TEXT,data JSONB,updated_at TIMESTAMPTZ,PRIMARY KEY(account_id,area));');
 for(const a of accounts) await db.query('INSERT INTO club_accounts VALUES($1,$2,$3,$4)',[a.id,a.role,a.pin_hash,a.active]);
 for(const s of stores) await db.query('INSERT INTO club_stores VALUES($1,$2,$3,$4)',[s.account_id,s.area,JSON.stringify(s.data),s.updated_at]);
 await ensureClubSchema(sql);
 await ensureClubSchema(sql);
 const migrated=(await db.query<any>('SELECT * FROM club_stores ORDER BY account_id,area')).rows;
 assert.equal(migrated.length,stores.length);
 assert.equal(hash(migrated.map(s=>s.data)),hash(stores.map(s=>s.data)));
 assert.equal(hash((await db.query('SELECT id,role,pin_hash,active FROM club_accounts ORDER BY id')).rows),hash(accounts.map(a=>({id:a.id,role:a.role,pin_hash:a.pin_hash,active:a.active}))));
 assert.ok(migrated.every(s=>s.club_id==='ud-oliva'));
 console.log(JSON.stringify({result:'PASS',source:'read-only production snapshot',migrationTarget:'isolated in-memory PostgreSQL',accounts:accounts.length,stores:stores.length,areas:Object.fromEntries([...new Set(stores.map(s=>String(s.area)))].map(area=>[area,stores.filter(s=>s.area===area).length])),credentialsUnchanged:true,payloadsUnchangedExceptClubId:true,allStoresAssignedToOliva:true}));
} finally { await db.close() }
