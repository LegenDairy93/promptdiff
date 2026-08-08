type Model = { id:string; name:string; contextLength:number|null };
type Usage = { inputTokens:number|null; outputTokens:number|null; costUsd:number|null };
const BASE="https://openrouter.ai/api/v1";
let cache:{at:number;models:Model[]}={at:0,models:[]};
export function configured(){return Boolean(process.env.OPENROUTER_API_KEY?.startsWith("sk-or-"));}
export async function freeModels():Promise<Model[]>{
  const key=process.env.OPENROUTER_API_KEY; if(!key) throw new Error("Live models are not configured.");
  if(Date.now()-cache.at<300000&&cache.models.length)return cache.models;
  const response=await fetch(`${BASE}/models`,{headers:{Authorization:`Bearer ${key}`}}); if(!response.ok)throw new Error(`Model discovery failed (${response.status}).`);
  const payload:any=await response.json();
  const models=(payload.data||[]).filter((m:any)=>m.id!=="openrouter/free"&&m.id.endsWith(":free")&&Number(m.pricing?.prompt)===0&&Number(m.pricing?.completion)===0&&m.architecture?.output_modalities?.includes("text")!==false).map((m:any)=>({id:m.id,name:m.name||m.id,contextLength:m.context_length||null})).sort((a:Model,b:Model)=>a.name.localeCompare(b.name)).slice(0,20);
  cache={at:Date.now(),models}; return models;
}
export async function complete(model:string,system:string,input:string):Promise<{text:string;usage:Usage;resolvedModel:string;latencyMs:number}>{
  const allowed=await freeModels(); if(!allowed.some(item=>item.id===model))throw new Error("Choose a currently available free model.");
  const key=process.env.OPENROUTER_API_KEY!; const started=Date.now();
  const response=await fetch(`${BASE}/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","HTTP-Referer":"https://legendairy93.github.io/promptdiff/","X-OpenRouter-Title":"PromptDiff live demo"},body:JSON.stringify({model,temperature:0,max_tokens:350,messages:[{role:"system",content:system},{role:"user",content:input}]})});
  const payload:any=await response.json().catch(()=>({})); if(!response.ok)throw new Error(`OpenRouter ${response.status}: ${payload?.error?.message||"request failed"}`);
  const text=payload.choices?.[0]?.message?.content; if(typeof text!=="string")throw new Error("Model returned no text.");
  return {text,resolvedModel:payload.model||model,latencyMs:Date.now()-started,usage:{inputTokens:payload.usage?.prompt_tokens??null,outputTokens:payload.usage?.completion_tokens??null,costUsd:payload.usage?.cost??null}};
}