"""NASA SVS Deep Star Maps 2020의 은하수 지도(EXR)를 웹에서 쓰는 JPG로 바꾼다.

milkyway_2020은 밝은 별(Hipparcos, Tycho)을 뺀 지도라서, 우리가 따로 찍는 별과 겹치지 않는다.
원본: https://svs.gsfc.nasa.gov/4851 (milkyway_2020_8k.exr)
필요: pip install OpenEXR numpy pillow
사용: python3 tools/build_milkyway.py <milkyway_2020_8k.exr> public/data/milkyway.jpg
"""
import sys

import numpy as np
import OpenEXR
from PIL import Image

# 하늘 바탕을 검게 깎는 기준(밝기 하위 몇 %)과 은하수가 하얗게 차는 기준(상위 몇 %)
BLACK_PERCENTILE = 40
WHITE_PERCENTILE = 99.9
GAMMA = 1 / 1.6
# 웹에서 쓸 크기: 줄이면서 잔별 노이즈도 부드러워진다
OUT_SIZE = (4096, 2048)


def main(src, dst):
    with OpenEXR.File(src) as exr:
        channels = exr.channels()
        if "RGB" in channels:
            rgb = channels["RGB"].pixels.astype(np.float32)
        else:
            rgb = np.stack([channels[c].pixels for c in "RGB"], axis=-1).astype(np.float32)

    luma = rgb.mean(axis=-1)
    black = np.percentile(luma, BLACK_PERCENTILE)
    white = np.percentile(luma, WHITE_PERCENTILE)
    img = np.clip((rgb - black) / (white - black), 0, 1) ** GAMMA
    out = Image.fromarray((img * 255).astype(np.uint8)).resize(OUT_SIZE, Image.LANCZOS)
    out.save(dst, quality=82, optimize=True)
    print(f"{rgb.shape[1]}x{rgb.shape[0]} → {OUT_SIZE[0]}x{OUT_SIZE[1]} {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
