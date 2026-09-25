"""Turns the app's own fonts, icon and store screenshots into web assets.

Run once, or again whenever the app's look changes:

    python tools/make-assets.py

Everything it writes lands in public/ and is committed, so the site never
builds anything at publish time and never asks a third party for a font.

The fonts are the app's own files, subsetted to the characters a Hebrew page
uses and converted to woff2. They are SIL OFL, which allows this as long as the
licence travels with them: public/fonts/OFL-*.txt.
"""

from pathlib import Path
import subprocess
import sys

from PIL import Image

APP = Path(r"C:\Users\yamki\hinachti")
SITE = Path(__file__).resolve().parent.parent
PUBLIC = SITE / "public"

# Hebrew, its presentation forms, Latin, digits and the punctuation the page
# uses. Anything outside this falls back to a system font, so it stays generous.
UNICODES = (
    "U+0020-007E,U+00A0-00FF,U+0590-05FF,U+200E-200F,U+2010-2027,"
    "U+FB1D-FB4F,U+2190-21FF,U+2022,U+00AB,U+00BB,U+FEFF"
)


def fonts() -> None:
    out = PUBLIC / "fonts"
    for name, web in (("heebo", "heebo.woff2"), ("frank_ruhl_libre", "frank-ruhl-libre.woff2")):
        src = APP / "app/src/main/res/font" / f"{name}.ttf"
        dst = out / web
        subprocess.run(
            [
                sys.executable, "-m", "fontTools.subset", str(src),
                f"--unicodes={UNICODES}",
                "--flavor=woff2",
                "--layout-features=*",
                # No axis options: subset keeps fvar as it is, which is what
                # gives the page every weight from one file.
                f"--output-file={dst}",
            ],
            check=True,
        )
        print(f"{web}: {src.stat().st_size // 1024}KB -> {dst.stat().st_size // 1024}KB")


def icon() -> None:
    src = Image.open(APP / "store/graphics/play_icon_512.png").convert("RGBA")
    for size, name in ((512, "icon-512.png"), (180, "icon-180.png"), (192, "icon-192.png")):
        src.resize((size, size), Image.LANCZOS).save(PUBLIC / "img" / name, optimize=True)
    # A .ico so old browsers and Windows shortcuts have something to show.
    src.resize((64, 64), Image.LANCZOS).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("icons written")


# The store screenshots, in the order they appear on the page, with the caption
# and the alt text a screen reader gets.
SHOTS = [
    ("1.png", "morning", "הבוקר", "מסך הבוקר: השעה, השבוע האחרון, הזמן שנותר עד סוף זמן תפילה וכפתור «הנחתי»"),
    ("2.png", "done", "אחרי הדיווח", "אותו מסך אחרי הדיווח: «הונח היום · 3 ימים ברצף», והשמש על מסלול היום"),
    ("3.png", "order", "סדר ההנחה", "סדר הנחת תפילין: בחירת נוסח אשכנז, ספרד או חב״ד, ולשם ייחוד והברכות בניקוד מלא"),
    ("4.png", "parsha", "פרשת השבוע", "פרשת השבוע «ויצא», עם הסבר קצר בעברית של ימינו לכל עלייה"),
    ("5.png", "calendar", "לוח השנה", "לוח שנה לנובמבר 2026 עם התאריך העברי בכל יום, הימים שהונח מסומנים בירוק"),
    ("6.png", "psalms", "תהילים", "תהילים: כל 150 הפרקים ברשימה, עם חיפוש לפי מספר פרק"),
    ("7.png", "psalm", "פרק מנוקד", "תהילים פרק יג בניקוד מלא, פסוק בכל שורה"),
    ("8.png", "history", "ההיסטוריה שלי", "ההיסטוריה: 5 ימים שהונח, יום אחד שפוספס, 3 ימים ברצף, ורשימת 30 הימים האחרונים"),
]


def screenshots() -> None:
    out = PUBLIC / "img"
    for src_name, slug, _caption, _alt in SHOTS:
        img = Image.open(APP / "store/screenshots" / src_name).convert("RGB")
        # 1350x2400 is four times what the page ever shows. Two widths, so a
        # phone does not download a desktop-sized picture.
        for width, suffix in ((540, ""), (1080, "@2x")):
            height = round(img.height * width / img.width)
            img.resize((width, height), Image.LANCZOS).save(
                out / f"{slug}{suffix}.webp", quality=82, method=6
            )
    print("screenshots written")


def og_image() -> None:
    """The picture that appears when the link is pasted into WhatsApp."""
    w, h = 1200, 630
    card = Image.new("RGB", (w, h), (14, 12, 9))
    # A soft dawn glow behind the icon, drawn the cheap way: a scaled-up blur of
    # a few warm pixels.
    glow = Image.new("RGB", (16, 16), (14, 12, 9))
    glow.putpixel((7, 7), (224, 169, 74))
    glow.putpixel((8, 7), (224, 169, 74))
    glow.putpixel((7, 8), (184, 130, 46))
    glow.putpixel((8, 8), (184, 130, 46))
    card.paste(glow.resize((w, h * 2), Image.BICUBIC).crop((0, h // 2, w, h + h // 2)), (0, 0))

    shot = Image.open(PUBLIC / "img/morning@2x.webp").convert("RGB")
    shot_h = 560
    shot_w = round(shot.width * shot_h / shot.height)
    card.paste(shot.resize((shot_w, shot_h), Image.LANCZOS), (w - shot_w - 90, (h - shot_h) // 2))

    ico = Image.open(APP / "store/graphics/play_icon_512.png").convert("RGBA").resize((180, 180), Image.LANCZOS)
    card.paste(ico, (110, 90), ico)
    card.save(PUBLIC / "img/og.png", optimize=True)
    print("og image written")


if __name__ == "__main__":
    (PUBLIC / "img").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "fonts").mkdir(parents=True, exist_ok=True)
    fonts()
    icon()
    screenshots()
    og_image()
