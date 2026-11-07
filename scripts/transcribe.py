#!/usr/bin/env python3
"""Transcribe an audio or video file to timestamped plain text.

Usage:
    python scripts/transcribe.py <audio-or-video> [--model small] [--lang zh]

Output is one line per segment: ``[HH:MM:SS] text``.

Requires ffmpeg on PATH (used to normalise any input to a 16 kHz mono WAV) and
the optional ``faster_whisper`` package. Everything else is stdlib. When
``faster_whisper`` is missing the script exits with code 2 and a pip hint, so a
caller (e.g. the @ears branch) can tell "no ASR available" apart from "the file
is broken" and never invents a transcript.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile


def die(msg: str, code: int = 1) -> "None":
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def format_timestamp(seconds: float) -> str:
    total = int(seconds)
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def extract_audio(source: str, out_wav: str) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        die("ffmpeg not found on PATH; install ffmpeg and retry")
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        source,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        out_wav,
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", "replace").strip()
        die(f"ffmpeg failed to extract audio from {source}:\n{detail}")


def main(argv: "list[str] | None" = None) -> int:
    parser = argparse.ArgumentParser(description="Transcribe audio/video to [HH:MM:SS] lines.")
    parser.add_argument("source", help="audio or video file to transcribe")
    parser.add_argument("--model", default="small", help="faster-whisper model size (default: small)")
    parser.add_argument("--lang", default=None, help="language code, e.g. zh or en (default: auto)")
    args = parser.parse_args(argv)

    source = os.path.abspath(args.source)
    if not os.path.isfile(source):
        die(f"file not found: {source}")

    try:
        from faster_whisper import WhisperModel  # type: ignore[import-not-found]
    except ImportError:
        die("faster_whisper not installed; run: pip install faster-whisper", code=2)

    tmp_dir = tempfile.mkdtemp(prefix="transcribe-")
    wav = os.path.join(tmp_dir, "audio.wav")
    try:
        extract_audio(source, wav)
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(wav, language=args.lang, vad_filter=True)
        for segment in segments:
            text = (segment.text or "").strip()
            if text:
                print(f"[{format_timestamp(segment.start)}] {text}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
