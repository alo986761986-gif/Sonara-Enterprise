from pathlib import Path

path = Path('cloudflare/sonara-molab-xl-router.mjs')
text = path.read_text(encoding='utf-8')

old_submit = """  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`MoLab XL: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
"""
new_submit = """  const raw = await response.text();
  if (response.status === 530) {
    throw new Error('MoLab XL tunnel offline (HTTP 530). Il Quick Tunnel Cloudflare non e piu raggiungibile: riavvia il supervisor MoLab e collega il nuovo SONARA_MOLAB_XL_URL.');
  }
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`MoLab XL: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
"""

old_query = """  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`MoLab XL query: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
"""
new_query = """  const raw = await response.text();
  if (response.status === 530) {
    throw new Error('MoLab XL tunnel offline durante query (HTTP 530). Il Quick Tunnel Cloudflare non e piu raggiungibile.');
  }
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`MoLab XL query: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
"""

if old_submit not in text:
    raise SystemExit('submit block not found')
if old_query not in text:
    raise SystemExit('query block not found')

text = text.replace(old_submit, new_submit, 1)
text = text.replace(old_query, new_query, 1)
path.write_text(text, encoding='utf-8')
print('MOLAB_530_RECOVERY_PATCHED')
