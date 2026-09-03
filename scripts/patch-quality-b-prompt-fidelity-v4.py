from pathlib import Path
import runpy

patch = Path(__file__).with_name('patch-quality-b-strict-v5.py')
if not patch.exists():
    raise SystemExit(f'V5 patcher missing: {patch}')
runpy.run_path(str(patch), run_name='__main__')
