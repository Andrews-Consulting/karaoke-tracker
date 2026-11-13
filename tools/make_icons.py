"""Regenerates the Mic Jaunt app icons. Needs Pillow: pip install pillow

Run from the repo root:  python3 tools/make_icons.py

A microphone leaning into a jaunt, with three motion arcs, in the app's
colours. Everything important stays inside the middle 60% of the square so
Android's maskable crop and iOS's rounded corners never cut it.
"""
from pathlib import Path

from PIL import Image, ImageDraw

BG = "#14121a"
ACCENT = "#ffb347"  # keep in step with --accent in css/app.css
LIGHT = "#f4efe4"
MUTED = "#b5ad9d"
SIZE = 1024  # draw large, then scale down for smooth edges
TILT = 24  # degrees the mic leans to the right, mid-stride


def draw_mic(size: int) -> Image.Image:
    """The microphone upright on a transparent layer, centred."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = size // 2
    # Handle, tapering down.
    d.polygon([(cx - 62, 520), (cx + 62, 520), (cx + 36, 790), (cx - 36, 790)], fill=LIGHT)
    d.ellipse([cx - 36, 760, cx + 36, 820], fill=LIGHT)
    # Collar.
    d.rounded_rectangle([cx - 84, 486, cx + 84, 540], radius=22, fill=ACCENT)
    # Head: a capsule with a grille.
    d.rounded_rectangle([cx - 118, 230, cx + 118, 510], radius=118, fill=ACCENT)
    for y in range(300, 470, 34):
        d.line([(cx - 92, y), (cx + 92, y)], fill=BG, width=9)
    for x in range(cx - 70, cx + 71, 35):
        d.line([(x, 268), (x, 480)], fill=BG, width=9)
    return layer


def draw_icon() -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)
    cx = SIZE // 2
    pivot = (cx - 40, 560)  # the mic sits a little left, leaning right
    mic = draw_mic(SIZE).rotate(-TILT, resample=Image.BICUBIC, center=pivot)
    # Shift the layer so the mic is drawn about the pivot above.
    shifted = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shifted.paste(mic, (pivot[0] - cx, 0), mic)
    # Three sound waves off the top right of the head, which after the tilt
    # sits about 190 px above the pivot along the mic's axis.
    import math

    head = (pivot[0] + 190 * math.sin(math.radians(TILT)), pivot[1] - 190 * math.cos(math.radians(TILT)))
    for i, (radius, width) in enumerate([(200, 24), (255, 18), (310, 13)]):
        box = [head[0] - radius, head[1] - radius, head[0] + radius, head[1] + radius]
        d.arc(box, start=285, end=345, fill=ACCENT if i == 0 else MUTED, width=width)
    img.paste(shifted, (0, 0), shifted)
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
