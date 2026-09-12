import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {matchWeek} from '../src/matchWeek.ts';
import {saveScheduledMatch} from '../api/_lib/match-scheduling.ts';

test('weeks span months and years, with Sunday included and invalid dates rejected', () => {
  assert.deepEqual(matchWeek('2027-01-03'), {start:'2026-12-28',end:'2027-01-03'});
  assert.deepEqual(matchWeek('2027-01-04'), {start:'2027-01-04',end:'2027-01-10'});
  assert.throws(()=>matchWeek('2026-02-30'));
});
test('Postgres prevents match/rest conflicts on create and edit, while preserving other weeks and training', async () => {
  const db = new PGlite();
  await db.exec("CREATE TABLE club_stores(account_id text,area text,data jsonb,updated_at timestamptz DEFAULT now(),UNIQUE(account_id,area))");
  const sql = (async(strings:TemplateStringsArray,...values:unknown[]) => (await db.query(strings.reduce((s,part,i)=>s+(i?'$'+i:'')+part,''),values)).rows) as any;
  const rest={id:'rest',type:'match',rest:true,date:'2026-09-12'};
  assert.equal(await saveScheduledMatch(sql,'team',rest),true);
  assert.equal(await saveScheduledMatch(sql,'team',{id:'match',type:'match',date:'2026-09-07'}),false);
  assert.equal(await saveScheduledMatch(sql,'team',{...rest,id:'rest2',date:'2026-09-13'}),false);
  assert.equal(await saveScheduledMatch(sql,'other',{id:'match',type:'match',date:'2026-09-12'}),true);
  assert.equal(await saveScheduledMatch(sql,'team',{id:'match',type:'match',date:'2026-09-14'}),true);
  assert.equal(await saveScheduledMatch(sql,'team',{id:'match',type:'match',date:'2026-09-13'},'match'),false);
  assert.equal(await saveScheduledMatch(sql,'team',{...rest,id:'rest3',date:'2026-09-14'}),false);
  await db.query("UPDATE club_stores SET data=data - 0 WHERE account_id='team'");
  assert.equal(await saveScheduledMatch(sql,'team',{id:'match',type:'match',date:'2026-09-13'},'match'),true);
  assert.equal(await saveScheduledMatch(sql,'team',{id:'missing',type:'match',date:'2026-09-21'},'missing'),false);
  await db.close();
});
