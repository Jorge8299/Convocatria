import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const roles = await sql.query('SELECT role, count(*)::int AS total FROM club_accounts GROUP BY role ORDER BY role');
const stores = await sql.query('SELECT area, count(*)::int AS total FROM club_stores GROUP BY area ORDER BY area');
const [teamContent] = await sql.query("SELECT COALESCE(SUM(jsonb_array_length(data->'players')),0)::int AS players FROM club_stores WHERE area='team'");
const [matchContent] = await sql.query("SELECT COALESCE(SUM(jsonb_array_length(data)),0)::int AS matches FROM club_stores WHERE area='stats'");

console.log(JSON.stringify({ roles, stores, players: teamContent.players, matches: matchContent.matches }));
