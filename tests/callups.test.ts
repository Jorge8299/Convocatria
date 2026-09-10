import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {callupMigration} from '../api/_lib/callup-schema.ts';
import {createCallup,listCallups,publicCallup,respondCallup,closeCallup,deleteCallup} from '../api/_lib/callups.ts';
import {confirmationMessage,sortAttendancePlayers} from '../src/callups.ts';
test('WhatsApp preserves original content except private notice; numeric shirt sorting; trainer prompt',()=>{
 const text='*Partido: Club vs Rival*\nHora: 10\nSi alguien no puede venir, que avise por privado.\n¡Vamos equipo!';
 const result=confirmationMessage(text,'https://example.com/e/token');
 assert.ok(result.startsWith('*Partido: Club vs Rival*\nHora: 10\n¡Vamos equipo!'));
 assert.equal(result.includes('avise por privado'),false);
 assert.equal(confirmationMessage(result,'https://example.com/e/token'),result);
 const custom=confirmationMessage(text,'https://example.com/e/token','Para confirmar asistencia pulse aquí');
 assert.ok(custom.includes('✅ Para confirmar asistencia pulse aquí'));
 assert.ok(custom.endsWith('\nhttps://example.com/e/token'));
 assert.equal(confirmationMessage(custom,'https://example.com/e/token','Para confirmar asistencia pulse aquí'),custom);
 assert.deepEqual(sortAttendancePlayers([{dorsal:'10',nombre:'A'},{dorsal:'',nombre:'B'},{dorsal:'2',nombre:'C'}]).map(p=>p.dorsal),['2','10','']);
});
test('Postgres: additive migration, idempotent share, club boundaries, private reasons, manual-only close',async()=>{
 const db=new PGlite();
 const sql={query:async(text:string,values:unknown[]=[])=> (await db.query(text,values)).rows} as any;
 const owner={id:'coach',club_id:'club',role:'entrenador'} as const;
 const other={id:'other',club_id:'otherclub',role:'entrenador'} as const;
 try{
 await db.exec(`CREATE TABLE clubs(id text PRIMARY KEY,nombre text,logo text,color_principal text,activo boolean);
 CREATE TABLE club_accounts(id text PRIMARY KEY,club_id text,active boolean);
 CREATE TABLE club_stores(account_id text,club_id text,area text,data jsonb);
 INSERT INTO clubs VALUES('club','Club','/crest.png','#123456',true),('otherclub','Other','/crest.png','#123456',true);
 INSERT INTO club_accounts VALUES('coach','club',true),('other','otherclub',true);
 INSERT INTO club_stores VALUES('coach','club','agenda','[{"id":"event1","type":"match","date":"2020-09-01","startTime":"10:00","home":true,"rivalName":"Rival","field":"Campo"}]'),
 ('coach','club','team','{"players":[{"id":"p1","name":"Nombre Apellidos","number":"10","active":true},{"id":"p2","name":"Segundo Apellidos","number":"2","active":true},{"id":"p3","name":"Inactivo","number":"1","active":false}]}'),
 ('coach','club','journeys','[{"id":"legacy","message":"unchanged"}]');
 `);
 const before=(await db.query('SELECT * FROM club_stores')).rows;
 for(const query of callupMigration)await db.exec(query);
 for(const query of callupMigration)await db.exec(query);
 assert.deepEqual((await db.query('SELECT * FROM club_stores')).rows,before);
 const c=await createCallup(sql,owner,{eventId:'event1',message:'Mensaje original',prompt:'Para confirmar, pulsa aquí.'});
 assert.ok(c);assert.equal(c.closed,false); // Past match stays open until manual close.
 assert.equal(c.prompt,'Para confirmar, pulsa aquí.');
 assert.deepEqual(c.players.map(p=>p.dorsal),['2','10']);
 await respondCallup(sql,c.token,{jugador_id:'p1',estado:'NO',motivo:'Motivo privado'});
const publicResult=await publicCallup(sql,c.token);
  assert.deepEqual(publicResult.players.map(p=>p.nombre),['Segundo Apellidos','Nombre Apellidos']);
  assert.ok(!JSON.stringify(publicResult).includes('Motivo privado'));
  assert.ok(publicResult.players.every(p=>'estado' in p));assert.ok(!('motivo' in publicResult.players[0]));
  assert.equal(publicResult.players.find(p=>p.jugador_id==='p1')?.estado,'NO');
 assert.equal((await listCallups(sql,owner))[0].players.find(p=>p.jugador_id==='p1')?.motivo,'Motivo privado');
 const repeated=await createCallup(sql,owner,{eventId:'event1',message:'Actualizado',prompt:'Nuevo texto'});
 assert.equal(repeated.token,c.token);assert.equal(repeated.players.length,2);
 assert.deepEqual(repeated.players.map(p=>p.nombre),['Segundo Apellidos','Nombre Apellidos']);
 assert.equal(repeated.players.find(p=>p.jugador_id==='p1')?.estado,'NO');
 assert.equal(repeated.prompt,'Nuevo texto');
 assert.deepEqual(await listCallups(sql,other),[]);
 await assert.rejects(createCallup(sql,other,{eventId:'event1',message:'Intento'}));
 await assert.rejects(closeCallup(sql,other,c.id));
 await assert.rejects(respondCallup(sql,c.token,{jugador_id:'foreign',estado:'SI'}));
 await assert.rejects(respondCallup(sql,c.token,{jugador_id:'p1',estado:'BAD'}));
 await assert.rejects(respondCallup(sql,c.token,{jugador_id:'p1',estado:'NO',motivo:'x'.repeat(161)}));
await respondCallup(sql,c.token,{jugador_id:'p1',estado:'SI',motivo:'discard'});
  assert.equal((await listCallups(sql,owner))[0].players.find(p=>p.jugador_id==='p1')?.motivo,null);
await assert.rejects(deleteCallup(sql,owner,c.id)); // open callups cannot be deleted
  await closeCallup(sql,owner,c.id);
  assert.equal((await publicCallup(sql,c.token)).closed,true);
  await assert.rejects(respondCallup(sql,c.token,{jugador_id:'p1',estado:'SI'}));
  await assert.rejects(createCallup(sql,owner,{eventId:'event1',message:'No reopen'}));
  await deleteCallup(sql,owner,c.id);
  assert.deepEqual(await listCallups(sql,owner),[]);
  const fresh=await createCallup(sql,owner,{eventId:'event1',message:'Nueva convocatoria'});
  assert.notEqual(fresh.token,c.token);assert.equal(fresh.closed,false);
 await assert.rejects(publicCallup(sql,'bad'));
 assert.deepEqual((await db.query('SELECT * FROM club_stores')).rows,before);
 }finally{await db.close();}
});
test('Postgres: sharing works without a configured roster',async()=>{
 const db=new PGlite();
 const sql={query:async(text:string,values:unknown[]=[])=> (await db.query(text,values)).rows} as any;
 const owner={id:'coach',club_id:'club',role:'entrenador'} as const;
 try{
  await db.exec(`CREATE TABLE clubs(id text PRIMARY KEY,nombre text,logo text,color_principal text,activo boolean);
  CREATE TABLE club_accounts(id text PRIMARY KEY,club_id text,active boolean);
  CREATE TABLE club_stores(account_id text,club_id text,area text,data jsonb);
  INSERT INTO clubs VALUES('club','Club','/crest.png','#123456',true);
  INSERT INTO club_accounts VALUES('coach','club',true);
  INSERT INTO club_stores VALUES('coach','club','agenda','[{"id":"event1","type":"match","date":"2020-09-02","startTime":"12:00","home":true,"rivalName":"Rival","field":"Campo"}]');`);
  for(const query of callupMigration)await db.exec(query);
  const c=await createCallup(sql,owner,{eventId:'event1',message:'Sin plantilla aún'});
  assert.ok(c);assert.equal(c.closed,false);assert.deepEqual(c.players,[]);
  const c2=await createCallup(sql,owner,{eventId:'event1',message:'Sigue disponible'});
  assert.equal(c2.token,c.token);
 }finally{await db.close();}
});
