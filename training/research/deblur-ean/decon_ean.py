"""Prototipo 3: EAN-13 por deconvolución en la cuadrícula de módulos + DP con checksum.

python3 decon_ean.py <dir-sesión> [--debug K]
"""
import glob, json, math, os, sys
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blur_ean as B  # localize, profiles, find_span, patrones

K = 6  # muestras por módulo
Q = 9  # módulos de margen a cada lado
NM = 95 + 2 * Q

LBITS = np.array([[int(c) for c in p] for p in B.L], np.float64)
GBITS = np.array([[int(c) for c in p] for p in B.G], np.float64)
RBITS = np.array([[int(c) for c in p] for p in B.R], np.float64)


def blur_matrix(sg):
    """A: (NM*K) × NM. Columna m = módulo m (caja) convolucionado con Gauss σ = sg módulos."""
    x = (np.arange(NM * K) + 0.5) / K  # posición en módulos
    A = np.zeros((NM * K, NM))
    s = max(sg, 1e-3)
    from math import erf, sqrt
    erfv = np.vectorize(erf)
    for m in range(NM):
        A[:, m] = 0.5 * (erfv((x - m) / (s * sqrt(2))) - erfv((x - m - 1) / (s * sqrt(2))))
    return A


SIGMAS = (0.25, 0.45, 0.7, 0.95, 1.2)
SOLVERS = {}
for sg in SIGMAS:
    A = blur_matrix(sg)
    lam = 0.05
    SOLVERS[sg] = (A, np.linalg.solve(A.T @ A + lam * np.eye(NM), A.T))


def full_bits(digits):
    par = B.PARITY[digits[0]]
    s = "101" + "".join((B.L if par[i] == "L" else B.G)[digits[i + 1]] for i in range(6)) + "01010"
    s += "".join(B.R[digits[7 + i]] for i in range(6)) + "101"
    return np.array([0] * Q + [int(c) for c in s] + [0] * Q, np.float64)


def dp_decode(bh):
    """bh: valores estimados por módulo (NM). Devuelve [(score, dígitos)] ordenados."""
    d = bh[Q:Q + 95]
    def sc(seg, pats):  # −distancia cuadrática
        return -((pats - seg[None, :]) ** 2).sum(1)
    left = [(sc(d[3 + 7 * i:10 + 7 * i], LBITS), sc(d[3 + 7 * i:10 + 7 * i], GBITS)) for i in range(6)]
    right = [sc(d[50 + 7 * i:57 + 7 * i], RBITS) for i in range(6)]
    out = []
    for d0, par in enumerate(B.PARITY):
        dp = {d0 % 10: (0.0, [d0])}
        for i in range(12):
            wgt = 3 if i % 2 == 0 else 1  # d1 (i=0) está en posición 1 → peso 3
            s = (left[i][0] if par[i] == "L" else left[i][1]) if i < 6 else right[i - 6]
            nd = {}
            for mod, (tot, ds) in dp.items():
                for dg in range(10):
                    nm = (mod + dg * wgt) % 10
                    if i == 11 and nm != 0:
                        continue
                    c = (tot + s[dg], ds + [dg])
                    if nm not in nd or c[0] > nd[nm][0]:
                        nd[nm] = c
            dp = nd
        if 0 in dp:
            out.append(dp[0])
    out.sort(key=lambda r: -r[0])
    return out


def decode_profile(prof, debug=False):
    q = prof.max() - prof
    lo, hi = np.percentile(q, 3), np.percentile(q, 97)
    if hi - lo < 12:
        return None
    q = (q - lo) / (hi - lo)
    best_all = None
    for span in B.find_spans(np.clip(q, -0.2, 1.2)):
        r = fit_span(q, span)
        if r and (best_all is None or r[0] > best_all[0]):
            best_all = r
    if debug and best_all:
        b = best_all
        print("    ", b[1], f"fit={b[0]:.3f} margen={b[2]:.2f} σ={b[3]} dl={b[4]:.1f} dw={b[5]:.2f} c={b[6]}")
    return best_all


def fit_span(q, span):
    L0, R0 = span
    w0 = (R0 - L0) / 95
    if w0 < 1.6:
        return None
    n = len(q)
    xs = np.arange(n, dtype=np.float64)
    best = None
    grid = (np.arange(NM * K) + 0.5) / K - Q  # módulo relativo al inicio del símbolo
    for dl in np.arange(-1.2, 1.21, 0.2):
        for dw in np.arange(-0.03, 0.031, 0.01):
            w = w0 * (1 + dw)
            for curv in (-0.08, -0.04, 0.0, 0.04, 0.08):
                # x(m) = L + w·m + curv·w·m(m−95)/95  (curvatura suave: módulos más anchos en el centro o bordes)
                left = L0 + dl * w0
                xm = left + w * grid + curv * w * grid * (grid - 95) / 95
                if xm[0] < 0 or xm[-1] > n - 1:
                    continue
                y = np.interp(xm, xs, q)
                for sg in SIGMAS:
                    A, P = SOLVERS[sg]
                    bh = P @ y
                    res = dp_decode(bh)
                    if not res:
                        continue
                    top = res[0]
                    model = A @ full_bits(top[1])
                    # ajuste del modelo completo (correlación) → criterio de selección de la geometría
                    yc = y - y.mean()
                    mc = model - model.mean()
                    fit = float((yc * mc).sum() / math.sqrt((yc * yc).sum() * (mc * mc).sum() + 1e-12))
                    second = res[1][0] if len(res) > 1 else top[0] - 10
                    cand = (fit, "".join(map(str, top[1])), top[0] - second, sg, dl, dw, curv)
                    if best is None or cand[0] > best[0]:
                        best = cand
    return best


def decode_image(gray, debug=False, fit_min=0.85, margin_min=0.8):
    votes = {}
    for ri, (_, theta, pts) in enumerate(B.localize(gray)[:2]):
        for th in (theta, theta + math.pi):
            for t, p in B.profiles(gray, th, pts, nlines=5):
                r = decode_profile(p, debug)
                if r and r[0] >= fit_min and r[2] >= margin_min:
                    votes[r[1]] = votes.get(r[1], 0) + 1
    if not votes:
        return None, votes
    best = max(votes.items(), key=lambda kv: kv[1])
    others = sum(v for k, v in votes.items() if k != best[0])
    return (best[0] if best[1] >= 2 and best[1] >= 2 * others else None), votes


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
        text, votes = decode_image(cv2.imread(f, cv2.IMREAD_GRAYSCALE), bool(dbg))
        res[k] = (text, votes)
        want = P[v[k].split(":")[1]] if ":" in v[k] else None
        tag = "OK" if text and text == want else ("FALSO" if text else "-")
        print(k, v[k], text, tag, votes, flush=True)
    json.dump(res, open("/tmp/qh-an/decon_res.json", "w"))
    for cls in "SMN":
        ks = [k for k, x in v.items() if x[0] == cls and k in res]
        ok = sum(1 for k in ks if ":" in v[k] and res[k][0] == P[v[k].split(":")[1]])
        fa = sum(1 for k in ks if res[k][0] and (":" not in v[k] or res[k][0] != P[v[k].split(":")[1]]))
        print(cls, f"{ok}/{len(ks)} falsas {fa}")
