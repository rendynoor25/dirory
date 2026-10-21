"""Make the five board materials tile seamlessly at a known real-world size.

Regular patterns (brick, clay roof tile) are cropped to a whole number of
pattern repeats, then the wrap-around seam is hidden with a minimum-error
boundary cut (image quilting), so the edges meet where the pattern already
matches. Stone and gravel have no repeat, so only the seam cut is used.
The AAC block is rebuilt as real 60 x 20 cm blocks (the board's blocks are
not that proportion) from the board's own block surface.

usage: python scripts/tile-board-materials.py "D:/Dirory/sample_library/Materials/Material Texture Catalog Board.png" library-additions/Materials/_tiled
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

BOARD, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
board = Image.open(BOARD).convert("RGB")
rng = np.random.default_rng(20261021)

# Panel boxes on the board, above the label boxes (see the earlier split).
PANELS = {
    "Brick": (2, 2, 500, 430),
    "Clay Tile Roof": (520, 2, 1016, 430),
    "Concrete Lightweight Block": (1036, 2, 1534, 430),
    "River Stone": (2, 521, 758, 949),
    "Kerikil": (778, 521, 1534, 949),
}
def panel(name):
    return np.asarray(board.crop(PANELS[name])).astype(float)


def refine_lag(a, axis, guess, span=6):
    """Shift (pixels) near `guess` where the image best matches itself."""
    best, best_lag = None, guess
    for lag in range(guess - span, guess + span + 1):
        if axis == 1:
            x, y = a[:, :-lag], a[:, lag:]
        else:
            x, y = a[:-lag], a[lag:]
        err = np.mean((x - y) ** 2)
        if best is None or err < best:
            best, best_lag = err, lag
    return best_lag


def min_cut_path(cost):
    """Top-to-bottom path through `cost` (H x W) with steps of -1/0/+1."""
    h, w = cost.shape
    acc = cost.copy()
    back = np.zeros((h, w), int)
    for i in range(1, h):
        prev = acc[i - 1]
        left = np.r_[np.inf, prev[:-1]]
        right = np.r_[prev[1:], np.inf]
        stack = np.vstack([left, prev, right])
        choice = np.argmin(stack, 0)
        back[i] = choice - 1
        acc[i] += stack[choice, np.arange(w)]
    path = np.zeros(h, int)
    path[-1] = int(np.argmin(acc[-1]))
    for i in range(h - 1, 0, -1):
        path[i - 1] = path[i] + back[i, path[i]]
    return path


def seam_wrap_x(a, ov, feather=2):
    """Make `a` tile horizontally; result is ov pixels narrower."""
    h, w, _ = a.shape
    R = a[:, w - ov:]          # what follows the previous tile's right edge
    L = a[:, :ov]              # this tile's own left edge
    path = min_cut_path(np.sum((R - L) ** 2, 2))
    xs = np.arange(ov)[None, :]
    t = np.clip((xs - path[:, None]) / max(feather, 1) + 0.5, 0, 1)[..., None]
    out = a[:, : w - ov].copy()
    out[:, :ov] = R * (1 - t) + L * t
    return out


def seam_wrap_y(a, ov, feather=2):
    return np.transpose(seam_wrap_x(np.transpose(a, (1, 0, 2)), ov, feather), (1, 0, 2))


def save(name, a):
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + ".jpg"), quality=93)


def periodic(name, px_guess, py_guess, nx, ny, ov=14, y0=0):
    a = panel(name)[y0:]
    px = refine_lag(a, 1, px_guess * nx) / nx
    py = refine_lag(a, 0, py_guess * ny) / ny
    w, h = int(round(px * nx)), int(round(py * ny))
    a = a[: h + ov, : w + ov]
    a = seam_wrap_y(seam_wrap_x(a, ov), ov)
    return a, px, py


report = {}

# Brick: running bond. One repeat = 1 brick module wide, 2 courses high.
# Indonesian exposed red brick: course ~7.0 cm (5.5 cm brick + joint).
a, px, py = periodic("Brick", 177, 116, 2, 3)
course_cm = 7.0
cm_per_px = course_cm / (py / 2)
save("Brick", a)
report["Brick"] = dict(px=a.shape[1::-1], module_cm=round(px * cm_per_px, 1), course_cm=course_cm,
                       size_cm=[round(a.shape[1] * cm_per_px, 1), round(a.shape[0] * cm_per_px, 1)])

# Clay roof tile: one repeat = one tile's cover width x its exposure.
# Genteng tanah liat: ~25 pcs/m2, cover ~19-20 cm wide.
# Two rows from the band where the photo repeats best (rows shrink with
# perspective further down the board).
a, px, py = periodic("Clay Tile Roof", 91, 103, 5, 2, y0=117)
cover_w_cm = 19.5
cm_per_px = cover_w_cm / px
save("Clay Tile Roof", a)
report["Clay Tile Roof"] = dict(px=a.shape[1::-1], cover_cm=[cover_w_cm, round(py * cm_per_px, 1)],
                                pcs_per_m2=round(1e4 / (cover_w_cm * py * cm_per_px), 1),
                                size_cm=[round(a.shape[1] * cm_per_px, 1), round(a.shape[0] * cm_per_px, 1)])

# AAC (bata ringan / hebel): 60 x 20 cm blocks, 3 mm thin-bed joints,
# running bond. Rebuilt from a seamless patch of the board's block face.
src = panel("Concrete Lightweight Block")
face = src[150:228, 150:300]                       # inside one block, no joints
PXCM = 5.0
W, H = int(120 * PXCM), int(80 * PXCM)              # 2 blocks x 4 courses


def wrap_blur(field, sigma):
    """Gaussian blur on a torus, so the result tiles."""
    fy = np.fft.fftfreq(field.shape[0])[:, None]
    fx = np.fft.fftfreq(field.shape[1])[None, :]
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(field) * g))


# AAC face: the board block's colour, fine grain, soft blotches and pores,
# all generated periodic so the texture has no seams and no visible repeat.
mean = face.reshape(-1, 3).mean(0)
fine = face.mean(2).std()
lum = (rng.normal(0, 1, (H, W)) * fine * 0.35
       + wrap_blur(rng.normal(0, 1, (H, W)), 1.2) * fine * 1.1
       + wrap_blur(rng.normal(0, 1, (H, W)), 18) * 60)
pores = (rng.random((H, W)) < 0.012).astype(float)
lum -= wrap_blur(pores, 0.7) * 160
grain = np.clip(mean[None, None, :] + lum[..., None], 0, 255)
grain = np.tile(grain, (2, 2, 1))
fh, fw = H, W
img = np.zeros((H, W, 3))
joint = 0.3 * PXCM                                   # 3 mm
for row in range(4):
    y0 = int(row * 20 * PXCM)
    off = 0 if row % 2 == 0 else 30 * PXCM
    for k in range(-1, 3):
        x0 = int(round(off + k * 60 * PXCM))
        x1 = int(round(x0 + 60 * PXCM))
        oy, ox = rng.integers(0, fh), rng.integers(0, fw)
        shade = rng.normal(0, 4)
        block = grain[oy: oy + int(20 * PXCM), ox: ox + (x1 - x0)] + shade
        for x in range(x0, x1):
            xx = x % W
            img[y0: y0 + int(20 * PXCM), xx] = block[:, x - x0]
# Joints: a thin darker line with a softer shadow below/right of it.
mask = np.zeros((H, W))
for row in range(4):
    y = int(row * 20 * PXCM)
    mask[y: y + int(np.ceil(joint)), :] = 1
    off = 0 if row % 2 == 0 else 30 * PXCM
    for k in range(0, 3):
        x = int(round(off + k * 60 * PXCM)) % W
        mask[y: y + int(20 * PXCM), x: x + int(np.ceil(joint))] = 1
soft = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))) / 255.0
img = img * (1 - 0.35 * soft[..., None]) * (1 - 0.25 * mask[..., None])
save("Concrete Lightweight Block", img)
report["Concrete Lightweight Block"] = dict(px=[W, H], block_cm=[60, 20], joint_mm=3, size_cm=[120, 80])

# River stone (batu kali): stones ~15-25 cm across.
a = seam_wrap_y(seam_wrap_x(panel("River Stone"), 48, 3), 48, 3)
save("River Stone", a)
report["River Stone"] = dict(px=a.shape[1::-1], size_cm=[135, round(135 * a.shape[0] / a.shape[1], 1)])

# Kerikil (split / koral 2-3 cm).
a = seam_wrap_y(seam_wrap_x(panel("Kerikil"), 24, 2), 24, 2)
save("Kerikil", a)
report["Kerikil"] = dict(px=a.shape[1::-1], size_cm=[100, round(100 * a.shape[0] / a.shape[1], 1)])

print(json.dumps(report, indent=1))
