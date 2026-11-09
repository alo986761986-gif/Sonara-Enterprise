"""Safe isolated SONARA Remix Pro V4.1 handoff: no audio jobs or ACE-Step restart.

Only the existing V4 worker and two verified private modules can be changed.
The default mode is read-only. --activate requires the explicit user's audio
QA waiver and a maintenance window. Never overwrite unrecognized local edits.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path("/marimo/SONARA-REMIX-PRO")
PYTHON = ROOT / ".venv/bin/python"
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"
BRIDGE = ROOT / "sonara_remix_pro_ace_bridge.py"
HOME = Path.home() / ".sonara"
STATE = HOME / "remix-pro-agent-status.json"
LOG = HOME / "remix-pro-v4-agent.log"
REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
PINNED_COMMIT = "7e3c3ba84a53d62d9e28cf15da9b2e69c3b5bcaa"
BLOBS = {
    "sonara_remix_pro_r2_agent.py": ("fc3eaf66588ed75bf106ea93f722b8df4754039c",
                                     "b982eda6e1f4c81ed99075478853e98276ccd718"),
    "sonara_remix_pro_ace_bridge.py": ("44d3ce740dac906481c9ecb8755a8318901f8b7f",
                                      "d946a5de652bbb7ce6365c0edaa9f496cca408ef"),
}
ALLOWED_IDLE = frozenset(("waiting_for_authorized_job", "waiting_for_pro_activation"))


class Blocked(RuntimeError):
    pass


def require(ok, why):
    if not ok:
        raise Blocked(why)


def git_blob(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def snapshot():
    try:
        item = json.loads(STATE.read_text(encoding="utf-8"))
        return item if isinstance(item, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def idle():
    data = snapshot()
    try:
        age = time.time() - float(data.get("updatedAt", 0))
    except (TypeError, ValueError):
        age = 999999
    return (data.get("revision") == REVISION
            and data.get("state") in ALLOWED_IDLE
            and not data.get("jobId") and not data.get("leaseId")
            and 0 <= age <= 40)


def exact_agent(pid):
    proc = Path("/proc") / str(pid)
    try:
        args = (proc / "cmdline").read_bytes().split(b"\0")
        cwd = (proc / "cwd").resolve(strict=True)
        for word in args[1:]:
            if b"sonara_remix_pro_r2_agent.py" not in word:
                continue
            arg = Path(os.fsdecode(word))
            return (arg if arg.is_absolute() else cwd / arg).resolve() == AGENT.resolve()
    except (OSError, RuntimeError, ValueError):
        pass
    return False


def workers():
    try:
        proc = Path("/proc").iterdir()
        return sorted(int(p.name) for p in proc
                      if p.name.isdigit() and exact_agent(int(p.name)))
    except OSError as exc:
        raise Blocked("Cannot inspect dedicated agent process") from exc


def mode_for(pid):
    try:
        words = [os.fsdecode(x) for x in
                 (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\0") if x]
    except OSError as exc:
        raise Blocked("Cannot read worker auth mode") from exc
    for index, value in enumerate(words):
        if value == "--auth-mode" and index + 1 < len(words):
            return words[index + 1]
        if value.startswith("--auth-mode="):
            return value.partition("=")[2]
    return "required"  # The agent's real argparse default


def download_verified():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    payloads = {}
    for name, (_, expected) in BLOBS.items():
        url = ("https://raw.githubusercontent.com/alo986761986-gif/"
               "Sonara-Enterprise/" + PINNED_COMMIT + "/molab/" + name)
        req = urllib.request.Request(url, headers={"User-Agent": "SONARA-V41-Hotfix"})
        with opener.open(req, timeout=30) as response:
            raw = response.read(200001)
        require(len(raw) < 200001 and git_blob(raw) == expected,
                "Pinned source integrity check failed: " + name)
        compile(raw, name, "exec")
        payloads[name] = raw
    return payloads


def wait_exit(pid, seconds=35):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        if not exact_agent(pid):
            return True
        time.sleep(1)
    return False


def launch(mode):
    LOG.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with LOG.open("ab") as log:
        os.chmod(LOG, 0o600)
        return subprocess.Popen([str(PYTHON), "-u", str(AGENT),
                                 "--auth-mode", mode],
                                stdin=subprocess.DEVNULL, stdout=log,
                                stderr=subprocess.STDOUT, cwd=ROOT,
                                start_new_session=True, close_fds=True)


def check_new_worker(proc, started):
    deadline = time.monotonic() + 80
    while time.monotonic() < deadline:
        require(proc.poll() is None, "New agent exited before readiness")
        data = snapshot()
        if (data.get("revision") == REVISION
                and data.get("state") in ALLOWED_IDLE
                and int(data.get("updatedAt") or 0) >= int(started)):
            return
        time.sleep(2)
    raise Blocked("New dedicated agent did not reach ready state")


def restore(old_files, mode):
    for name, data in old_files.items():
        target = ROOT / name
        with tempfile.NamedTemporaryFile(prefix=".sonara-v41-rollback-",
                                         dir=ROOT, delete=False) as f:
            backup = Path(f.name)
            f.write(data)
        os.chmod(backup, 0o600)
        os.replace(backup, target)
    if not workers():
        launch(mode)


def activate():
    require(PYTHON.is_file() and AGENT.is_file() and BRIDGE.is_file(),
            "Existing private Remix Pro environment missing")
    require(Path(sys.executable).resolve() == PYTHON.resolve(),
            "Run with the private Remix Pro Python")
    ps = workers()
    require(len(ps) == 1, "Expected exactly one dedicated agent, no process changed")
    require(idle(), "Worker is processing or status is stale; no modification")
    mode = mode_for(ps[0])
    require(mode in ("required", "none"), "Unknown existing auth mode")
    previous = {}
    updated = True
    for name, (old_sha, new_sha) in BLOBS.items():
        path = ROOT / name
        require(path.is_file() and not path.is_symlink(),
                "Missing or symlinked source; cannot update")
        contents = path.read_bytes()
        actual = git_blob(contents)
        require(actual in (old_sha, new_sha),
                "Unexpected local change to " + name)
        previous[name] = contents
        updated = updated and actual == new_sha

    print("SONARA_V41_ALREADY_INSTALLED=" + str(updated))
    if updated:
        print("SONARA_V41_RESULT=ALREADY_INSTALLED")
        return

    files = download_verified()
    require(idle() and workers() == ps, "Worker state changed before handoff")
    time.sleep(2)
    require(idle() and workers() == ps, "Worker no longer idle")
    os.kill(ps[0], signal.SIGTERM)
    require(wait_exit(ps[0]), "Worker did not stop gracefully; refusing to overwrite")

    wrote = False
    new_process = None
    try:
        for name, raw in files.items():
            with tempfile.NamedTemporaryFile(prefix=".sonara-v41-",
                                             dir=ROOT, delete=False) as f:
                temp = Path(f.name)
                f.write(raw)
            os.chmod(temp, 0o600)
            os.replace(temp, ROOT / name)
            wrote = True
        for name, (_, sha) in BLOBS.items():
            require(git_blob((ROOT / name).read_bytes()) == sha,
                    "New on-disk code integrity failed")

        # Preflight authenticates a heartbeat and runs the GPU CUDA kernel only.
        # Never call /pro-claim or ACE-Step /release_task here.
        probe = subprocess.run(
            [str(PYTHON), str(AGENT), "--auth-mode", mode, "--preflight"],
            cwd=ROOT, capture_output=True, text=True,
            stdin=subprocess.DEVNULL, timeout=180)
        require(probe.returncode == 0
                and "PRO_AGENT_AUTHENTICATED=True" in probe.stdout
                and "PRO_JOBS_CLAIMED=0" in probe.stdout,
                "V4.1 authentication/GPU preflight failed")

        started = time.time()
        new_process = launch(mode)
        check_new_worker(new_process, started)
        print("SONARA_V41_MODULES_VERIFIED=True")
        print("SONARA_V41_WORKER_READY=True")
        print("SONARA_MAIN_ACE_STEP_UNCHANGED=True")
        print("SONARA_V41_AUDIO_GENERATED=False")
        print("SONARA_V41_RESULT=SUCCESS")
    except BaseException:
        if new_process is not None and new_process.poll() is None:
            # Never terminate a worker that could have claimed an audio job.
            if not idle():
                print("SONARA_V41_ROLLBACK_BLOCKED=WORKER_MAY_HAVE_ACTIVE_JOB")
                raise
            os.kill(new_process.pid, signal.SIGTERM)
            require(wait_exit(new_process.pid), "New worker did not exit safely")
        if wrote:
            restore(previous, mode)
            print("SONARA_V41_ROLLBACK=RESTORED")
        else:
            launch(mode)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--confirm-maintenance", action="store_true")
    parser.add_argument("--skip-audio-qa", action="store_true")
    args = parser.parse_args()
    require(PYTHON.is_file(), "Private runtime unavailable")
    if not args.activate:
        print("SONARA_V41_AGENT_PROCESSES=" + str(len(workers())))
        print("SONARA_V41_IDLE=" + str(idle()))
        print("SONARA_V41_INSTALL_PERFORMED=False")
        return
    require(args.confirm_maintenance and args.skip_audio_qa,
            "Explicit maintenance confirmation and audio-QA waiver required")
    activate()


if __name__ == "__main__":
    try:
        main()
    except (Blocked, OSError, subprocess.SubprocessError, ValueError) as err:
        print("SONARA_V41_RESULT=BLOCKED")
        print("SONARA_V41_ERROR_CLASS=" + type(err).__name__)
        raise SystemExit(2)
