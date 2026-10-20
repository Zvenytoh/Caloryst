"""Converts the official CIQUAL XLSX (ANSES, Etalab 2.0) into ciqual.tsv for the Kalo catalog.

Usage: python -I convert_ciqual.py "Table Ciqual 2025_FR_2025_11_03.xlsx" ciqual.tsv
Source: https://doi.org/10.57745/RDMHWY

Rules: "-" or empty = unknown (left blank); "traces" and "< x" = 0 (below quantification);
values keep at most 3 decimals; foods without energy, protein, carbohydrates and fat are skipped;
sugars above carbohydrates and saturated fat above fat are dropped as inconsistent.
"""

import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# Output column -> CIQUAL spreadsheet column (2025 layout), with optional fallback.
MAIN = {"kcal": ("K", "M"), "protein": ("O", "P"), "carbs": ("Q",), "fat": ("R",)}
DETAILS = {
    "fiberG": "AA", "sugarsG": "S", "saturatedFatG": "AF", "saltG": "AX",
    "vitaminAUg": "BK", "vitaminCMg": "BU", "vitaminDUg": "BN", "vitaminEMg": "BR",
    "folateUg": "CB", "vitaminB12Ug": "CE", "calciumMg": "AY", "ironMg": "BB",
    "magnesiumMg": "BD", "potassiumMg": "BG", "zincMg": "BJ",
}
LIMIT = {"fiberG": 100, "sugarsG": 100, "saturatedFatG": 100, "saltG": 100}


def rows(path):
    z = zipfile.ZipFile(path)
    shared = ["".join(t.text or "" for t in si.iter(NS + "t"))
              for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(NS + "si")]
    sheet = sorted(n for n in z.namelist() if n.startswith("xl/worksheets/sheet"))[0]
    for row in ET.fromstring(z.read(sheet)).iter(NS + "row"):
        out = {}
        for c in row.findall(NS + "c"):
            col = re.match(r"[A-Z]+", c.get("r")).group()
            v = c.find(NS + "v")
            if c.get("t") == "inlineStr":
                out[col] = "".join(x.text or "" for x in c.iter(NS + "t"))
            elif v is not None:
                out[col] = shared[int(v.text)] if c.get("t") == "s" else v.text
        yield out


def value(raw):
    """Decimal, Decimal(0) for traces / below limit, or None when unknown."""
    s = (raw or "").strip().lower().replace(",", ".")
    if s in ("", "-"):
        return None
    if s == "traces" or s.startswith("<"):
        return Decimal(0)
    try:
        d = Decimal(s)
    except InvalidOperation:
        return None
    return d.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP).normalize() if d >= 0 else None


def fmt(d):
    return "" if d is None else format(d.normalize(), "f")


def main(src, dst):
    it = rows(src)
    next(it)  # header
    kept = skipped = dropped = 0
    with open(dst, "w", encoding="utf-8", newline="\n") as out:
        out.write("\t".join(["code", "name", *MAIN, *DETAILS]) + "\n")
        for r in it:
            name = re.sub(r"\s+", " ", r.get("H", "")).strip()
            main_values = {k: next((v for c in cols if (v := value(r.get(c))) is not None), None) for k, cols in MAIN.items()}
            m = main_values
            if not name or len(name) > 120 or None in m.values() or m["kcal"] > 900 \
                    or any(m[k] > 100 for k in ("protein", "carbs", "fat")) or m["protein"] + m["carbs"] + m["fat"] > 100:
                skipped += 1
                continue
            details = {k: value(r.get(c)) for k, c in DETAILS.items()}
            for k, lim in LIMIT.items():
                if details[k] is not None and details[k] > lim:
                    details[k] = None
            if details["sugarsG"] is not None and details["sugarsG"] > m["carbs"]:
                details["sugarsG"], dropped = None, dropped + 1
            if details["saturatedFatG"] is not None and details["saturatedFatG"] > m["fat"]:
                details["saturatedFatG"], dropped = None, dropped + 1
            out.write("\t".join([r["G"], name, *map(fmt, m.values()), *map(fmt, details.values())]) + "\n")
            kept += 1
    print(f"kept {kept}, skipped {skipped} (incomplete or inconsistent macros), dropped {dropped} inconsistent details")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
