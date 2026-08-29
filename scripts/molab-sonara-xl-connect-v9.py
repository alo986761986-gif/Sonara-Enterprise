import time
import urllib.request

SOURCE = "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/molab-sonara-xl-connect-v8.py"

print("SONARA MoLab XL bridge V9: carico il bridge API ufficiale...", flush=True)
source = urllib.request.urlopen(SOURCE, timeout=60).read().decode("utf-8")
source = source.replace('/marimo/ACE-Step-1.5', '/marimo/SONARA-ACE-Step-1.5')

scope = {
    "__name__": "sonara_molab_bridge_v8",
    "__file__": SOURCE,
}
exec(compile(source, SOURCE, "exec"), scope, scope)
scope["main"]()

print("\nSONARA MOLAB BRIDGE ATTIVO. NON FERMARE QUESTA CELLA.", flush=True)
print("ACE-Step API e Cloudflare restano mantenuti vivi da questa sessione MoLab.", flush=True)
try:
    while True:
        time.sleep(3600)
except KeyboardInterrupt:
    print("SONARA MoLab bridge arrestato.", flush=True)
