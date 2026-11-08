// Remix Pro automatic duration contract: choose once per new job, not per upload.
export const REMIX_DURATION_MIN_SECONDS=120;
export const REMIX_DURATION_MAX_SECONDS=300;
export const REMIX_DURATION_STEP_SECONDS=30;
export const isValidRemixDuration=(seconds:number)=>
  Number.isInteger(seconds)&&seconds>=REMIX_DURATION_MIN_SECONDS&&
  seconds<=REMIX_DURATION_MAX_SECONDS&&
  (seconds-REMIX_DURATION_MIN_SECONDS)%REMIX_DURATION_STEP_SECONDS===0;

export function chooseRandomRemixDuration(randomUint32:()=>number=()=>{
  const bytes=new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0];
}):number {
  const n=randomUint32();
  if(!Number.isInteger(n)||n<0||n>0xffffffff)
    throw new Error('Untrusted random duration source');
  const choices=(REMIX_DURATION_MAX_SECONDS-REMIX_DURATION_MIN_SECONDS)/
    REMIX_DURATION_STEP_SECONDS+1;
  return REMIX_DURATION_MIN_SECONDS+(n%choices)*REMIX_DURATION_STEP_SECONDS;
}
