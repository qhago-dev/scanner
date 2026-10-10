import glob, json, os, sys
from multiprocessing import Pool
import cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import decon_ean as D


def work(f):
    text, votes = D.decode_image(cv2.imread(f, cv2.IMREAD_GRAYSCALE))
    return os.path.basename(f)[:4], text, votes


if __name__ == "__main__":
    S, out = sys.argv[1], sys.argv[2]
    files = sorted(glob.glob(S + "/*.jpg"))
    with Pool(int(os.environ.get("J", "10"))) as p:
        res = {k: (t, v) for k, t, v in p.map(work, files)}
    json.dump(res, open(out, "w"))
    vfile = S + "/veredictos.json"
    if os.path.exists(vfile):
        v = json.load(open(vfile))
        P = v.pop("_productos")
        for cls in "SMN":
            ks = [k for k, x in v.items() if x[0] == cls and k in res]
            ok = [k for k in ks if ":" in v[k] and res[k][0] == P[v[k].split(":")[1]]]
            fa = [k for k in ks if res[k][0] and (":" not in v[k] or res[k][0] != P[v[k].split(":")[1]])]
            print(cls, f"{len(ok)}/{len(ks)} falsas {len(fa)}", "falsas:", [(k, res[k][0]) for k in fa])
    else:
        print({k: t for k, (t, _) in res.items() if t})
