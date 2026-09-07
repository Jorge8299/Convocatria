import type { getSql } from './server.js';

// Additive, versioned migration. No account identifiers, credentials or payloads are replaced.
export async function ensureClubSchema(sql: ReturnType<typeof getSql>) {
  if (typeof sql.transaction !== 'function') return migrateClubSchema(sql);
  const existing = await sql`SELECT to_regclass('public.convo_migrations') AS registry`;
  if (existing[0]?.registry) {
    const applied = await sql`SELECT id FROM convo_migrations WHERE id='multi-club-v1'`;
    if (applied.length) { await seedClubFields(sql); return; }
  }
  const commands: ReturnType<typeof sql>[] = [];
  commands.push(sql`SELECT pg_advisory_xact_lock(718203)`);
  const collect = ((parts: TemplateStringsArray, ...values: any[]) => {
    commands.push(sql(parts,...values));
    return Promise.resolve([]);
  }) as unknown as typeof sql;
  await migrateClubSchema(collect);
  await sql.transaction(commands);
  await seedClubFields(sql);
}

// Every club owns its fields; keep them seeded so coordinators can assign agendas from day one.
async function seedClubFields(sql: ReturnType<typeof getSql>) {
  await sql`INSERT INTO club_fields(club_id,id,nombre,zones)
    SELECT c.id,'campo-c','Campo C','["c-1","c-2"]'::jsonb FROM clubs c
    WHERE NOT EXISTS(SELECT 1 FROM club_fields f WHERE f.club_id=c.id AND f.id='campo-c')`;
  await sql`INSERT INTO club_fields(club_id,id,nombre,zones)
    SELECT c.id,'el-morer','El Morer','["m-1","m-2","m-3","m-4"]'::jsonb FROM clubs c
    WHERE NOT EXISTS(SELECT 1 FROM club_fields f WHERE f.club_id=c.id AND f.id='el-morer')`;
  await sql`INSERT INTO club_fields(club_id,id,nombre,zones)
    SELECT c.id,'polideportivo','Polideportivo','["p-1","p-2","p-3","p-4"]'::jsonb FROM clubs c
    WHERE NOT EXISTS(SELECT 1 FROM club_fields f WHERE f.club_id=c.id AND f.id='polideportivo')`;
}

async function migrateClubSchema(sql: ReturnType<typeof getSql>) {
  await sql`CREATE TABLE IF NOT EXISTS clubs (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    logo TEXT NOT NULL, color_principal TEXT NOT NULL CHECK(color_principal ~ '^#[0-9a-fA-F]{6}$'),
    activo BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`INSERT INTO clubs(id,nombre,slug,logo,color_principal) VALUES('ud-oliva','UD Oliva','ud-oliva','/escudo-ud-oliva.jpg','#0b2344') ON CONFLICT DO NOTHING`;
  await sql`ALTER TABLE club_accounts ADD COLUMN IF NOT EXISTS club_id TEXT REFERENCES clubs(id)`;
  await sql`UPDATE club_accounts SET club_id='ud-oliva' WHERE club_id IS NULL AND role<>'superadmin'`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS club_accounts_id_club_idx ON club_accounts(id,club_id)`;
  await sql`CREATE INDEX IF NOT EXISTS club_accounts_club_idx ON club_accounts(club_id)`;
  await sql`ALTER TABLE club_stores ADD COLUMN IF NOT EXISTS club_id TEXT REFERENCES clubs(id)`;
  await sql`UPDATE club_stores s SET club_id=COALESCE(a.club_id,'ud-oliva') FROM club_accounts a WHERE a.id=s.account_id AND s.club_id IS NULL`;
  await sql`CREATE INDEX IF NOT EXISTS club_stores_club_area_idx ON club_stores(club_id,area)`;
  await sql`CREATE TABLE IF NOT EXISTS club_fields (
    club_id TEXT NOT NULL REFERENCES clubs(id), id TEXT NOT NULL, nombre TEXT NOT NULL, zones JSONB NOT NULL,
    PRIMARY KEY(club_id,id)
  )`;
  await sql`INSERT INTO club_fields(club_id,id,nombre,zones) VALUES
    ('ud-oliva','campo-c','Campo C','["c-1","c-2"]'),
    ('ud-oliva','el-morer','El Morer','["m-1","m-2","m-3","m-4"]'),
    ('ud-oliva','polideportivo','Polideportivo','["p-1","p-2","p-3","p-4"]') ON CONFLICT DO NOTHING`;
  // Database enforcement covers every write path, including imports and coordinator bulk changes.
  await sql`CREATE OR REPLACE FUNCTION convo_club_payload(value JSONB, tenant TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
  DECLARE result JSONB; k TEXT; v JSONB; linked TEXT;
  BEGIN
    IF jsonb_typeof(value)='array' THEN
      SELECT COALESCE(jsonb_agg(convo_club_payload(item,tenant) ORDER BY ordinal),'[]'::jsonb) INTO result FROM jsonb_array_elements(value) WITH ORDINALITY a(item,ordinal);
      RETURN result;
    ELSIF jsonb_typeof(value)='object' THEN
      IF value ? 'club_id' AND value->>'club_id' IS DISTINCT FROM tenant THEN RAISE EXCEPTION 'Cross-club document'; END IF;
      IF value->>'ownerCoachId' IS NOT NULL THEN
        SELECT club_id INTO linked FROM club_accounts WHERE id=value->>'ownerCoachId';
        IF linked IS DISTINCT FROM tenant THEN RAISE EXCEPTION 'Cross-club player owner'; END IF;
      END IF;
      IF value->>'playerId' IS NOT NULL AND EXISTS (
        SELECT 1 FROM club_stores s, jsonb_array_elements(CASE WHEN jsonb_typeof(s.data->'players')='array' THEN s.data->'players' ELSE '[]'::jsonb END) p(item)
        WHERE s.area='team' AND s.club_id<>tenant AND p.item->>'id'=value->>'playerId'
      ) AND NOT EXISTS (
        SELECT 1 FROM club_stores s, jsonb_array_elements(CASE WHEN jsonb_typeof(s.data->'players')='array' THEN s.data->'players' ELSE '[]'::jsonb END) p(item)
        WHERE s.area='team' AND s.club_id=tenant AND p.item->>'id'=value->>'playerId'
      ) THEN RAISE EXCEPTION 'Cross-club player reference'; END IF;
      result='{}'::jsonb;
      FOR k,v IN SELECT * FROM jsonb_each(value) LOOP result=result || jsonb_build_object(k,convo_club_payload(v,tenant)); END LOOP;
      IF value ? 'id' OR value ? 'players' THEN result=result || jsonb_build_object('club_id',tenant); END IF;
      RETURN result;
    END IF;
    RETURN value;
  END $$`;
  await sql`CREATE OR REPLACE FUNCTION convo_store_club() RETURNS TRIGGER LANGUAGE plpgsql AS $$
  DECLARE tenant TEXT;
  BEGIN
    SELECT club_id INTO tenant FROM club_accounts WHERE id=NEW.account_id;
    IF tenant IS NULL THEN RAISE EXCEPTION 'Store requires a club account'; END IF;
    IF NEW.club_id IS NOT NULL AND NEW.club_id<>tenant THEN RAISE EXCEPTION 'Cross-club store'; END IF;
    NEW.club_id=tenant;
    IF NEW.area='team' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'players')='array' THEN NEW.data->'players' ELSE '[]'::jsonb END) incoming,
        club_stores s, jsonb_array_elements(CASE WHEN jsonb_typeof(s.data->'players')='array' THEN s.data->'players' ELSE '[]'::jsonb END) existing
      WHERE s.area='team' AND s.club_id<>tenant AND existing->>'id'=incoming->>'id'
    ) THEN RAISE EXCEPTION 'Cross-club player identity'; END IF;
    NEW.data=convo_club_payload(NEW.data,tenant);
    RETURN NEW;
  END $$`;
  await sql`DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='convo_store_club_trigger') THEN
      CREATE TRIGGER convo_store_club_trigger BEFORE INSERT OR UPDATE ON club_stores FOR EACH ROW EXECUTE FUNCTION convo_store_club();
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='club_accounts_scope_check') THEN
      ALTER TABLE club_accounts ADD CONSTRAINT club_accounts_scope_check CHECK ((role='superadmin' AND club_id IS NULL) OR (role<>'superadmin' AND club_id IS NOT NULL));
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='club_stores_account_club_fk') THEN
      ALTER TABLE club_stores ADD CONSTRAINT club_stores_account_club_fk FOREIGN KEY(account_id,club_id) REFERENCES club_accounts(id,club_id);
    END IF;
  END $$`;
  await sql`ALTER TABLE club_stores ALTER COLUMN club_id SET NOT NULL`;
  await sql`CREATE TABLE IF NOT EXISTS convo_migrations(id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`DO $$ BEGIN
    PERFORM pg_advisory_xact_lock(718203);
    IF NOT EXISTS(SELECT 1 FROM convo_migrations WHERE id='multi-club-v1') THEN
      UPDATE club_stores SET data=convo_club_payload(data,club_id);
      INSERT INTO convo_migrations(id) VALUES('multi-club-v1');
    END IF;
  END $$`;
}
