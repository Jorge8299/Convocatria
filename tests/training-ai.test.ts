import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateTrainingAIContext, validateTrainingAISession } from '../src/trainingAI.ts';

test('AI training context validates bounds and required objectives',()=>{
 assert.ok(validateTrainingAIContext({players:10,goalkeepers:1,duration:90,level:'medio',mode:'collective',objectives:['Presión'],material:['Balones'],fieldSize:'Medio campo',intensity:'alta',observations:''}));
 assert.equal(validateTrainingAIContext({players:7,goalkeepers:8,duration:90,level:'medio',mode:'collective',objectives:['Presión'],intensity:'alta'}),null);
 assert.equal(validateTrainingAIContext({players:7,goalkeepers:1,duration:90,level:'medio',mode:'collective',objectives:[],intensity:'alta'}),null);
});

test('AI training response must be structured and match requested context',()=>{
 const raw={title:'Salida ante presión',category:'Benjamín',format:'F8',players:9,goalkeepers:1,objectives:['Salida de balón'],totalMaterial:['Balones'],summary:'Sesión progresiva.',exercises:[
  {block:'Activación',name:'Rondo orientado',duration:20,objective:'Pase',players:9,space:'20x20',material:['Balones'],organization:'Dos grupos.',development:'Circular y cambiar zona.',instructions:['Mirar antes de recibir'],variants:['Limitar contactos'],coachingPoints:['Perfil corporal']},
  {block:'Juego aplicado',name:'Salida 5v4',duration:40,objective:'Salida',players:9,space:'Medio campo',material:['Petos'],organization:'Un equipo inicia.',development:'Superar presión.',instructions:['Dar amplitud'],variants:[],coachingPoints:['Distancias']},
  {block:'Partido final',name:'Partido condicionado',duration:30,objective:'Transferencia',players:9,space:'Medio campo',material:[],organization:'Dos equipos.',development:'Partido con reinicio.',instructions:[],variants:[],coachingPoints:[]}
 ]};
 const result=validateTrainingAISession(raw,{players:9,duration:90});
 assert.ok(result);assert.equal(result?.totalDuration,90);assert.equal(result?.generationSource,'ai');
 assert.equal(validateTrainingAISession({...raw,players:8},{players:9,duration:90}),null);
 assert.equal(validateTrainingAISession({...raw,exercises:raw.exercises.slice(0,1)},{players:9,duration:90}),null);
});
