"""Prototipo: decodificador EAN-13/UPC-A robusto al desenfoque (plantillas desenfocadas + DP con checksum).

Uso: python3 blur_ean.py <veredictos.json-dir> [--debug K]
"""
import glob, json, math, os, sys
import cv2
import numpy as np

# Patrones de módulos (1 = barra). L, G (izq.) y R (der.) para los dígitos 0-9.
L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
# Paridad de los 6 dígitos izquierdos según el primer dígito (L/G).
PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]


def phi(z):
    return 0.5 * (1 + np.vectorize(math.erf)(z / math.sqrt(2)))


def render(bits, x, left, w, s):
    """Señal desenfocada (Gauss σ = s px) de módulos `bits` desde `left` con ancho `w`, muestreada en x."""
    out = np.zeros_like(x, dtype=np.float64)
    i = 0
    while i < len(bits):
        if bits[i] == "1":
            j = i
            while j < len(bits) and bits[j] == "1":
                j += 1
            a, b = left + i * w, left + j * w
            out += phi((x - a) / s) - phi((x - b) / s)
            i = j
        else:
            i += 1
    return out


def corr(o, t):
    o = o - o.mean()
    t = t - t.mean()
    d = math.sqrt((o * o).sum() * (t * t).sum())
    return float((o * t).sum() / d) if d > 1e-9 else -1.0


def localize(gray):
    """Regiones candidatas: alta energía de gradiente + coherencia de orientación (tensor de estructura)."""
    h, w = gray.shape
    sc = 480 / max(h, w)
    g = cv2.resize(gray, (int(w * sc), int(h * sc)), interpolation=cv2.INTER_AREA).astype(np.float32)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    k = (9, 9)
    jxx = cv2.blur(gx * gx, k)
    jyy = cv2.blur(gy * gy, k)
    jxy = cv2.blur(gx * gy, k)
    e = jxx + jyy
    coh = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2) / (e + 1e-6)
    mask = ((e > np.percentile(e, 85)) & (coh > 0.75)).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask)
    regs = []
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 150:
            continue
        ys, xs = np.nonzero(lab == i)
        theta = 0.5 * math.atan2(2 * jxy[ys, xs].mean(), (jxx[ys, xs] - jyy[ys, xs]).mean())
        pts = np.stack([xs, ys], 1).astype(np.float32) / sc
        regs.append((stats[i, cv2.CC_STAT_AREA] * float(e[ys, xs].mean()), theta, pts))
    regs.sort(key=lambda r: -r[0])
    return regs[:3]


def profiles(gray, theta, pts, nlines=9):
    """Perfiles a lo largo de la dirección del gradiente (perpendicular a las barras), promediados en banda."""
    u = np.array([math.cos(theta), math.sin(theta)])  # a través de las barras
    v = np.array([-u[1], u[0]])  # a lo largo de las barras
    c = pts.mean(0)
    pu = (pts - c) @ u
    pv = (pts - c) @ v
    u0, u1 = np.percentile(pu, 1), np.percentile(pu, 99)
    v0, v1 = np.percentile(pv, 10), np.percentile(pv, 90)
    ext = (u1 - u0) * 0.25
    u0, u1 = u0 - ext, u1 + ext
    n = int((u1 - u0) * 2)  # 2 muestras por px
    if n < 100:
        return []
    t = np.linspace(u0, u1, n)
    out = []
    for f in np.linspace(0.15, 0.85, nlines):
        vv = v0 + (v1 - v0) * f
        acc = np.zeros(n, np.float32)
        for dv in (-2, -1, 0, 1, 2):
            p = c[None, :] + t[:, None] * u[None, :] + (vv + dv) * v[None, :]
            mx = p[:, 0].astype(np.float32).reshape(1, -1)
            my = p[:, 1].astype(np.float32).reshape(1, -1)
            acc += cv2.remap(gray, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)[0]
        out.append((t, acc / 5))
    return out


GUARDS = [(0, "101"), (45, "01010"), (92, "101")]


def count_peaks(q, a, b):
    seg = q[a:b]
    if len(seg) < 5:
        return 0
    n = 0
    last_min = 1e9
    i = 1
    up = False
    peak = -1e9
    for i in range(1, len(seg)):
        if seg[i] > seg[i - 1]:
            up = True
            peak = max(peak, seg[i])
        elif up and seg[i] < seg[i - 1]:
            # cima en i-1
            if peak > 0.3 and peak - last_min > 0.12:
                n += 1
                last_min = 1e9
            up = False
            peak = -1e9
        last_min = min(last_min, seg[i])
    return n


def find_spans(q, top=6, min_quiet=2.0):
    """Tramos candidatos entre dos zonas blancas (q < 0,3), con 24-34 picos; los `top` más plausibles."""
    w = (q < 0.3).astype(np.int8)
    d = np.diff(np.concatenate([[0], w, [0]]))
    s = list(np.nonzero(d == 1)[0])
    e = list(np.nonzero(d == -1)[0])
    runs = [(a, b) for a, b in zip(s, e)]
    runs = [(-10**6, 0)] + runs + [(len(q), 10**6)]  # bordes del perfil como zonas blancas
    cands = []
    for i in range(len(runs)):
        for j in range(i + 1, len(runs)):
            a, b = runs[i][1], runs[j][0]
            L = b - a
            if L < 95 * 1.2:
                continue
            mod = L / 95
            if runs[i][1] - runs[i][0] < min_quiet * mod or runs[j][1] - runs[j][0] < min_quiet * mod:
                continue
            n = count_peaks(q, a, b)
            if 24 <= n <= 40:
                quiet = min(runs[i][1] - runs[i][0], runs[j][1] - runs[j][0]) / mod
                cands.append((-min(quiet, 8.0), abs(n - 30), a, b))
    cands.sort()
    return [(c[2], c[3]) for c in cands[:top]]


def find_span(q):
    """Tramo del símbolo entre dos zonas blancas (q < 0,3) que lo flanquean, con 24-34 picos (barras)."""
    w = (q < 0.3).astype(np.int8)
    d = np.diff(np.concatenate([[0], w, [0]]))
    s = np.nonzero(d == 1)[0]
    e = np.nonzero(d == -1)[0]
    runs = [(a, b) for a, b in zip(s, e)]
    # se considera también el borde del perfil como posible zona blanca
    best = None
    for i in range(len(runs)):
        for j in range(i + 1, len(runs)):
            a, b = runs[i][1], runs[j][0]
            L = b - a
            if L < 95 * 1.2:
                continue
            mod = L / 95
            if runs[i][1] - runs[i][0] < 3.5 * mod or runs[j][1] - runs[j][0] < 3.5 * mod:
                continue
            n = count_peaks(q, a, b)
            if 24 <= n <= 34:
                cand = (abs(n - 30), -L, a, b)
                if best is None or cand < best:
                    best = cand
    return (best[2], best[3]) if best else None


def find_span_old(q):
    """Tramo del símbolo: racimo de barras (q > 0,5) separadas por huecos cortos, con 22-36 barras."""
    b = (q > 0.5).astype(np.int8)
    d = np.diff(np.concatenate([[0], b, [0]]))
    starts = np.nonzero(d == 1)[0]
    ends = np.nonzero(d == -1)[0]
    if len(starts) < 15:
        return None
    widths = ends - starts
    med = np.median(widths)
    best = None
    i = 0
    while i < len(starts):
        j = i
        # agrupar mientras el hueco blanco sea < 4× la barra mediana (las zonas de silencio son ≥ 7 módulos)
        while j + 1 < len(starts) and starts[j + 1] - ends[j] < 4.5 * med and widths[j + 1] < 6 * med:
            j += 1
        n = j - i + 1
        if 20 <= n <= 40:
            cand = (abs(n - 30), starts[i], ends[j])
            if best is None or cand[0] < best[0] or (cand[0] == best[0] and cand[2] - cand[1] > best[2] - best[1]):
                best = cand
        i = j + 1
    return (best[1], best[2]) if best else None


def decode_profile(t, prof):
    """Devuelve (texto, score, margen) o None."""
    q = prof.max() - prof  # barras = alto
    lo, hi = np.percentile(q, 5), np.percentile(q, 95)
    if hi - lo < 15:
        return None
    q = np.clip((q - lo) / (hi - lo), -0.2, 1.2)
    x = np.arange(len(q), dtype=np.float64)
    span = find_span(q)
    if span is None:
        return None
    L0, R0 = span
    best = None
    w0 = (R0 - L0) / 95
    if w0 < 1.2:  # < 0,6 px por módulo: demasiado pequeño
        return None
    # Ajuste de geometría y desenfoque con los guardas.
    for dl in np.linspace(-1.5, 1.5, 13):
        for dr in np.linspace(-1.5, 1.5, 13):
            left = L0 + dl * w0
            w = (R0 + dr * w0 - left) / 95
            for sg in (0.35, 0.6, 0.9, 1.2):
                s = sg * w
                sc = 0
                for m, bits in GUARDS:
                    a = int(max(0, left + (m - 1) * w))
                    b = int(min(len(q), left + (m + len(bits) + 1) * w))
                    seg = x[a:b]
                    sc += corr(q[a:b], render(bits, seg, left + m * w, w, s))
                if best is None or sc > best[0]:
                    best = (sc, left, w, s)
    gsc, left, w, s = best
    if gsc < 3 * 0.6:
        return None
    # Puntuación por dígito (patrones L/G a la izquierda, R a la derecha).
    def slot_scores(m0, pats):
        a = int(max(0, left + (m0 - 0.5) * w))
        b = int(min(len(q), left + (m0 + 7.5) * w))
        seg = x[a:b]
        return [corr(q[a:b], render(p, seg, left + m0 * w, w, s)) for p in pats]

    left_sl = [(slot_scores(3 + 7 * i, L), slot_scores(3 + 7 * i, G)) for i in range(6)]
    right_sl = [slot_scores(50 + 7 * i, R) for i in range(6)]
    # DP con checksum: dígitos d0 (paridad) d1..d12; peso 1 en posiciones pares, 3 en impares (d0 = pos 0).
    results = []
    for d0, par in enumerate(PARITY):
        # dp[mod] = (score, digits)
        dp = {d0 % 10: (0.0, [d0])}
        for i in range(12):
            wgt = 3 if (i + 1) % 2 == 1 else 1
            if i < 6:
                sc = left_sl[i][0] if par[i] == "L" else left_sl[i][1]
            else:
                sc = right_sl[i - 6]
            nd = {}
            for mod, (tot, ds) in dp.items():
                for d in range(10):
                    if i == 11:
                        # el último dígito es el de control: (mod + d) % 10 == 0
                        if (mod + d) % 10 != 0:
                            continue
                    nm = (mod + d * wgt) % 10
                    cand = (tot + sc[d], ds + [d])
                    key = nm if i < 11 else 0
                    # guardar las 3 mejores por estado sería mejor; aquí la mejor
                    if key not in nd or cand[0] > nd[key][0]:
                        nd[key] = cand
            dp = nd
        if 0 in dp:
            results.append(dp[0])
    if not results:
        return None
    results.sort(key=lambda r: -r[0])
    top = results[0]
    second = results[1][0] if len(results) > 1 else top[0] - 12
    # Alternativa sin checksum: mejor dígito por posición (para el margen por dígito).
    mean = top[0] / 12
    text = "".join(map(str, top[1]))
    return text, mean, (top[0] - second) / 12, gsc / 3


def decode_image(gray, debug=False):
    votes = {}
    for _, theta, pts in localize(gray):
        for th in (theta, theta + math.pi):  # ambos sentidos
            for t, p in profiles(gray, th, pts):
                r = decode_profile(t, p)
                if r is None:
                    continue
                text, mean, margin, g = r
                if debug:
                    print("   ", text, f"mean={mean:.2f} margin={margin:.3f} guard={g:.2f}")
                if mean > 0.80 and margin > 0.02:
                    votes[text] = votes.get(text, 0) + 1
    if not votes:
        return None, votes
    best = max(votes.items(), key=lambda kv: kv[1])
    others = sum(v for k, v in votes.items() if k != best[0])
    if best[1] >= 2 and best[1] >= 2 * others:
        return best[0], votes
    return None, votes


if __name__ == "__main__":
    S = sys.argv[1]
    dbg = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == "--debug" else None
    v = json.load(open(S + "/veredictos.json"))
    P = v.pop("_productos")
    res = {}
    for f in sorted(glob.glob(S + "/*.jpg")):
        k = os.path.basename(f)[:4]
        if dbg and k != dbg:
            continue
        gray = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
        text, votes = decode_image(gray, debug=bool(dbg))
        res[k] = text
        want = P[v[k].split(":")[1]] if ":" in v[k] else None
        tag = "OK" if text and want and text == want else ("FALSO" if text else "-")
        print(k, v[k], text, tag, votes if dbg or tag == "FALSO" else "")
    json.dump(res, open("/tmp/qh-an/blur_res.json", "w"))
    for cls in "SMN":
        ks = [k for k, x in v.items() if x[0] == cls and k in res]
        ok = sum(1 for k in ks if ":" in v[k] and res[k] == P[v[k].split(":")[1]])
        fa = sum(1 for k in ks if res[k] and (":" not in v[k] or res[k] != P[v[k].split(":")[1]]))
        print(cls, f"{ok}/{len(ks)} falsas {fa}")
