import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { canEditBoardDevice, createBoard, createElement, duplicateElement, moveElement, prepareBoard, validBoard } from '../src/tactical/model.ts';
import { saveLegacyBoards, saveTacticalBoard } from '../api/_lib/tactical-store.ts';

const owner = { id: 'coach-a', name: 'Entrenador A', teamLabel: 'Benjamín A', footballStage: 'benjamin' };
test('positions, duplicates, locked pieces and invalid documents', () => {
  const piece = createElement('home-player', 0);
  const moved = moveElement([piece], piece.id, -30, 120)[0];
  assert.equal(moved.x, 3); assert.equal(moved.y, 97);
  assert.equal(piece.x, 45);
  const locked = { ...piece, locked: true };
  assert.deepEqual(moveElement([locked], piece.id, 10, 10), [locked]);
  const copy = duplicateElement(locked);
  assert.notEqual(copy.id, piece.id); assert.equal(copy.locked, false);
  const board = prepareBoard({ ...createBoard(owner, 'Team'), elements: [piece, createElement('ball', 1)] });
  assert.equal(validBoard(board), true); assert.equal(board.playerCount, 1); assert.deepEqual(board.materials, ['Balón']);
  assert.equal(validBoard({ ...board, elements: [piece, piece] }), false);
  assert.equal(validBoard({ ...board, elements: [{ ...piece, x: NaN }] }), false);
  assert.equal(validBoard({ ...board, name: ' ' }), false);
});
test('desktop and tablets edit; phones cannot edit in either orientation', () => {
  for (const [width,height] of [[1440,900],[1024,768],[768,1024]]) assert.equal(canEditBoardDevice({phone:false,width,height,coarse:width!==1440}),true);
  for (const [width,height] of [[390,844],[844,390],[932,430]]) assert.equal(canEditBoardDevice({phone:true,width,height,coarse:true}),false);
  assert.equal(canEditBoardDevice({phone:false,width:900,height:430,coarse:true}),false);
});
test('PostgreSQL persistence preserves siblings and legacy data, rejects stale revisions, isolates accounts', async () => {
  const db = new PGlite();
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((result, part, index) => result + (index ? `$${index}` : '') + part, '');
    return (await db.query(query, values)).rows;
  }) as unknown as Parameters<typeof saveTacticalBoard>[3];
  try {
    await db.exec("CREATE TABLE club_stores(account_id TEXT,area TEXT,data JSONB,updated_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(account_id,area)); INSERT INTO club_stores VALUES('coach-a','boards','{\"lineups\":[{\"id\":\"legacy\"}]}',NOW());");
    const first = createBoard(owner, 'Team');
    first.elements = [createElement('home-player', 0)];
    const saved = await saveTacticalBoard(owner.id, owner.name, first, sql);
    assert.equal(saved?.revision, 1);
    assert.equal(await saveTacticalBoard(owner.id, owner.name, first, sql), null);
    const second = await saveTacticalBoard(owner.id, owner.name, createBoard(owner, 'Team'), sql);
    const updated = await saveTacticalBoard(owner.id, owner.name, { ...saved!, elements: moveElement(saved!.elements, saved!.elements[0].id, 22, 33) }, sql);
    assert.equal(updated?.revision, 2);
    assert.equal(await saveTacticalBoard(owner.id, owner.name, saved!, sql), null);
    assert.equal(await saveTacticalBoard('coach-b', 'B', saved!, sql), null);
    const row = (await db.query<{data:any}>("SELECT data FROM club_stores WHERE account_id='coach-a'")).rows[0].data;
    assert.equal(row.lineups[0].id, 'legacy'); assert.equal(Object.keys(row.tacticalById).length, 2);
    assert.equal(row.tacticalById[second!.id].revision, 1);
    assert.equal(row.tacticalById[first.id].elements[0].x, 22);
    await saveLegacyBoards(owner.id, { lineups: [{id:'legacy-updated'}], tacticalById: {} }, sql);
    const preserved = (await db.query<{data:any}>("SELECT data FROM club_stores WHERE account_id='coach-a'")).rows[0].data;
    assert.equal(preserved.lineups[0].id, 'legacy-updated');
    assert.deepEqual(preserved.tacticalById, row.tacticalById);
    const ownB = await saveTacticalBoard('coach-b', 'B', createBoard({...owner,id:'coach-b'},'B'),sql);
    assert.equal(ownB?.ownerAccountId,'coach-b');
  } finally { await db.close() }
});
