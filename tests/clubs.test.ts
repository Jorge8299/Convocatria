import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { ensureClubSchema } from '../api/_lib/clubs.ts';
import { validClubEdit } from '../src/clubs.ts';
import { accessibleAccounts, accessibleStores } from '../api/_lib/club-access.ts';

test('additive migration preserves accounts, credentials, teams and every store; isolation rejects foreign owners', async()=>{
 const db=new PGlite();
 const sql=(async(strings:TemplateStringsArray,...values:unknown[])=>{
   return (await db.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows;
 }) as unknown as Parameters<typeof ensureClubSchema>[0];
 try {
  await db.exec(`CREATE TABLE club_accounts(id TEXT PRIMARY KEY,role TEXT NOT NULL,pin_hash TEXT,active BOOLEAN);
   CREATE TABLE club_stores(account_id TEXT REFERENCES club_accounts(id),area TEXT,data JSONB,updated_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(account_id,area));
   ALTER TABLE club_accounts ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
   INSERT INTO club_accounts(id,role,pin_hash,active) VALUES('admin','admin','unchanged',true),('coach','entrenador','unchanged2',true),('coord','coordinador','unchanged3',true),('global','superadmin','unchanged4',true);
   INSERT INTO club_stores VALUES('coach','team','{"name":"UD Oliva","players":[{"id":"p1","name":"Player","ownerCoachId":"coach"}]}',NOW()),('coach','agenda','[{"id":"match1","type":"match"},{"id":"training1","type":"training"}]',NOW()),('coach','rivals','[{"id":"r1","nombre":"Rival"}]',NOW()),('coach','stats','[{"id":"stat1","ourScore":2}]',NOW()),('coach','boards','{"tacticalById":{"b1":{"id":"b1","elements":[]}}}',NOW()),('coach','journeys','[{"id":"j1","message":"unchanged"}]',NOW());`);
  const before=(await db.query('SELECT id,role,pin_hash,active FROM club_accounts ORDER BY id')).rows;
  const payloads=(await db.query('SELECT * FROM club_stores ORDER BY area')).rows;
  await ensureClubSchema(sql);
  await ensureClubSchema(sql);
  assert.deepEqual((await db.query('SELECT id,role,pin_hash,active FROM club_accounts ORDER BY id')).rows,before);
  assert.equal((await db.query("SELECT * FROM club_accounts WHERE role<>'superadmin' AND club_id='ud-oliva'")).rows.length,3);
  assert.equal((await db.query("SELECT * FROM club_accounts WHERE role='superadmin' AND club_id IS NULL")).rows.length,1);
  const strip=(v:any):any=>Array.isArray(v)?v.map(strip):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='club_id').map(([k,x])=>[k,strip(x)])):v;
  const after=(await db.query('SELECT * FROM club_stores ORDER BY area')).rows;
  assert.deepEqual(after.map((r:any)=>strip(r.data)),payloads.map((r:any)=>r.data));
  assert.ok(after.every((r:any)=>r.club_id==='ud-oliva'));
  assert.equal((await db.query('SELECT * FROM club_fields')).rows.length,3);
  await db.exec("INSERT INTO clubs(id,nombre,slug,logo,color_principal) VALUES('second','Second','second','/logo.png','#123456'); INSERT INTO club_accounts(id,role,club_id) VALUES('other','entrenador','second');");
  await assert.rejects(db.exec("INSERT INTO club_stores(account_id,area,data) VALUES('other','team','{\"players\":[{\"id\":\"p2\",\"ownerCoachId\":\"coach\"}]}')"),/Cross-club player owner/);
  await assert.rejects(db.exec("INSERT INTO club_stores(account_id,club_id,area,data) VALUES('other','ud-oliva','team','{}')"),/Cross-club store/);
  await assert.rejects(db.exec("INSERT INTO club_stores(account_id,area,data) VALUES('other','team','{\"players\":[{\"id\":\"p1\"}]}')"),/Cross-club player identity/);
  await assert.rejects(db.exec("INSERT INTO club_stores(account_id,area,data) VALUES('other','stats','[{\"id\":\"s2\",\"players\":[{\"playerId\":\"p1\"}]}]')"),/Cross-club player reference/);
  await db.exec("INSERT INTO club_stores(account_id,area,data) VALUES('other','team','{\"players\":[{\"id\":\"p2\"}]}')");
  assert.equal((await db.query<{data:any}>("SELECT data FROM club_stores WHERE account_id='other'")).rows[0].data.players[0].club_id,'second');
  for(const role of ['admin','coordinador','entrenador'] as const) {
    const session={id:'coach',role,club_id:'ud-oliva'};
    assert.ok((await accessibleAccounts(session,sql)).every(a=>a.club_id==='ud-oliva'));
    assert.ok((await accessibleStores(session,sql)).every(s=>s.club_id==='ud-oliva'));
  }
  assert.ok((await accessibleStores({id:'global',role:'superadmin',club_id:null},sql)).some(s=>s.club_id==='second'));
  assert.ok((await accessibleAccounts({role:'superadmin',club_id:null},sql)).some(a=>a.id==='other'));
  await db.exec("UPDATE clubs SET nombre='UD Oliva actualizado' WHERE id='ud-oliva'");
  await ensureClubSchema(sql);
  assert.equal((await db.query<{nombre:string}>("SELECT nombre FROM clubs WHERE id='ud-oliva'")).rows[0].nombre,'UD Oliva actualizado');
 } finally { await db.close() }
});
test('club editing validates supported logos and one primary colour',()=>{
 assert.equal(validClubEdit({nombre:'UD Oliva',logo:'/escudo-ud-oliva.jpg',color_principal:'#0b2344'}),true);
 assert.equal(validClubEdit({nombre:'UD Oliva',logo:'javascript:alert(1)',color_principal:'#0b2344'}),false);
});
