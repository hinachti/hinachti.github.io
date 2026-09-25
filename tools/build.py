"""Renders the site from the templates and the current release.

    python tools/build.py

There is one source of truth for what the current version is, and it is not
this repository: it is latest.json in the releases project, the same file every
installed copy of the app reads when it checks for an update. This script reads
it, copies the apk next to the page, and fills the version into the page, the
download links and the structured data. Nothing here is typed by hand twice.

The output is plain files in public/, which is what GitLab Pages serves. No
build runs at publish time and the page asks no third party for anything.
"""

from datetime import datetime, timezone
import html
import json
import shutil
import sys
from pathlib import Path

SITE_URL = "https://hinachti.github.io"

SITE = Path(__file__).resolve().parent.parent
PUBLIC = SITE / "public"
TEMPLATES = SITE / "templates"

# The releases project: apks and latest.json, and the update url the app polls.
# It stays where it is for ever, because every installed copy points at it.
RELEASES = SITE.parent / "hinachti-releases"

# The contact line in the privacy policy. A personal address never goes on a
# public page: this takes a neutral one (hinachti.app@gmail.com or similar) when
# there is one, and until then the page says how to get in touch without it.
CONTACT_EMAIL = ""

CONTACT_FALLBACK = (
    "אין כאן כתובת אישית. אם משהו באפליקציה לא בסדר, או שיש לך שאלה על "
    "הפרטיות, אפשר לפנות דרך האדם שממנו קיבלת את הקישור, וברגע שהאפליקציה "
    "תהיה בחנות תופיע גם כתובת ליצירת קשר בדף שלה ב-Google Play."
)

# Google Play closed testing. Fill both in once the closed track is open, and
# the tester section appears on the page by itself; leave them empty and the
# section explains the situation without dead links.
TESTER_GROUP_URL = ""   # the Google group people join, e.g. https://groups.google.com/g/...
TESTER_OPTIN_URL = ""   # the opt-in link Play Console shows for the closed test

MONTHS = [
    "בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני",
    "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר",
]

# Caption and alt text per screenshot, in the order they appear.
SHOTS = [
    ("morning", "הבוקר", "מסך הבוקר: השעה, השבוע האחרון, הזמן שנותר עד סוף זמן תפילה וכפתור «הנחתי»"),
    ("done", "אחרי הדיווח", "אותו מסך אחרי הדיווח: «הונח היום · 3 ימים ברצף», והשמש על מסלול היום"),
    ("order", "סדר ההנחה", "סדר הנחת תפילין: בחירת נוסח אשכנז, ספרד או חב״ד, והברכות בניקוד מלא"),
    ("parsha", "פרשת השבוע", "פרשת השבוע «ויצא», עם הסבר קצר בעברית של ימינו לכל עלייה"),
    ("calendar", "לוח השנה", "לוח שנה לנובמבר 2026 עם התאריך העברי בכל יום, והימים שהונח מסומנים בירוק"),
    ("history", "ההיסטוריה שלי", "ההיסטוריה: חמישה ימים שהונח, יום שפוספס, שלושה ימים ברצף, ורשימת 30 הימים האחרונים"),
    ("psalms", "תהילים", "תהילים: כל 150 הפרקים ברשימה, עם חיפוש לפי מספר פרק"),
    ("psalm", "פרק מנוקד", "תהילים פרק יג בניקוד מלא, פסוק בכל שורה"),
]

FAQ = [
    (
        "האם האפליקציה בחינם?",
        "כן, לגמרי. אין פרסומות, אין מנוי, ואין רכישות בתוך האפליקציה. גם לא יהיו.",
    ),
    (
        "למה היא לא בחנות של גוגל?",
        "היא בדרך לשם. גוגל דורשת מחשבון מפתח חדש שתים עשרה אנשים יבדקו את האפליקציה ארבעה עשר "
        "יום ברצף לפני שמותר לפרסם אותה לכולם. עד שזה יושלם, מתקינים אותה מכאן, וזו בדיוק אותה "
        "אפליקציה.",
    ),
    (
        "בטוח להתקין קובץ APK?",
        "הקובץ כאן חתום בחתימה שלנו, ואנדרואיד מוודא בעצמו שכל עדכון עתידי נושא בדיוק את אותה "
        "חתימה, אחרת הוא מסרב להתקין. גם האפליקציה בודקת את החתימה לפני שהיא מעבירה קובץ "
        "להתקנה. האזהרה שאנדרואיד מציג בפעם הראשונה היא האזהרה הרגילה על כל קובץ שלא הגיע "
        "מהחנות, ולא סימן לבעיה.",
    ),
    (
        "איך מקבלים עדכונים?",
        "מתוך האפליקציה. היא בודקת פעם ביום אם יצאה גרסה חדשה, ואם כן מציעה להוריד ולהתקין "
        "במקום. אפשר גם לבדוק ידנית בהגדרות ← עדכונים, ואפשר לכבות את הבדיקה לגמרי.",
    ),
    (
        "האפליקציה עוקבת אחריי?",
        "לא. אין חשבון, אין הרשמה, אין אנליטיקה ואין מזהה משתמש. ההיסטוריה נשמרת במכשיר שלך. "
        "הגרסה שתגיע לחנות נבנית בלי הרשאת אינטרנט בכלל, והגרסה שמורידים כאן ניגשת לרשת רק "
        "לבדיקת עדכונים.",
    ),
    (
        "איזה אנדרואיד צריך?",
        "אנדרואיד 8 ומעלה, כלומר כמעט כל טלפון מהשנים האחרונות. לאייפון אין גרסה.",
    ),
    (
        "היא נועלת לי את הטלפון?",
        "רק אם תבחר בזה. כברירת מחדל היא מזכירה בהתראה ובווידג׳ט ולא חוסמת כלום. מי שרוצה יכול "
        "להפעיל בהגדרות מצב שבו האפליקציה היא מסך הבית ונפתחת אחרי הדיווח, וגם אז אפשר לבטל "
        "בכל רגע.",
    ),
    (
        "מה קורה להיסטוריה שלי אם אחליף טלפון?",
        "יש שלוש רשתות ביטחון: הגיבוי של אנדרואיד לחשבון Google, תיקיית גיבוי במכשיר שנכתבת "
        "אחרי כל שינוי, וייצוא לקובץ שאתה שומר איפה שתרצה ומייבא במכשיר החדש.",
    ),
    (
        "יש בה מנהגים שונים?",
        "כן. שלושה נוסחים לסדר ההנחה, בחירה אם מניחים בחול המועד, דקות הדלקת הנרות לפי מנהג "
        "המקום, ולוח חגים שונה בארץ ובחו״ל.",
    ),
    (
        "מצאתי טעות, או שיש לי רעיון",
        "יופי, זה בדיוק מה שעוזר עכשיו. אפשר לכתוב לכתובת שבמדיניות הפרטיות, ואם זו טעות בטקסט "
        "או בזמנים, כדאי לצרף צילום מסך.",
    ),
]


def release() -> dict:
    data = json.loads((RELEASES / "latest.json").read_text(encoding="utf-8"))
    apk = RELEASES / f"hinachti-{data['versionName']}.apk"
    if not apk.exists():
        raise SystemExit(f"the apk named by latest.json is missing: {apk}")
    when = datetime.fromtimestamp(apk.stat().st_mtime, tz=timezone.utc)
    return {
        "version": data["versionName"],
        "code": data["versionCode"],
        "notes": data["notes"],
        "apk": apk,
        "size_mb": f"{apk.stat().st_size / 1024 / 1024:.1f}",
        "date_iso": when.strftime("%Y-%m-%d"),
        "date_he": f"{when.day} {MONTHS[when.month - 1]} {when.year}",
    }


def shots_html() -> str:
    out = []
    for slug, caption, alt in SHOTS:
        out.append(
            f'      <figure class="shot">\n'
            f'        <img src="/img/{slug}.webp" srcset="/img/{slug}.webp 540w, /img/{slug}@2x.webp 1080w"\n'
            f'             sizes="232px" width="232" height="412" loading="lazy" decoding="async"\n'
            f'             alt="{html.escape(alt, quote=True)}">\n'
            f'        <figcaption>{html.escape(caption)}</figcaption>\n'
            f'      </figure>'
        )
    return "\n".join(out).strip()


def faq_html() -> str:
    out = []
    for question, answer in FAQ:
        # The extra wrapper is what lets the answer unfold: a grid row can be
        # animated from 0fr to 1fr, a height of "auto" cannot.
        out.append(
            f"      <details>\n"
            f"        <summary>{html.escape(question)}</summary>\n"
            f"        <div class=\"answer\"><div><p>{html.escape(answer)}</p></div></div>\n"
            f"      </details>"
        )
    return "\n".join(out).strip()


def faq_jsonld() -> str:
    return json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": q,
                    "acceptedAnswer": {"@type": "Answer", "text": a},
                }
                for q, a in FAQ
            ],
        },
        ensure_ascii=False,
        indent=2,
    )


def testers_html() -> str:
    """The section that asks for help getting into the store."""
    if TESTER_GROUP_URL and TESTER_OPTIN_URL:
        buttons = (
            f'      <div class="row">\n'
            f'        <a class="btn" href="{html.escape(TESTER_GROUP_URL, quote=True)}">1. הצטרפות לקבוצת הבודקים</a>\n'
            f'        <a class="btn-ghost" href="{html.escape(TESTER_OPTIN_URL, quote=True)}">2. אישור ההשתתפות בבדיקה</a>\n'
            f'      </div>\n'
            f'      <p class="testers-note">\n'
            f'        אחרי שני הצעדים האלה מתקינים את האפליקציה מהחנות, ומשאירים אותה מותקנת ארבעה עשר יום.\n'
            f'        מספיק לפתוח אותה מדי פעם. אפשר לפרוש בכל רגע.\n'
            f'      </p>'
        )
    else:
        buttons = (
            '      <p class="testers-note">\n'
            '        קישור ההצטרפות ייפתח כאן ברגע שהבדיקה הסגורה תתחיל. בינתיים אפשר פשוט להוריד\n'
            '        את האפליקציה מהכפתור שלמעלה, וזה עוזר לא פחות.\n'
            '      </p>'
        )
    return (
        '  <section class="wrap">\n'
        '    <div class="testers reveal">\n'
        '      <p class="eyebrow">אפשר לעזור</p>\n'
        '      <h2>רוצה שהיא תגיע לחנות?</h2>\n'
        '      <p class="lead" style="margin-bottom: 0">\n'
        '        גוגל דורשת מחשבון מפתח חדש שתים עשרה אנשים יבדקו את האפליקציה ארבעה עשר יום ברצף\n'
        '        לפני שמותר לפרסם אותה לכולם. זה לוקח שתי דקות, וזה הדבר היחיד שמפריד בין האפליקציה\n'
        '        לבין החנות.\n'
        '      </p>\n'
        f'{buttons}\n'
        '    </div>\n'
        '  </section>'
    )


def render(name: str, values: dict) -> str:
    text = (TEMPLATES / name).read_text(encoding="utf-8")
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", str(value))
    left = [line for line in text.splitlines() if "{{" in line]
    if left:
        raise SystemExit("a placeholder was left unfilled:\n" + "\n".join(left[:5]))
    return text


def main() -> None:
    # A Windows console defaults to cp1252, which cannot print a Hebrew date.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    rel = release()
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M")
    apk_name = rel["apk"].name

    # The apk is served from the site as well as from the releases project, so
    # a person who found the page never has to leave it.
    for old in PUBLIC.glob("hinachti-*.apk"):
        if old.name != apk_name:
            old.unlink()
    shutil.copy2(rel["apk"], PUBLIC / apk_name)

    # The same version file, pointed at this site's own copy of the apk. Only
    # the url differs from the releases project's file: that one names the
    # releases project, which carries a personal username, and nothing public
    # here should. The app keeps reading its own file, not this one.
    version_file = json.loads((RELEASES / "latest.json").read_text(encoding="utf-8"))
    version_file["url"] = f"{SITE_URL}/{apk_name}"
    (PUBLIC / "latest.json").write_text(
        json.dumps(version_file, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    values = {
        "SITE": SITE_URL,
        "STAMP": stamp,
        "VERSION": rel["version"],
        "DATE_HE": rel["date_he"],
        "DATE_ISO": rel["date_iso"],
        "SIZE_MB": rel["size_mb"],
        "APK": apk_name,
        "NOTES": html.escape(rel["notes"]),
        "SHOTS": shots_html(),
        "FAQ_HTML": faq_html(),
        "FAQ_JSONLD": faq_jsonld(),
        "TESTERS": testers_html(),
    }
    (PUBLIC / "index.html").write_text(render("index.html", values), encoding="utf-8")

    privacy = PUBLIC / "privacy"
    privacy.mkdir(exist_ok=True)
    (privacy / "index.html").write_text(
        render(
            "privacy.html",
            {
                "SITE": SITE_URL,
                "STAMP": stamp,
                "CONTACT": (
                    f'<a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>'
                    if CONTACT_EMAIL
                    else CONTACT_FALLBACK
                ),
            },
        ),
        encoding="utf-8",
    )

    (PUBLIC / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n", encoding="utf-8"
    )
    (PUBLIC / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{SITE_URL}/</loc><lastmod>{rel['date_iso']}</lastmod><priority>1.0</priority></url>\n"
        f"  <url><loc>{SITE_URL}/privacy/</loc><lastmod>{rel['date_iso']}</lastmod><priority>0.3</priority></url>\n"
        "</urlset>\n",
        encoding="utf-8",
    )

    print(f"built {rel['version']} ({rel['code']}), apk {rel['size_mb']} MB, {rel['date_he']}")


if __name__ == "__main__":
    main()
