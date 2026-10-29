"""d3-celestial 별자리 데이터를 웹에서 쓰는 constellations.json으로 바꾼다.

원본: https://github.com/ofrohn/d3-celestial (data/constellations.json, data/constellations.lines.json)
사용: python3 tools/build_constellations.py <constellations.json> <constellations.lines.json> public/data/constellations.json
"""
import json
import sys

# 황도 12궁: 이름을 늘 보여 준다
ZODIAC = {"Ari", "Tau", "Gem", "Cnc", "Leo", "Vir", "Lib", "Sco", "Sgr", "Cap", "Aqr", "Psc"}


def ra_deg(lon):
    # d3-celestial은 적경을 -180~180도로 적는다
    return round(lon % 360, 4)


def main(names_path, lines_path, dst):
    names = {f["id"]: f for f in json.load(open(names_path, encoding="utf-8"))["features"]}
    lines = {f["id"]: f for f in json.load(open(lines_path, encoding="utf-8"))["features"]}

    out = []
    for cid, feat in names.items():
        props = feat["properties"]
        lon, lat = feat["geometry"]["coordinates"]
        segs = lines[cid]["geometry"]["coordinates"] if cid in lines else []
        out.append({
            "id": cid,
            "name": props["ko"],
            "latin": props["name"],
            "ra": ra_deg(lon),
            "dec": lat,
            "zodiac": cid in ZODIAC,
            "lines": [[[ra_deg(p[0]), round(p[1], 4)] for p in seg] for seg in segs],
        })

    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"별자리 {len(out)}개 (황도 {sum(c['zodiac'] for c in out)}개) → {dst}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
