"""Contrasta cada consulta del frontend contra el esquema real de Supabase.

Por qué existe: PostgREST rechaza la consulta ENTERA si pedís una columna que
no existe, y el patrón `const { data } = await supabase...` + `data || []` hace
que ese fallo sea invisible: la sección aparece vacía como si no hubiera datos.
Así estuvieron rotos durante meses el PDF de la matriz de riesgos, la carga de
KPIs de la revisión por la dirección y el historial de capacitaciones.

Revisa las columnas pedidas en .select() y las usadas en filtros u orden
(.eq, .neq, .gt, .gte, .lt, .lte, .in, .is, .like, .ilike, .order) de la misma
cadena, y avisa si la tabla directamente no existe.

Uso:
    supabase gen types typescript --project-id <REF> --schema public > db-types.ts
    python scripts/check-db-columns.py db-types.ts

Sin argumento busca db-types.ts en la raíz del repo.
Sale con código 1 si encuentra hallazgos (sirve para CI o pre-push).
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "src")
TYPES = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "db-types.ts")

if not os.path.exists(TYPES):
    print(f"No encuentro {TYPES}.\n"
          f"Generalo con:  supabase gen types typescript --project-id <REF> "
          f"--schema public > db-types.ts")
    sys.exit(2)

# ── 1. Esquema real desde los tipos generados ──────────────────────────────
types = io.open(TYPES, encoding="utf-8").read()
schema = {}
for m in re.finditer(r"\n\s{6}(\w+): \{\n\s{8}Row: \{\n(.*?)\n\s{8}\}", types, re.S):
    table, body = m.group(1), m.group(2)
    schema[table] = set(re.findall(r"^\s{10}(\w+)\??:", body, re.M))

# ── 2. Consultas del frontend ─────────────────────────────────────────────
FILTERS = r"eq|neq|gt|gte|lt|lte|in|is|like|ilike|order|contains|not"
IGNORED_TABLES = {"storage"}
findings = []


def split_top(s):
    """Separa por comas de nivel superior (respeta relaciones anidadas)."""
    out, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(cur)
    return [x.strip() for x in out if x.strip()]


for root, _, files in os.walk(APP):
    for fn in files:
        if not fn.endswith((".jsx", ".js")):
            continue
        path = os.path.join(root, fn)
        src = io.open(path, encoding="utf-8").read()
        for m in re.finditer(r"\.from\(\s*'(\w+)'\s*\)", src):
            table = m.group(1)
            line = src.count("\n", 0, m.start()) + 1
            # Los ejemplos dentro de comentarios no son consultas reales
            line_start = src.rfind("\n", 0, m.start()) + 1
            if src[line_start:m.start()].lstrip().startswith(("//", "*", "/*")):
                continue
            tail = src[m.end():m.end() + 900]
            nxt = re.search(r"\.from\(|;\s*\n|\n\s*\n", tail)
            chain = tail[: nxt.start()] if nxt else tail
            if table not in schema:
                if table not in IGNORED_TABLES:
                    findings.append((path, line, table, "(tabla/vista inexistente)", ""))
                continue
            cols = schema[table]
            used = []
            sel = re.search(r"\.select\(\s*'([^']*)'", chain)
            if sel:
                for part in split_top(sel.group(1)):
                    if part == "*" or "(" in part:
                        continue  # relación anidada: se valida aparte
                    name = part.split(":")[-1].strip() if ":" in part else part
                    name = name.split("::")[0].strip()
                    if name and name != "count":
                        used.append(("select", name))
            for fm in re.finditer(r"\.(%s)\(\s*'(\w+)'" % FILTERS, chain):
                used.append((fm.group(1), fm.group(2)))
            for kind, col in used:
                if col not in cols:
                    findings.append((path, line, table, col, kind))

findings.sort()
rel = lambda p: os.path.relpath(p, ROOT).replace("\\", "/")
print(f"Tablas en el esquema: {len(schema)}")
print(f"Hallazgos: {len(findings)}\n")
for path, line, table, col, kind in findings:
    print(f"{rel(path)}:{line}  {table}.{col}  [{kind}]")

sys.exit(1 if findings else 0)
