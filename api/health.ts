import { ApiRequest, ApiResponse, ensureSchema, fail } from './_lib/server.js';
export default async function handler(_req:ApiRequest,res:ApiResponse){ try { await ensureSchema(); res.status(200).json({ok:true,database:'connected'}) } catch(error){ fail(res,error) } }
