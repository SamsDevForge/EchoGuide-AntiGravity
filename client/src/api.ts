const base=(import.meta.env.VITE_API_URL??'').replace(/\/$/,'');
export async function api<T>(path:string,body?:unknown):Promise<T>{
  if(import.meta.env.VITE_STATIC_MODE==='true'&&!base)throw new Error('Optional scene API is not configured on this standalone deployment.');
  const response=await fetch(`${base}/api${path}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
  const data=await response.json().catch(()=>({error:'The optional API is unavailable.'}));
  if(!response.ok)throw new Error(typeof data.error==='string'?data.error:data.message??'Request failed.');return data as T;
}
