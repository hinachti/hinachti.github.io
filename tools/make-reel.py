"""Turns a screen recording of the app into the frames the page scrubs.

    # 1. record on the emulator (morning state, nothing marked yet)
    adb shell screenrecord --bit-rate 20000000 --time-limit 11 /sdcard/rec.mp4
    #    while it records: wait, tap "הנחתי" (540,1878), tap "כן, הנחתי" (540,1297)
    adb pull /sdcard/rec.mp4 rec.mp4

    # 2. this script
    python tools/make-reel.py rec.mp4

Why stills and not a video file: the page moves the recording with the scroll
rather than playing it, and a seeked video stutters on a phone; iOS may refuse
to seek one at all.

Every frame of motion is kept, at the full 30 a second, and a frame that is the
same as the one before it is not stored twice: the stretches where the screen
stands still (the morning screen, the open question) cost one file each. Those
still stretches are also shortened to a set number of scroll steps, so the
reader does not scroll through seconds of nothing. What the page gets:

    public/reel/000.webp ...   each distinct picture, once
    public/reel/reel.json      {"count": files, "seq": [file for each step],
                                "marks": [step where each motion begins, 0..1]}

The recording must be of the real app. Nothing here is staged footage of a
person and nothing is generated: what the visitor sees is what they install.
"""

from pathlib import Path
import json
import shutil
import subprocess
import sys

from PIL import Image, ImageChops

SITE = Path(__file__).resolve().parent.parent
OUT = SITE / "public" / "reel"

# The status bar carries the emulator's own clock, which is not the app's, so
# the top 120px of the 1080x2400 recording is cropped away.
# Recorded at the device's own resolution and scaled down, which is the only
# way the Hebrew comes out sharp on a retina screen.
CROP = "crop=1080:2280:0:120"
FPS = 30
WIDTH = 760
QUALITY = 72
# Scroll steps a still stretch is given: the first (the morning screen, while
# the reader takes in the first line) and every one after it.
HOLD_FIRST = 24
HOLD_LATER = 18
# Below this, two frames are the same picture (encoder noise, not motion).
SAME = 3
# A third of a second without change is a still stretch; less is a beat
# inside the motion and keeps its own length.
STILL = FPS // 3


def same(a: Image.Image, b: Image.Image) -> bool:
    return max(high for _, high in ImageChops.difference(a, b).getextrema()) <= SAME


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
         "-vf", f"{CROP},fps={FPS},scale={WIDTH}:-2", str(work / "f%04d.png")],
        check=True,
    )
    paths = sorted(work.glob("*.png"))
    if not paths:
        raise SystemExit("ffmpeg produced no frames")

    # Runs of the same picture: [(first path, how many frames)].
    runs: list[list] = []
    previous = None
    for path in paths:
        image = Image.open(path).convert("RGB")
        if previous is not None and same(image, previous):
            runs[-1][1] += 1
        else:
            runs.append([path, 1])
            previous = image

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        old.unlink()

    seq: list[int] = []
    motion_starts: list[int] = []
    total = 0
    holds = 0
    for index, (path, length) in enumerate(runs):
        target = OUT / f"{index:03d}.webp"
        Image.open(path).convert("RGB").save(target, quality=QUALITY, method=6)
        total += target.stat().st_size
        if length >= STILL:
            # A still stretch: shortened, but never lengthened.
            steps = min(length, HOLD_FIRST if holds == 0 else HOLD_LATER)
            holds += 1
            seq.extend([index] * steps)
            # The frame after a stretch is where the next motion begins.
            motion_starts.append(len(seq))
        else:
            seq.extend([index] * length)

    last = len(seq) - 1
    marks = [0] + [round(s / last, 4) for s in motion_starts if s <= last]
    (OUT / "reel.json").write_text(
        json.dumps({"count": len(runs), "seq": seq, "marks": marks}, separators=(",", ":")),
        encoding="utf-8",
    )

    shutil.rmtree(work)
    print(f"{len(paths)} frames recorded, {len(runs)} distinct kept, {len(seq)} scroll steps")
    print(f"{total / 1024:.0f}KB total, {WIDTH}px wide; motion begins at {marks}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "rec.mp4"))
