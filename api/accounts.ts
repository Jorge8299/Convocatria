import { ApiRequest, ApiResponse, ClubRole, CoordinatorScope, fail, FootballStage, getSession, getSql, hashPin, jsonBody, mapAccount, methodNotAllowed, publicAccount, readBody, setJsonBody, TrainingYear, footballStages } from './_lib/server.js';

const trainingYears: TrainingYear[] = ['primero', 'segundo', 'mixto'];
const coordinatorScopes: CoordinatorScope[] = ['f8', 'f11', 'all'];
type ManagedRole = 'entrenador' | 'coordinador' | 'admin';

export const config = { api: { bodyParser: false } };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    if (!session || !['admin', 'superadmin'].includes(session.role)) {
      res.status(403).json({ error: 'Acceso restringido.' });
      return;
    }
    const raw = await readBody(req);
    setJsonBody(req, raw);
    const sql = getSql();
    const allowedRoles: ClubRole[] = session.role === 'superadmin'
      ? ['entrenador', 'coordinador', 'admin']
      : ['entrenador', 'coordinador'];

    if (req.method === 'POST') {
      const body = jsonBody<{ name: string; role: ManagedRole; teamLabel?: string; footballStage?: FootballStage | null; trainingYear?: TrainingYear | null; scope?: CoordinatorScope | null; pin: string }>(req);
      if (!body.name?.trim() || !/^\d{4}$/.test(body.pin) || !allowedRoles.includes(body.role)) {
        res.status(400).json({ error: 'Datos incompletos.' });
        return;
      }
      const clubId = session.role === 'superadmin' ? (body as typeof body & {club_id?:string}).club_id || 'ud-oliva' : session.club_id;
      const club = await sql`SELECT id FROM clubs WHERE id=${clubId} AND activo=TRUE`;
      if (!club.length) { res.status(400).json({error:'Club no válido.'}); return }
      const id = crypto.randomUUID();
      const teamLabel = body.role === 'entrenador'
        ? body.teamLabel?.trim() || ''
        : body.role === 'admin' ? 'Administración' : 'Coordinación';
      const footballStage = body.role === 'entrenador' && body.footballStage && footballStages.includes(body.footballStage) ? body.footballStage : null;
      const trainingYear = body.role === 'entrenador' && body.trainingYear && trainingYears.includes(body.trainingYear) ? body.trainingYear : null;
      const scope = body.role === 'coordinador' && body.scope && coordinatorScopes.includes(body.scope) ? body.scope : null;
      if (body.role === 'entrenador' && (!teamLabel || !footballStage || !trainingYear)) {
        res.status(400).json({ error: 'Indica el equipo, la etapa y el año del entrenador.' });
        return;
      }
      await sql`INSERT INTO club_accounts (id,name,role,team_label,football_stage,training_year,scope,pin_hash,club_id) VALUES (${id},${body.name.trim()},${body.role},${teamLabel},${footballStage},${trainingYear},${scope},${hashPin(body.pin)},${clubId})`;
    } else if (req.method === 'PATCH') {
      const body = jsonBody<{ id: string; name?: string; role?: ManagedRole; teamLabel?: string; footballStage?: FootballStage | null; trainingYear?: TrainingYear | null; scope?: CoordinatorScope | null; pin?: string; active?: boolean }>(req);
      const targetRows = body.id ? await sql`SELECT * FROM club_accounts WHERE id=${body.id} LIMIT 1` : [];
      const target = targetRows[0] ? mapAccount(targetRows[0]) : null;
      const canManage = target && (session.role === 'superadmin' || target.club_id === session.club_id) && target.role !== 'superadmin' && (session.role === 'superadmin' || ['entrenador', 'coordinador'].includes(target.role));
      if (!canManage) {
        res.status(400).json({ error: 'Usuario no válido.' });
        return;
      }
      if (body.name !== undefined || body.role !== undefined || body.teamLabel !== undefined || body.footballStage !== undefined || body.trainingYear !== undefined || body.scope !== undefined) {
        if (!body.name?.trim() || !body.role || !allowedRoles.includes(body.role)) {
          res.status(400).json({ error: 'Nombre o tipo de acceso no válido.' });
          return;
        }
        const teamLabel = body.role === 'entrenador'
          ? body.teamLabel?.trim() || ''
          : body.role === 'admin' ? 'Administración' : 'Coordinación';
        const footballStage = body.role === 'entrenador' && body.footballStage && footballStages.includes(body.footballStage) ? body.footballStage : null;
        const trainingYear = body.role === 'entrenador' && body.trainingYear && trainingYears.includes(body.trainingYear) ? body.trainingYear : null;
        const scope = body.role === 'coordinador' && body.scope && coordinatorScopes.includes(body.scope) ? body.scope : null;
        if (body.role === 'entrenador' && (!teamLabel || !footballStage || !trainingYear)) {
          res.status(400).json({ error: 'Indica el equipo, la etapa y el año del entrenador.' });
          return;
        }
        await sql`UPDATE club_accounts SET name=${body.name.trim()},role=${body.role},team_label=${teamLabel},football_stage=${footballStage},training_year=${trainingYear},scope=${scope} WHERE id=${body.id}`;
      }
      if (body.pin !== undefined) {
        if (!/^\d{4}$/.test(body.pin)) {
          res.status(400).json({ error: 'PIN no válido.' });
          return;
        }
        await sql`UPDATE club_accounts SET pin_hash=${hashPin(body.pin)} WHERE id=${body.id}`;
      }
      if (body.active !== undefined) await sql`UPDATE club_accounts SET active=${body.active} WHERE id=${body.id}`;
    } else if (req.method === 'DELETE') {
      const id = String(req.query?.id || '');
      const targetRows = id ? await sql`SELECT * FROM club_accounts WHERE id=${id} LIMIT 1` : [];
      const target = targetRows[0] ? mapAccount(targetRows[0]) : null;
      const canDelete = target && (session.role === 'superadmin' || target.club_id === session.club_id) && !['admin', 'superadmin'].includes(target.role) && (session.role === 'superadmin' || ['entrenador', 'coordinador'].includes(target.role));
      if (!canDelete) {
        res.status(400).json({ error: 'Este acceso protegido no se puede eliminar.' });
        return;
      }
      await sql`DELETE FROM club_accounts WHERE id=${id}`;
    } else {
      return methodNotAllowed(res);
    }

    const rows = await sql`SELECT * FROM club_accounts WHERE (${session.role === 'superadmin'} OR club_id=${session.club_id}) ORDER BY created_at`;
    res.status(200).json({ accounts: rows.map((row) => publicAccount(mapAccount(row))) });
  } catch (error) {
    fail(res, error);
  }
}
