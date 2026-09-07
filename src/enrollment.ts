export const categoryNames = {querubin:'Querubín',prebenjamin:'Prebenjamín',benjamin:'Benjamín',alevin:'Alevín'};
export type Category = keyof typeof categoryNames;
export type CategoryRule = {category:Category; from:number; to:number};
export type Installment = {date:string; amount:number};
export function defaultCategories(year:number):CategoryRule[] {
  return [{category:'querubin',from:year-5,to:year-4},{category:'prebenjamin',from:year-7,to:year-6},{category:'benjamin',from:year-9,to:year-8},{category:'alevin',from:year-11,to:year-10}];
}
export function validDate(value:unknown):value is string {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
export function classifyBirth(date:string,rules:CategoryRule[]):Category|null {
  if(!validDate(date))return null;
  const year=Number(date.slice(0,4));
  return rules.find(rule=>year>=rule.from&&year<=rule.to)?.category??null;
}
export function validateCampaign(body:any) {
  if(typeof body.name!=='string'||!body.name.trim()||body.name.length>120)throw new Error('Escribe el nombre de la temporada.');
  if(!Number.isInteger(body.year)||body.year<2020||body.year>2100)throw new Error('Año de temporada no válido.');
  if(!Number.isSafeInteger(body.total)||body.total<50||body.total>1000000)throw new Error('La cuota debe estar entre 0,50 y 10.000 euros.');
  if(!Array.isArray(body.parts)||body.parts.length<1||body.parts.length>12||body.parts.some((p:any,i:number)=>!validDate(p.date)||!Number.isSafeInteger(p.amount)||p.amount<50||(i>0&&p.date<=body.parts[i-1].date))||body.parts.reduce((s:number,p:any)=>s+p.amount,0)!==body.total)throw new Error('Los plazos deben sumar la cuota, tener al menos 0,50 € y fechas en orden.');
  if(!Array.isArray(body.categories)||body.categories.length!==4||new Set(body.categories.map((r:any)=>r.category)).size!==4||body.categories.some((r:any)=>!Object.hasOwn(categoryNames,r.category)||!Number.isInteger(r.from)||!Number.isInteger(r.to)||r.from>r.to||r.from<body.year-20||r.to>body.year))throw new Error('Revisa los años de nacimiento de cada categoría.');
  for(let i=0;i<body.categories.length;i++)for(let j=i+1;j<body.categories.length;j++)if(body.categories[i].from<=body.categories[j].to&&body.categories[j].from<=body.categories[i].to)throw new Error('Los años de nacimiento no pueden solaparse.');
  if(typeof body.terms!=='string'||body.terms.trim().length<30||body.terms.length>12000)throw new Error('Añade las condiciones y la información sobre el uso de los datos (mínimo 30 caracteres).');
}
export function validateRegistration(body:any,rules:CategoryRule[]) {
  for(const key of ['child_name','guardian_name'])if(typeof body[key]!=='string'||body[key].trim().length<3||body[key].length>120)throw new Error('Completa los nombres y apellidos.');
  if(!validDate(body.birth_date)||body.birth_date>new Date().toISOString().slice(0,10))throw new Error('Fecha de nacimiento no válida.');
  const category=classifyBirth(body.birth_date,rules);if(!category)throw new Error('La fecha de nacimiento no corresponde a las categorías de esta inscripción.');
  if(typeof body.email!=='string'||body.email.length>200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))throw new Error('Correo electrónico no válido.');
  if(typeof body.phone!=='string'||!/^\+?[\d ()-]{8,25}$/.test(body.phone))throw new Error('Teléfono no válido.');
  if(body.consent!==true||!['full','parts'].includes(body.mode))throw new Error('Acepta las condiciones y elige cómo pagar.');
  return category;
}
