"""NASA HEASARC 밝은 별 목록(BSC5P)을 웹에서 쓰는 stars.json으로 바꾼다.

원본: https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz
사용: python3 tools/build_stars.py <heasarc_bsc5p.tdat> public/data/stars.json
"""
import json
import sys

# 맨눈 한계 등급
MAG_LIMIT = 6.5

# 이름을 붙일 별: HR 번호 → 한글 이름
STAR_NAMES = {
    424: "북극성",
    2491: "시리우스",
    2326: "카노푸스(노인성)",
    5340: "아크투루스",
    5459: "리길 켄타우루스",
    7001: "베가(직녀성)",
    1708: "카펠라",
    1713: "리겔",
    2943: "프로키온",
    472: "아케르나르",
    2061: "베텔게우스",
    5267: "하다르",
    7557: "알타이르(견우성)",
    4730: "아크룩스",
    1457: "알데바란",
    6134: "안타레스",
    5056: "스피카",
    2990: "폴룩스",
    8728: "포말하우트",
    7924: "데네브",
    4853: "미모사",
    3982: "레굴루스",
    2618: "아다라",
    2891: "카스토르",
    4763: "가크룩스",
    6527: "샤울라",
    1790: "벨라트릭스",
    1791: "엘나트",
    1903: "알닐람",
    1948: "알니탁",
    1852: "민타카",
    2004: "사이프",
    4301: "두베",
    4295: "메라크",
    4554: "페크다",
    4660: "메그레즈",
    4905: "알리오스",
    5054: "미자르",
    5191: "알카이드",
    4534: "데네볼라",
    936: "알골",
    1017: "미르파크",
    3748: "알파르드",
    5563: "코카브",
    15: "알페라츠",
    617: "하말",
    168: "셰다르",
    21: "카프",
    6556: "라스알하게",
    7417: "알비레오",
    681: "미라",
    1165: "알키오네",
}

# 이름을 늘 보여 줄 별
ALWAYS_SHOWN = {424}


def read_rows(path):
    fields = None
    in_data = False
    with open(path, encoding="latin-1") as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith("line[1] = "):
                fields = line[len("line[1] = "):].split()
            elif line == "<DATA>":
                in_data = True
            elif line == "<END>":
                break
            elif in_data and line:
                yield dict(zip(fields, line.split("|")))


def main(src, dst):
    stars = []
    named = []
    for row in read_rows(src):
        if not row["vmag"] or not row["ra"]:
            continue
        mag = float(row["vmag"])
        if mag > MAG_LIMIT:
            continue
        ra = round(float(row["ra"]), 4)
        dec = round(float(row["dec"]), 4)
        bv = round(float(row["bv_color"]), 2) if row["bv_color"] else 0.6
        stars.append([ra, dec, mag, bv])

        hr = int(row["hr"])
        if hr in STAR_NAMES:
            named.append({
                "name": STAR_NAMES[hr],
                "hr": hr,
                "bayer": row["alt_name"].strip(),
                "ra": ra,
                "dec": dec,
                "mag": mag,
                "always": hr in ALWAYS_SHOWN,
            })

    missing = set(STAR_NAMES) - {s["hr"] for s in named}
    if missing:
        sys.exit(f"이름 표에 있는데 목록에서 못 찾은 HR 번호: {sorted(missing)}")

    # 밝은 별이 나중에 그려지도록 어두운 순으로 둔다
    stars.sort(key=lambda s: -s[2])
    with open(dst, "w", encoding="utf-8") as f:
        json.dump({"stars": stars, "named": named}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"별 {len(stars)}개, 이름 붙은 별 {len(named)}개 → {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
