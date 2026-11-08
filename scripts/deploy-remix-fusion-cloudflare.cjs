#!/usr/bin/env node
/**
 * SONARA Remix A+B Cloudflare-only, fail-closed release entrypoint.
 * Invoked manually on a trusted environment with already configured Wrangler.
 * NEVER uses Vercel, NEVER writes Cloudflare secrets or MoLab tokens.
 */
const https = require("node:https");
const fs = require("node:fs");
const cp = require("node:child_process");

const REV = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion";
const CAP_URL = "https://api.sonaraenterprise.com/api/sonara-relay/pro-capabilities";
const WORKER_CONFIG = "wrangler.jsonc";
function assert(ok, why) {
  if (!ok) throw new Error(why);
}
function getJson(url) {
  return new Promise((resolve,reject) => {
    const request=https.get(url,{headers:{"Cache-Control":"no-store","User-Agent":"SONARA-Cloudflare-Fusion-Release"},timeout:15000}, res=>{
      if(res.statusCode!==200){res.resume();reject(new Error("GPU preflight HTTP "+res.statusCode));return;}
      let data="";
      res.on("data",c=>{data+=c; if(data.length>20000){request.destroy(new Error("Response too large"));}});
      res.on("end",()=>{try {resolve(JSON.parse(data));}catch(e){reject(new Error("Invalid capability JSON"));}});
    });
    request.on("timeout",()=>request.destroy(new Error("Capability endpoint timeout")));
    request.on("error",reject);
  });
}
async function main() {
  assert(process.env.SONARA_FUSION_QA_APPROVED==="yes","BLOCKED: real two-track MoLab GPU QA not yet approved");
  assert(process.env.SONARA_FUSION_CLOUDFLARE_RELEASE==="yes","BLOCKED: manual Cloudflare release opt-in required");
  assert(fs.existsSync(WORKER_CONFIG),"Missing Wrangler config");
  const caps=await getJson(CAP_URL);
  assert(caps.available===true, "BLOCKED: Remix Pro backend unavailable");
  assert(caps.expectedAgentRevision===REV, "BLOCKED: Cloudflare Worker has not enabled required V3 revision");
  assert(caps.fusionAvailable===true, "BLOCKED: real MoLab V3 GPU heartbeat not ready");
  assert(process.env.CLOUDFLARE_API_TOKEN||process.env.CF_API_TOKEN,
         "BLOCKED: expected existing Cloudflare API token environment");
  console.log("SONARA_FUSION_PREFLIGHT=V3_MATCH_READY");
  cp.execFileSync("npm",["run","build"],{stdio:"inherit"});
  cp.execFileSync("npx",["--yes","wrangler@latest","deploy","--config",WORKER_CONFIG],{stdio:"inherit"});
  const next=await getJson(CAP_URL);
  assert(next.fusionAvailable===true&&next.expectedAgentRevision===REV,
         "FAIL: post-deploy public GPU fusion capability missing");
  console.log("SONARA_FUSION_CLOUDFLARE_RELEASE=SUCCESS");
}
main().catch(e=>{console.error("SONARA_FUSION_RELEASE_BLOCKED="+String(e.message||e));process.exitCode=1;});
