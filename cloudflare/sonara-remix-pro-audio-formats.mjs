/** Supported, genuine audio containers for private Remix Pro source uploads.
 * A file extension is not sufficient: verify the first bytes before R2 commit.
 * Full codec, stream and duration validation happens in the isolated GPU worker.
 */
const FORMATS = Object.freeze({
  wav:'audio/wav',mp3:'audio/mpeg',flac:'audio/flac',
  m4a:'audio/mp4',mp4:'audio/mp4',aac:'audio/aac',
  ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',
  aif:'audio/aiff',aiff:'audio/aiff',aifc:'audio/aiff',
  webm:'audio/webm',wma:'audio/x-ms-wma',caf:'audio/x-caf',
  amr:'audio/amr',ac3:'audio/ac3'
});
export const REMIX_PRO_AUDIO_EXTENSIONS=Object.freeze(Object.keys(FORMATS));
export function audioFormatForName(name){
  const m=/\.([a-z0-9]{2,5})$/i.exec(String(name||''));
  return m&&Object.hasOwn(FORMATS,m[1].toLowerCase())?m[1].toLowerCase():null;
}
export function audioContentType(format){return FORMATS[String(format||'')]||null;}
export function audioSignatureMatches(data,format){
  const x=new Uint8Array(data),f=String(format||'');
  if(x.length<12)return false;
  const txt=(a,n)=>String.fromCharCode(...x.slice(a,a+n));
  if(f==='wav')return txt(0,4)==='RIFF'&&txt(8,4)==='WAVE';
  if(f==='mp3')return txt(0,3)==='ID3'||(x[0]===255&&(x[1]&0xe0)===0xe0&&(x[1]&0x18)!==0x08);
  if(f==='flac')return txt(0,4)==='fLaC';
  if(f==='m4a'||f==='mp4')return txt(4,4)==='ftyp';
  if(f==='aac')return x[0]===255&&(x[1]&0xf6)===0xf0;
  if(f==='ogg'||f==='oga'||f==='opus')return txt(0,4)==='OggS';
  if(f==='aif'||f==='aiff'||f==='aifc')return txt(0,4)==='FORM'&&['AIFF','AIFC'].includes(txt(8,4));
  if(f==='webm')return x[0]===0x1a&&x[1]===0x45&&x[2]===0xdf&&x[3]===0xa3;
  if(f==='wma')return [0x30,0x26,0xb2,0x75,0x8e,0x66,0xcf,0x11].every((v,i)=>x[i]===v);
  if(f==='caf')return txt(0,4)==='caff';
  if(f==='amr')return txt(0,6)==='#!AMR\n'||txt(0,9)==='#!AMR-WB\n';
  if(f==='ac3')return x[0]===0x0b&&x[1]===0x77;
  return false;
}
