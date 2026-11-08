"""Offline real-codec regression for SONARA Remix Pro input normalization.

No GPU, customer audio, secrets, website calls, or external downloads.
"""
import ast
import functools
import json
import shutil
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path

ROOT=Path(__file__).resolve().parent
AGENT=ROOT/"sonara_remix_pro_r2_agent.py"


class ProAgentError(RuntimeError):
    pass


def source_functions():
    tree=ast.parse(AGENT.read_text())
    names={"multiformat_ready","probe_audio_source","verify_audio_source",
           "normalized_audio_source","pro_heartbeat_payload"}
    funcs=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in names]
    assert {node.name for node in funcs}==names
    code=compile(ast.Module(body=funcs,type_ignores=[]),str(AGENT),"exec")
    scope={
        "Path":Path,"shutil":shutil,"subprocess":subprocess,"json":json,
        "lru_cache":functools.lru_cache,"ProAgentError":ProAgentError,
        "SourceTransferError":ProAgentError,
        "MAX_WAV_BYTES":512*1024*1024,
        "SOURCE_FORMATS":frozenset(("wav","mp3","flac","m4a","mp4",
            "aac","ogg","oga","opus","aif","aiff","aifc",
            "webm","wma","caf","amr","ac3")),
    }
    def validate_wav(path):
        try:
            with wave.open(str(path),"rb") as audio:
                if not 10<=audio.getnframes()/audio.getframerate()<=900 or audio.getnchannels() not in (1,2):
                    raise ProAgentError("bad WAV duration or channels")
        except wave.Error as exc:
            raise ProAgentError("unsupported WAV container") from exc
        return Path(path)
    scope["validate_wav"]=validate_wav
    exec(code,scope)
    return scope


class OfflineMultiFormatTests(unittest.TestCase):
    def test_agent_syntax_and_verified_heartbeat_contract(self):
        f=source_functions()
        self.assertIn("multiformat_ready",f)
        self.assertEqual(set(f["pro_heartbeat_payload"]().keys()),{"gpuReady","formatsReady"})
        self.assertTrue(f["pro_heartbeat_payload"]()["gpuReady"])

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                         "FFmpeg or FFprobe unavailable")
    def test_four_channel_source_wav_is_normalized_to_safe_stereo_pcm(self):
        f=source_functions()
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            src=root/"multichannel.wav"
            subprocess.run([
                "ffmpeg","-nostdin","-hide_banner","-loglevel","error",
                "-f","lavfi","-i","anullsrc=r=48000:cl=quad",
                "-t","10.2","-c:a","pcm_s24le","-y",str(src)
            ],check=True,capture_output=True,timeout=60)
            self.assertEqual(f["verify_audio_source"](src,"wav"),src)
            normalized=f["normalized_audio_source"](src,root/"stereo.wav")
            self.assertEqual(normalized.name,"stereo.wav")
            with wave.open(str(normalized),"rb") as audio:
                self.assertEqual(audio.getnchannels(),2)
                self.assertEqual(audio.getframerate(),44100)
                self.assertGreater(audio.getnframes()/44100,10)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"),
                         "System FFmpeg unavailable; actual GPU heartbeat must remain fail-closed")
    def test_real_mp3_decodes_to_private_pcm_wav_and_rejects_video(self):
        f=source_functions()
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            mp3=root/"song.mp3"
            subprocess.run([
                "ffmpeg","-nostdin","-hide_banner","-loglevel","error",
                "-f","lavfi","-i","sine=frequency=440:sample_rate=44100",
                "-t","10.2","-ac","2","-codec:a","libmp3lame","-y",str(mp3)
            ],check=True,capture_output=True,timeout=50)
            f["verify_audio_source"](mp3,"mp3")
            output=f["normalized_audio_source"](mp3,root/"normalized.wav")
            self.assertTrue(output.is_file())
            with wave.open(str(output),"rb") as audio:
                self.assertEqual(audio.getnchannels(),2)
                self.assertEqual(audio.getframerate(),44100)
                self.assertGreater(audio.getnframes()/44100,10)
            with self.assertRaises(ProAgentError):
                f["verify_audio_source"](mp3,"wav")
            video=root/"contains-video.mp4"
            subprocess.run([
                "ffmpeg","-nostdin","-hide_banner","-loglevel","error",
                "-f","lavfi","-i","color=c=black:s=32x32:r=1",
                "-f","lavfi","-i","sine=frequency=300:sample_rate=44100",
                "-t","10.2","-c:v","mpeg4","-c:a","aac","-y",str(video)
            ],check=True,capture_output=True,timeout=60)
            with self.assertRaises(ProAgentError):
                f["verify_audio_source"](video,"mp4")


if __name__=="__main__":
    unittest.main()
