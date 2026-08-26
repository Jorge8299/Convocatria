import { ApiRequest, ApiResponse, fail, FootballStage, getSession, getSql, hashPin, jsonBody, mapAccount, methodNotAllowed, publicAccount, TrainingYear } from './_lib/server.js';

const footballStages: FootballStage[] = ['prebenjamin', 'benjamin', 'alevin'];
const trainingYears: TrainingYear[] = ['primero', 'segundo', 'mixto'];

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const session = await getSession(req);
    if (session?.role !== 'superadmin') { res.status(403).json({ error:'Acceso restringido.' }); return }
    const sql = getSql();
    if (req.method === 'POST') {
      const body = jsonBody<{ name:string; role:'entrenador'|'coordinador'; teamLabel?:string; footballStage?:FootballStage|null; trainingYear?:TrainingYear|null; pin:string }>(req);
      if (!body.name?.trim() || !/^\d{4}$/.test(body.pin) || !['entrenador','coordinador'].includes(body.role)) { res.status(400).json({error:'Datos incompletos.'}); return }
      const id = crypto.randomUUID();
      const teamLabel = body.role === 'entrenador' ? body.teamLabel?.trim() || '' : 'Coordinación';
      const footballStage = body.role === 'entrenador' && body.footballStage && footballStages.includes(body.footballStage) ? body.footballStage : null;
      const trainingYear = body.role === 'entrenador' && body.trainingYear && trainingYears.includes(body.trainingYear) ? body.trainingYear : null;
      if (body.role === 'entrenador' && (!teamLabel || !footballStage || !trainingYear)) { res.status(400).json({error:'Indica el equipo, la etapa y el año del entrenador.'}); return }
      await sql`INSERT INTO club_accounts (id,name,role,team_label,football_stage,training_year,pin_hash) VALUES (${id},${body.name.trim()},${body.role},${teamLabel},${footballStage},${trainingYear},${hashPin(body.pin)})`;
    } else if (req.method === 'PATCH') {
      const body = jsonBody<{ id:string; name?:string; role?:'entrenador'|'coordinador'; teamLabel?:string; footballStage?:FootballStage|null; trainingYear?:TrainingYear|null; pin?:string; active?:boolean }>(req);
      if (!body.id || body.id === 'superadmin') { res.status(400).json({error:'Usuario no válido.'}); return }
      if (body.name !== undefined || body.role !== undefined || body.teamLabel !== undefined || body.footballStage !== undefined || body.trainingYear !== undefined) {
        if (!body.name?.trim() || !body.role || !['entrenador','coordinador'].includes(body.role)) { res.status(400).json({error:'Nombre o tipo de acceso no válido.'}); return }
        const teamLabel = body.role === 'entrenador' ? body.teamLabel?.trim() || '' : 'Coordinación';
        const footballStage = body.role === 'entrenador' && body.footballStage && footballStages.includes(body.footballStage) ? body.footballStage : null;
        const trainingYear = body.role === 'entrenador' && body.trainingYear && trainingYears.includes(body.trainingYear) ? body.trainingYear : null;
        if (body.role === 'entrenador' && (!teamLabel || !footballStage || !trainingYear)) { res.status(400).json({error:'Indica el equipo, la etapa y el año del entrenador.'}); return }
        await sql`UPDATE club_accounts SET name=${body.name.trim()},role=${body.role},team_label=${teamLabel},football_stage=${footballStage},training_year=${trainingYear} WHERE id=${body.id}`;
      }
      if (body.pin !== undefined) { if (!/^\d{4}$/.test(body.pin)) { res.status(400).json({error:'PIN no válido.'}); return } await sql`UPDATE club_accounts SET pin_hash=${hashPin(body.pin)} WHERE id=${body.id}` }
      if (body.active !== undefined) await sql`UPDATE club_accounts SET active=${body.active} WHERE id=${body.id}`;
    } else if (req.method === 'DELETE') {
      const id = String(req.query?.id || '');
      if (!id || id === 'superadmin') { res.status(400).json({error:'Usuario no válido.'}); return }
      await sql`DELETE FROM club_accounts WHERE id=${id}`;
    } else return methodNotAllowed(res);
    const rows = await sql`SELECT * FROM club_accounts ORDER BY created_at`;
    res.status(200).json({ accounts: rows.map((row) => publicAccount(mapAccount(row))) });
  } catch (error) { fail(res,error) }
}
