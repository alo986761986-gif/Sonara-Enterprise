// SONARA Remix Pro V5: isolated duration-normalizing gateway, not a GPU or auth replacement.
const MIN=120,MAX=300,STEP=30;
const valid=n=>Number.isInteger(n)&&n>=MIN&&n<=MAX&&(n-MIN)%STEP===0;
const oldValid=n=>Number.isInteger(n)&&n>=30&&n<=480&&n%30===0;
const numeric=value=>{
  if(typeof value!=='number'&&typeof value!=='string')return NaN;
  if(typeof value==='string'&&!/^\d{1,4}$/.test(value))return NaN;
  return Number(value);
};
const randomDuration=()=>{
  const bytes=new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return MIN+(bytes[0]%7)*STEP;
};
export function normalizeRemixDuration(body,header,random=randomDuration){
  const received=numeric(body.durationSec);
  const expected=numeric(body.expectedDurationSec);
  const claimed=numeric(header);
  const selected=valid(expected)?expected:valid(claimed)?claimed:valid(received)?received:null;
  const supplied=[received,expected,claimed].filter(Number.isFinite);
  if(selected===null&&supplied.some(n=>!oldValid(n)))
    return {ok:false,reason:'INVALID_DURATION'};
  const seconds=selected??random();
  if(!valid(seconds))return {ok:false,reason:'INVALID_DURATION'};
  return {ok:true,seconds,repaired:received!==seconds||expected!==seconds||claimed!==seconds,
    payload:{...body,durationSec:seconds,expectedDurationSec:seconds}};
}
const fail=(code,message,status)=>Response.json({error:{code,message}},{
  status,headers:{'cache-control':'no-store','x-sonara-remix-duration-gateway':'v5'}
});
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    // Staging is read-only and cannot bypass authentication through workers.dev.
    if(url.hostname.endsWith('.workers.dev')){
      if(request.method==='GET'&&url.pathname==='/__sonara_remix_duration_health')
        return Response.json({service:'sonara-remix-duration-gateway-v5',staging:true,
          minSeconds:MIN,maxSeconds:MAX,stepSeconds:STEP},{headers:{'cache-control':'no-store'}});
      return new Response('Not found',{status:404});
    }
    if(!['sonaraenterprise.com','www.sonaraenterprise.com'].includes(url.hostname))
      return new Response('Not found',{status:404});
    if(!env?.SONARA_MAIN||typeof env.SONARA_MAIN.fetch!=='function')
      return fail('REMIX_PRO_PROXY_UNAVAILABLE','Gateway SONARA non disponibile. Nessun job inviato.',503);
    if(request.method!=='POST'||url.pathname!=='/api/billing/generate')
      return env.SONARA_MAIN.fetch(request);
    if(Number(request.headers.get('content-length')||0)>65536)
      return fail('REQUEST_TOO_LARGE','Richiesta troppo grande.',413);
    let body;
    try{
      const raw=await request.clone().text();
      if(raw.length>65536)return fail('REQUEST_TOO_LARGE','Richiesta troppo grande.',413);
      body=JSON.parse(raw);
    }catch{return env.SONARA_MAIN.fetch(request);}
    if(!body||typeof body!=='object'||Array.isArray(body)||body.sonaraRemixPro!==true)
      return env.SONARA_MAIN.fetch(request);
    const contract=normalizeRemixDuration(body,
      request.headers.get('X-Sonara-Remix-Expected-Duration'));
    if(!contract.ok)
      return fail('REMIX_PRO_INVALID_AUTOMATIC_DURATION',
        'Durata Remix Pro non valida: SONARA deve scegliere da 2:00 a 5:00.',400);
    const headers=new Headers(request.headers);
    headers.set('content-type','application/json');
    headers.set('X-Sonara-Remix-Expected-Duration',String(contract.seconds));
    headers.delete('content-length');
    headers.delete('X-Sonara-Internal-Secret');
    headers.delete('X-Sonara-User-Uid');
    const forwarded=new Request(url.toString(),{
      method:'POST',headers,body:JSON.stringify(contract.payload),redirect:'manual'
    });
    let response;
    try{response=await env.SONARA_MAIN.fetch(forwarded);}
    catch{return fail('REMIX_PRO_GATEWAY_UNCONFIRMED',
      'Conferma server non disponibile. Controlla i job prima di riprovare.',503);}
    const out=new Headers(response.headers);
    out.set('x-sonara-remix-duration-gateway','v5');
    out.set('x-sonara-remix-duration-seconds',String(contract.seconds));
    out.set('x-sonara-remix-duration-repaired',contract.repaired?'1':'0');
    out.set('cache-control','no-store');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers:out});
  }
};
