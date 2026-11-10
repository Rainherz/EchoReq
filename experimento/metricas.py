#!/usr/bin/env python
"""Calcula las variables dependientes del experimento.

    python3 experimento/metricas.py [--dir experimento/codificacion]

Lee ``clave.csv``, ``codificacion_A.csv``, ``codificacion_B.csv`` y, si existe,
``consenso.csv`` (los desacuerdos resueltos entre los dos). Sin consenso usa la
codificación A y lo avisa. Escribe en ``experimento/resultados/``:

``por_corrida.csv``  Las variables dependientes de cada corrida.
``resumen.md``       Media y desviación por condición, diferencia E − NE,
                     delta de Cliff y kappa de Cohen entre codificadores.

Variables dependientes (por corrida):

VD1 cobertura_elicitacion  necesidades de la verdad de campo recuperadas / 18
VD2 cobertura_extraccion   recuperadas / necesidades presentes en la transcripción
VD3 precision              propuestas que corresponden a una necesidad / propuestas
VD4 ambiguedad             % de propuestas con término vago y sin criterio medible
VD5 atomicidad             % de propuestas con una sola responsabilidad
VD6 trazabilidad           % de propuestas cuyas citas sostienen el requisito

Por variable: media ± d.e., diferencia E − NE, δ de Cliff y p de Mann-Whitney.

Solo usa la biblioteca estándar: se puede correr fuera del entorno de la API.
"""

from __future__ import annotations

import argparse
import csv
import statistics as st
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent


def read(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def norm_need(v: str) -> str:
    v = (v or "").strip().upper()
    return v if v.startswith("N") and v[1:].isdigit() else "NINGUNA" if v else ""


def norm_sn(v: str) -> str:
    v = (v or "").strip().upper()[:1]
    return v if v in ("S", "N") else ""


def kappa(a: list[str], b: list[str]) -> float | None:
    pairs = [(x, y) for x, y in zip(a, b) if x and y]
    if not pairs:
        return None
    n = len(pairs)
    po = sum(x == y for x, y in pairs) / n
    ca, cb = Counter(x for x, _ in pairs), Counter(y for _, y in pairs)
    pe = sum(ca[k] * cb[k] for k in set(ca) | set(cb)) / (n * n)
    return 1.0 if pe == 1 else (po - pe) / (1 - pe)


def cliffs_delta(xs: list[float], ys: list[float]) -> float | None:
    if not xs or not ys:
        return None
    gt = sum(1 for x in xs for y in ys if x > y)
    lt = sum(1 for x in xs for y in ys if x < y)
    return (gt - lt) / (len(xs) * len(ys))


def mann_whitney(xs: list[float], ys: list[float]) -> float | None:
    """p bilateral de Mann-Whitney. Exacta por permutación (con empates, rangos
    medios) mientras C(n1+n2, n1) sea manejable; si no, aproximación normal."""
    from itertools import combinations
    from math import comb, erf, sqrt

    n1, n2 = len(xs), len(ys)
    if n1 < 2 or n2 < 2:
        return None
    pooled = xs + ys
    order = sorted(range(n1 + n2), key=lambda i: pooled[i])
    ranks = [0.0] * (n1 + n2)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and pooled[order[j + 1]] == pooled[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    mid = n1 * n2 / 2
    u_obs = sum(ranks[:n1]) - n1 * (n1 + 1) / 2
    dev = abs(u_obs - mid) - 1e-9
    if len(set(pooled)) == 1:
        return 1.0
    if comb(n1 + n2, n1) <= 400_000:
        hits = total = 0
        for c in combinations(range(n1 + n2), n1):
            u = sum(ranks[i] for i in c) - n1 * (n1 + 1) / 2
            total += 1
            hits += abs(u - mid) >= dev
        return hits / total
    sd = sqrt(n1 * n2 * (n1 + n2 + 1) / 12)
    z = abs(u_obs - mid) / sd
    return 2 * (1 - 0.5 * (1 + erf(z / sqrt(2))))


def pct(n: int, d: int) -> float:
    return round(100 * n / d, 1) if d else 0.0


VDS = [
    ("cobertura_elicitacion", "VD1 Cobertura de elicitación (%)"),
    ("cobertura_extraccion", "VD2 Cobertura de extracción (%)"),
    ("precision", "VD3 Precisión (%)"),
    ("ambiguedad", "VD4 Ambigüedad (%)"),
    ("atomicidad", "VD5 Atomicidad (%)"),
    ("trazabilidad", "VD6 Trazabilidad válida (%)"),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dir", type=Path, default=HERE / "codificacion")
    ap.add_argument("--salida", type=Path, default=HERE / "resultados")
    args = ap.parse_args()

    truth = read(HERE / "verdad_de_campo.csv")
    total = len(truth)
    present = {
        c: {t["id"] for t in truth if t[f"nivel_{c}"] != "ausente"} for c in ("E", "NE")
    }
    key = {r["item"]: r for r in read(args.dir / "clave.csv")}
    A = {r["item"]: r for r in read(args.dir / "codificacion_A.csv")}
    B = {r["item"]: r for r in read(args.dir / "codificacion_B.csv")}
    cons_path = args.dir / "consenso.csv"
    CONS = {r["item"]: r for r in read(cons_path)} if cons_path.exists() else {}
    if not cons_path.exists():
        print("AVISO: no hay consenso.csv; en los ítems codificados por los dos se usa A.")

    def filled(row: dict | None) -> bool:
        return bool(row) and bool(norm_need(row.get("necesidad", "")))

    # Por ítem: consenso si existe; si no, A; si A no lo tiene, B.
    C = {}
    for i in key:
        for src in (CONS, A, B):
            if filled(src.get(i)):
                C[i] = src[i]
                break

    items = sorted(key)
    missing = [i for i in items if not norm_need(C.get(i, {}).get("necesidad", ""))]
    if missing:
        print(f"AVISO: {len(missing)} ítems sin codificar (ej. {', '.join(missing[:5])}).")

    k_need = kappa([norm_need(A.get(i, {}).get("necesidad", "")) for i in items],
                   [norm_need(B.get(i, {}).get("necesidad", "")) for i in items])
    k_cita = kappa([norm_sn(A.get(i, {}).get("cita_sostiene", "")) for i in items],
                   [norm_sn(B.get(i, {}).get("cita_sostiene", "")) for i in items])

    runs: dict[tuple[str, int], list[str]] = defaultdict(list)
    for i in items:
        runs[(key[i]["condicion"], int(key[i]["corrida"]))].append(i)

    rows = []
    for (cond, run), its in sorted(runs.items()):
        needs = [norm_need(C[i]["necesidad"]) if i in C else "" for i in its]
        found = {n for n in needs if n not in ("", "NINGUNA")}
        n = len(its)
        rows.append({
            "condicion": cond,
            "corrida": run,
            "propuestas": n,
            "necesidades_recuperadas": len(found),
            "cobertura_elicitacion": pct(len(found), total),
            "cobertura_extraccion": pct(len(found & present[cond]), len(present[cond])),
            "precision": pct(sum(1 for x in needs if x not in ("", "NINGUNA")), n),
            "ambiguedad": pct(sum(int(key[i]["ambigua_auto"]) for i in its), n),
            "atomicidad": pct(sum(1 for i in its if int(key[i]["responsabilidades"]) == 1), n),
            "trazabilidad": pct(sum(1 for i in its if i in C and norm_sn(C[i].get("cita_sostiene", "")) == "S"), n),
            "senales_ambiguedad_agente": sum(int(key[i]["senal_ambiguedad_agente"]) for i in its),
        })

    args.salida.mkdir(exist_ok=True)
    with (args.salida / "por_corrida.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    def stats(cond, col):
        xs = [r[col] for r in rows if r["condicion"] == cond]
        if not xs:
            return xs, "—"
        sd = st.stdev(xs) if len(xs) > 1 else 0.0
        return xs, f"{st.mean(xs):.1f} ± {sd:.1f}"

    lines = [
        "# Resultados del experimento",
        "",
        f"Corridas: E = {sum(r['condicion'] == 'E' for r in rows)}, "
        f"NE = {sum(r['condicion'] == 'NE' for r in rows)} · "
        f"propuestas codificadas: {len(items)} · verdad de campo: {total} necesidades "
        f"(presentes en E: {len(present['E'])}, en NE: {len(present['NE'])})",
        "",
        "| Variable | E (media ± d.e.) | NE (media ± d.e.) | Diferencia E − NE | δ de Cliff | p (Mann-Whitney) |",
        "|---|---|---|---|---|---|",
    ]
    for col, label in VDS:
        xe, se = stats("E", col)
        xn, sn = stats("NE", col)
        diff = f"{st.mean(xe) - st.mean(xn):+.1f}" if xe and xn else "—"
        d = cliffs_delta(xe, xn)
        pv = mann_whitney(xe, xn)
        lines.append(
            f"| {label} | {se} | {sn} | {diff} | {'—' if d is None else f'{d:+.2f}'} "
            f"| {'—' if pv is None else f'{pv:.4f}'} |"
        )
    lines += [
        "",
        f"Concordancia entre codificadores (κ de Cohen): necesidad = "
        f"{'—' if k_need is None else f'{k_need:.2f}'}, cita sostiene = "
        f"{'—' if k_cita is None else f'{k_cita:.2f}'}",
        "",
        f"Ítems codificados por los dos (base del κ): "
        f"{sum(1 for i in items if filled(A.get(i)) and filled(B.get(i)))} de {len(items)}.",
        "",
        "p: Mann-Whitney bilateral, exacta por permutación (rangos medios ante empates). "
        "Con 3 corridas por condición el mínimo posible es p = 0,10; con 10, p < 0,001.",
    ]
    (args.salida / "resumen.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
