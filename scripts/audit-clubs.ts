import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const sql=neon(process.env.DATABASE_URL!);
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='club_id').sort().map(k=>[k,canonical(v[k])])):v;
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const accounts=await sql`SELECT * FROM club_accounts ORDER BY id`;
const stores=await sql`SELECT * FROM club_stores ORDER BY account_id,area`;
const result={accounts:accounts.length,stores:stores.length,accountsDigest:digest(accounts),storesDigest:digest(stores.map(s=>({account_id:s.account_id,area:s.area,data:s.data}))),teams:stores.filter(s=>s.area==='team').length,players:stores.filter(s=>s.area==='team').reduce((n,s)=>n+(Array.isArray(s.data?.players)?s.data.players.length:0),0)};
const path=new URL('../.vercel/club-migration-baseline.json',import.meta.url);
if(process.argv.includes('--baseline')) { await writeFile(path,JSON.stringify(result)); console.log(JSON.stringify({baselineSaved:true,accounts:result.accounts,stores:result.stores,teams:result.teams,players:result.players})); }
else {
 const baseline=JSON.parse(await readFile(path,'utf8'));
 assert.deepEqual(result,baseline,'Data or credentials changed since baseline; review before considering migration verified.');
 assert.ok(accounts.every(a=>a.role==='superadmin'?a.club_id===null:a.club_id==='ud-oliva'));
 assert.ok(stores.every(s=>s.club_id==='ud-oliva'));
 const clubs=await sql`SELECT id,nombre,slug,activo FROM clubs`;
 assert.ok(clubs.some(c=>c.id==='ud-oliva'&&c.activo));
 console.log(JSON.stringify({verified:true,accounts:result.accounts,stores:result.stores,teams:result.teams,players:result.players,credentialsUnchanged:true,allPayloadsPreserved:true,assignedToOliva:true,clubs}));
}
