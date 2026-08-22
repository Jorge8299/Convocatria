import { ApiRequest, ApiResponse, destroySession, fail, methodNotAllowed } from './_lib/server.js';
export default async function handler(req: ApiRequest, res: ApiResponse) { if (req.method !== 'POST') return methodNotAllowed(res); try { await destroySession(req,res); res.status(200).json({ ok:true }) } catch(error) { fail(res,error) } }

