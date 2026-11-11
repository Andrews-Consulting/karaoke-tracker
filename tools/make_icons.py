"""Regenerates the app icons. Needs Pillow: pip install pillow

Run from the repo root:  python3 tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

BG = "#14121a"
ACCENT = "#ff5d8f"
LIGHT = "#f2eff8"
SIZE = 1024  # draw large, then scale down for smooth edges


def draw_icon() -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)
    cx = SIZE // 2
    # Everything stays inside the middle 60% so maskable crops are safe.
    d.polygon([(cx - 70, 470), (cx + 70, 470), (cx + 42, 800), (cx - 42, 800)], fill=LIGHT)  # handle
    d.rounded_rectangle([cx - 90, 440, cx + 90, 500], radius=24, fill=ACCENT)  # collar
    d.ellipse([cx - 130, 210, cx + 130, 470], fill=ACCENT)  # head
    return img


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    icon = draw_icon()
    for name, size in [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)]:
        icon.resize((size, size), Image.LANCZOS).save(out / name)
        print("wrote", out / name)


if __name__ == "__main__":
    main()
