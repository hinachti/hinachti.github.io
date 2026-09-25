"""Turns a screen recording of the app into the frames the page scrubs.

    # 1. record on the emulator (morning state, nothing marked yet)
    adb shell screenrecord --bit-rate 16000000 --time-limit 12 /sdcard/rec.mp4
    #    while it records: wait, tap "הנחתי" (540,1880), tap "כן, הנחתי" (540,1297)
    adb pull /sdcard/rec.mp4 rec.mp4

    # 2. this script
    python tools/make-reel.py rec.mp4

Why stills and not a video file: the page moves the recording with the scroll
rather than playing it, and a seeked video stutters on a phone; iOS may refuse
to seek one at all. Thirty-odd webp frames are 260KB, decode instantly, and are
fetched only when the section comes near.

The recording must be of the real app. Nothing here is staged footage of a
person and nothing is generated: what the visitor sees is what they install.
"""

from pathlib import Path
import shutil
import subprocess
import sys

from PIL import Image

SITE = Path(__file__).resolve().parent.parent
OUT = SITE / "public" / "reel"

# The status bar carries the emulator's own clock, which is not the app's, so
# the top 60px of the 540x1200 recording is cropped away.
# Recorded at the device's own 1080x2400 and scaled down, which is the only
# way the Hebrew comes out sharp on a retina screen: upscaling a small capture
# just smears it.
CROP = "crop=1080:2280:0:120"
FPS = 10
WIDTH = 760
QUALITY = 76
# Every second frame: still fluid under a thumb, half the bytes.
KEEP_EVERY = 2


def main(recording: Path) -> None:
    if not recording.exists():
        raise SystemExit(f"no recording at {recording}")
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is not on PATH")

    work = SITE / ".reel-frames"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir()

    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(recording),
         "-vf", f"{CROP},fps={FPS},scale={WIDTH}:-2", str(work / "f%03d.png")],
        check=True,
    )

    frames = sorted(work.glob("*.png"))[::KEEP_EVERY]
    if not frames:
        raise SystemExit("ffmpeg produced no frames")

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        old.unlink()

    total = 0
    for index, frame in enumerate(frames):
        target = OUT / f"{index:02d}.webp"
        Image.open(frame).convert("RGB").save(target, quality=QUALITY, method=6)
        total += target.stat().st_size

    shutil.rmtree(work)
    print(f"{len(frames)} frames, {total / 1024:.0f}KB total, {WIDTH}px wide")
    print("now set COUNT in public/site.js to", len(frames))


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "rec.mp4"))
