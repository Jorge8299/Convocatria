import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { classifyBirth, defaultCategories, validateCampaign, validateRegistration } from '../src/enrollment.ts';
import { verifyStripeEvent, confirmPayment, providerStatus } from '../api/_lib/enrollment-payments.ts';
import { ensureEnrollmentSchema } from '../api/_lib/enrollment-schema.ts';
import { assignEnrollment } from '../api/_lib/enrollment-api.ts';

test('category boundaries, invalid births and campaign validation',()=>{
  const categories=defaultCategories(2026);
  assert.equal(classifyBirth('2019-12-31',categories),'prebenjamin');
  assert.equal(classifyBirth('2018-01-01',categories),'benjamin');
  assert.equal(classifyBirth('2016-12-31',categories),'alevin');
  assert.equal(classifyBirth('2018-02-30',categories),null);
  assert.equal(classifyBirth('2000-01-01',categories),null);
  const campaign={name:'Temporada',year:2026,total:34000,parts:[{date:'2026-09-01',amount:17000},{date:'2026-10-01',amount:17000}],categories,terms:'Condiciones de inscripción y contacto del club para los datos.'};
  validateCampaign(campaign);
  assert.throws(()=>validateCampaign({...campaign,total:33000}),/sumar/);
  assert.throws(()=>validateCampaign({...campaign,categories:categories.map((r,i)=>i===1?{...r,from:2016}:r)}),/solaparse/);
  const registration={child_name:'Jugador de prueba',birth_date:'2018-01-01',guardian_name:'Tutor de prueba',email:'tutor@example.test',phone:'+34 600000000',consent:true,mode:'parts'};
  assert.equal(validateRegistration(registration,categories),'benjamin');
  assert.throws(()=>validateRegistration({...registration,consent:false},categories));
  assert.throws(()=>validateRegistration({...registration,email:'invalid'},categories));
  assert.equal(providerStatus('unconfigured-test-club').ready,false);
});

test('payment signatures reject tampering, stale events and malformed headers',()=>{
  const raw=Buffer.from('{"type":"checkout.session.completed"}');const timestamp='1800000000';
  const signature=createHmac('sha256','test-secret').update(`${timestamp}.`).update(raw).digest('hex');
  assert.equal(verifyStripeEvent(raw,`t=${timestamp},v1=${signature}`,'test-secret',1800000000000).type,'checkout.session.completed');
  assert.throws(()=>verifyStripeEvent(Buffer.from('{}'),`t=${timestamp},v1=${signature}`,'test-secret',1800000000000));
  assert.throws(()=>verifyStripeEvent(raw,`t=${timestamp},v1=${signature}`,'test-secret',1800000400000));
  assert.throws(()=>verifyStripeEvent(raw,`t=${timestamp},v1=bad`,'test-secret',1800000000000));
});

test('PostgreSQL: verified first payment activates registration; assignment preserves players and club boundaries',async()=>{
  const db=new PGlite();
  const client=(parts:TemplateStringsArray,...values:unknown[])=>{
    const query=parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,'');
    return {query,values,then:(resolve:any,reject:any)=>db.query(query,values).then(result=>result.rows).then(resolve,reject)};
  };
  const sql=Object.assign(client,{transaction:(queries:ReturnType<typeof client>[])=>db.transaction(async tx=>{const results=[];for(const q of queries)results.push((await tx.query(q.query,q.values)).rows);return results})}) as unknown as Parameters<typeof ensureEnrollmentSchema>[0];
  try{
    await db.exec(`CREATE TABLE clubs(id TEXT PRIMARY KEY,nombre TEXT);
      CREATE TABLE club_accounts(id TEXT PRIMARY KEY,club_id TEXT REFERENCES clubs(id),name TEXT,team_label TEXT,football_stage TEXT,role TEXT,active BOOLEAN);
      CREATE TABLE club_stores(account_id TEXT REFERENCES club_accounts(id),club_id TEXT REFERENCES clubs(id),area TEXT,data JSONB,updated_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(account_id,area));
      INSERT INTO clubs VALUES('club','Club'),('other','Other');
      INSERT INTO club_accounts VALUES('coach','club','Coach','Benjamín','benjamin','entrenador',TRUE),('wrong','other','Other','Other','benjamin','entrenador',TRUE),('young','club','Young','Prebenjamín','prebenjamin','entrenador',TRUE);
      INSERT INTO club_stores VALUES('coach','club','team','{"name":"Existing team","season":"2026","players":[{"id":"existing","name":"Existing"}]}',NOW());`);
    await ensureEnrollmentSchema(sql);await ensureEnrollmentSchema(sql);
    await db.exec(`INSERT INTO enrollment_campaigns(id,club_id,name,season_year,total_cents,parts,categories,terms) VALUES('campaign','club','Season',2026,34000,'[]','[]','terms');
      INSERT INTO enrollments(id,club_id,campaign_id,child_name,birth_date,category,guardian_name,email,phone,payment_mode,terms_snapshot,duplicate_key) VALUES('child','club','campaign','New player','2018-01-01','benjamin','Guardian','test@example.test','600000000','parts','terms','unique');
      INSERT INTO enrollment_dues(id,enrollment_id,ordinal,amount_cents,due_date,token,stripe_session,stripe_account,receipt_sent_at) VALUES('first','child',1,17000,'2026-09-01','token1','cs_first','acct_club',NOW()),('second','child',2,17000,'2026-10-01','token2','cs_second','acct_club',NOW());`);
    await assert.rejects(assignEnrollment('club','child','coach',sql),/pagada/);
    const event={id:'cs_first',mode:'payment',payment_status:'paid',currency:'eur',amount_total:17000,metadata:{due_id:'first'}};
    await confirmPayment({...event,amount_total:1},'acct_club',sql);
    await confirmPayment(event,'acct_wrong',sql);
    await confirmPayment({...event,payment_status:'unpaid'},'acct_club',sql);
    assert.equal((await db.query<any>("SELECT confirmed_at FROM enrollments WHERE id='child'")).rows[0].confirmed_at,null);
    await confirmPayment({...event,id:'cs_second',metadata:{due_id:'second'}},'acct_club',sql);
    assert.equal((await db.query<any>("SELECT confirmed_at FROM enrollments WHERE id='child'")).rows[0].confirmed_at,null);
    await confirmPayment(event,'acct_club',sql);await confirmPayment(event,'acct_club',sql);
    assert.ok((await db.query<any>("SELECT confirmed_at FROM enrollments WHERE id='child'")).rows[0].confirmed_at);
    await assert.rejects(assignEnrollment('other','child','wrong',sql));
    await assert.rejects(assignEnrollment('club','child','wrong',sql));
    await assert.rejects(assignEnrollment('club','child','young',sql),/categoría/);
    await assignEnrollment('club','child','coach',sql);
    await assert.rejects(assignEnrollment('club','child','coach',sql));
    const team=(await db.query<any>("SELECT data FROM club_stores WHERE account_id='coach'")).rows[0].data;
    assert.equal(team.name,'Existing team');assert.equal(team.players.length,2);assert.equal(team.players[0].id,'existing');assert.equal(team.players[1].id,'child');
    assert.equal(team.players[1].ownerCoachId,'coach');assert.equal(team.players[1].birthDate,'2018-01-01');
    await db.exec("DELETE FROM club_stores; DELETE FROM club_accounts; DELETE FROM clubs WHERE id='club'");
    assert.equal((await db.query('SELECT * FROM enrollments')).rows.length,0);assert.equal((await db.query('SELECT * FROM enrollment_dues')).rows.length,0);
  }finally{await db.close()}
});
