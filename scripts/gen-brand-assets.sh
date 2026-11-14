#!/bin/sh
# gen-brand-assets.sh — generate every solstone download on /brand.
#
#   make brand BRAND_SRC=/abs/path/to/brand-source
#
# The /brand page renders the marks on the page as inline SVG and offers each
# one as a download: SVG, a PNG ladder (16 to 1024 px), a true-vector PDF, the
# QR code masters, and solstone.zip. Those files are generated here from the
# canonical brand SVGs and committed. Nothing generates them at request time.
#
# This is its own explicit step on purpose. `make deploy` never runs it: the
# site deploys often, and an unrelated deploy must never republish a mark.
# Regenerate only when the brand source changes, review the diff, commit it,
# then deploy.
#
# Output lives under public/brand/assets/, never public/static/: /static/* is
# served immutable and content-stamped, while these paths are published URLs
# that people link to and must stay stable. File names are part of that
# contract; do not rename one.
#
# BRAND_SRC is the brand source tree (it holds solstone/mark.svg). It has no
# default: pass it explicitly.
#
# Output is deterministic (pinned mtimes and modes, normalized PDFs), so a
# rerun changes git only for source SVGs that actually changed.
#
# Renderer: rsvg-convert when present, otherwise cairosvg in a local venv
# (scripts/.brand-venv, untracked). Both render each PNG natively at its size
# and emit true-vector PDFs. qpdf is required for PDF determinism.
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO/public/brand/assets"

if [ -z "${BRAND_SRC:-}" ]; then
  echo "gen-brand-assets: set BRAND_SRC=/abs/path/to/brand-source" >&2
  exit 1
fi
if [ ! -f "$BRAND_SRC/solstone/mark.svg" ]; then
  echo "gen-brand-assets: not a brand source tree (no solstone/mark.svg): $BRAND_SRC" >&2
  exit 1
fi

# One line per asset: "<asset-name> <source-svg-path-relative-to-BRAND_SRC>"
MANIFEST="
mark                              solstone/mark.svg
mark-white                        solstone/mark-white.svg
mark-black                        solstone/mark-black.svg
app-icon-cream-squircle           solstone/app-icon/app-icon-cream-squircle.svg
app-icon-cream                    solstone/app-icon/app-icon-cream.svg
app-icon-transparent              solstone/app-icon/app-icon-transparent.svg
lockup-solstone-app               solstone/lockup-solstone-app.svg
lockup-solstone-app-white         solstone/lockup-solstone-app-white.svg
lockup-solstone-horizontal        solstone/lockup-solstone-horizontal.svg
lockup-solstone-horizontal-white  solstone/lockup-solstone-horizontal-white.svg
"

LADDER="16 32 64 128 256 512 1024"
EPOCH="2026-01-01T00:00:00"

if ! command -v qpdf >/dev/null 2>&1; then
  echo "gen-brand-assets: qpdf is required (PDF determinism). install qpdf." >&2
  exit 1
fi
if ! command -v zip >/dev/null 2>&1; then
  echo "gen-brand-assets: zip is required." >&2
  exit 1
fi

RENDERER=""
if command -v rsvg-convert >/dev/null 2>&1; then
  RENDERER="rsvg"
  echo "gen-brand-assets: renderer = rsvg-convert ($(rsvg-convert --version))"
else
  VENV="$REPO/scripts/.brand-venv"
  if [ ! -x "$VENV/bin/python" ]; then
    echo "gen-brand-assets: bootstrapping cairosvg venv at scripts/.brand-venv"
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install -q --disable-pip-version-check 'cairosvg>=2.7' >/dev/null
  fi
  PY="$VENV/bin/python"
  RENDERER="cairosvg"
  echo "gen-brand-assets: renderer = cairosvg ($("$PY" -c 'import cairosvg;print(cairosvg.__version__)'))"
fi

# render_png <src.svg> <size> <dest.png>: native render, aspect preserved
# (the larger side maps to <size>), never downsampled.
render_png() {
  src="$1"; size="$2"; dst="$3"
  if [ "$RENDERER" = "rsvg" ]; then
    rsvg-convert --keep-aspect-ratio -w "$size" -h "$size" "$src" -o "$dst"
  else
    "$PY" - "$src" "$size" "$dst" <<'PY'
import sys, re, cairosvg
src, size, dst = sys.argv[1], int(sys.argv[2]), sys.argv[3]
svg = open(src, 'r', encoding='utf-8').read()
m = re.search(r'viewBox\s*=\s*["\']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.+eE.+-]+)\s+([\d.eE+-]+)', svg)
if m:
    vw, vh = float(m.group(1)), float(m.group(2))
else:
    wm = re.search(r'\bwidth\s*=\s*["\']\s*([\d.]+)', svg)
    hm = re.search(r'\bheight\s*=\s*["\']\s*([\d.]+)', svg)
    vw = float(wm.group(1)) if wm else 1.0
    vh = float(hm.group(1)) if hm else 1.0
if vw >= vh:
    ow, oh = size, max(1, round(size * vh / vw))
else:
    ow, oh = max(1, round(size * vw / vh)), size
cairosvg.svg2png(bytestring=svg.encode('utf-8'), write_to=dst,
                 output_width=ow, output_height=oh)
PY
  fi
}

# render_pdf <src.svg> <dest.pdf>: true-vector PDF, with the two fields every
# renderer varies run to run (/CreationDate and /ID) pinned.
ZID="00000000000000000000000000000000"
PIID="31415926535897932384626433832795"  # qpdf --static-id constant
render_pdf() {
  src="$1"; dst="$2"
  raw="$(mktemp --suffix=.pdf)"; qa="$(mktemp --suffix=.qdf)"
  qb="$(mktemp --suffix=.qdf)"; sc="$(mktemp --suffix=.pdf)"
  if [ "$RENDERER" = "rsvg" ]; then
    rsvg-convert -f pdf "$src" -o "$raw"
  else
    "$PY" -c "import sys,cairosvg; cairosvg.svg2pdf(url=sys.argv[1], write_to=sys.argv[2])" "$src" "$raw"
  fi
  qpdf --qdf --object-streams=disable "$raw" "$qa"
  sed "s#/CreationDate (D:[0-9]\{14\}[+-][0-9]\{2\}'[0-9]\{2\})#/CreationDate (D:20260101000000+00'00)#" "$qa" > "$qb"
  qpdf --static-id --object-streams=disable "$qb" "$sc"
  sed "s#/ID \[<[0-9a-f]\{32\}><$PIID>\]#/ID [<$ZID><$PIID>]#" "$sc" > "$dst"
  rm -f "$raw" "$qa" "$qb" "$sc"
}

rm -rf "$OUT"
BDIR="$OUT/solstone"
mkdir -p "$BDIR/svg" "$BDIR/png" "$BDIR/pdf" "$BDIR/qr"

echo "$MANIFEST" | while read -r name relsrc; do
  [ -n "${name:-}" ] || continue
  src="$BRAND_SRC/$relsrc"
  if [ ! -f "$src" ]; then
    echo "gen-brand-assets: missing source $src" >&2
    exit 1
  fi
  cp "$src" "$BDIR/svg/$name.svg"
  render_pdf "$src" "$BDIR/pdf/$name.pdf"
  for s in $LADDER; do
    render_png "$src" "$s" "$BDIR/png/$name-$s.png"
  done
  echo "  solstone/$name  (svg + pdf + png x$(echo $LADDER | wc -w))"
done

# The QR code is a raster-backed styled code: a small render is unscannable,
# so it is never laddered. The masters are copied at their authored sizes.
QR_SRC="$BRAND_SRC/solstone/qr"
for f in "qr-solstone-app.svg" \
         "png/qr-cream-512.png"  "png/qr-cream-1024.png"  "png/qr-cream-2048.png" \
         "png/qr-white-512.png"  "png/qr-white-1024.png"  "png/qr-white-2048.png"; do
  if [ ! -f "$QR_SRC/$f" ]; then
    echo "gen-brand-assets: missing QR source $QR_SRC/$f" >&2
    exit 1
  fi
  cp "$QR_SRC/$f" "$BDIR/qr/"
done
echo "  solstone/qr  (svg + cream/white png 512/1024/2048)"

# Deterministic zip: pinned mode and mtime on every file, sorted entries, -X.
find "$OUT" -type f -exec chmod 644 {} +
find "$OUT" -type f -exec touch -d "$EPOCH" {} +
( cd "$OUT" && find solstone -type f | LC_ALL=C sort | zip -X -q solstone.zip -@ )
chmod 644 "$OUT/solstone.zip"
touch -d "$EPOCH" "$OUT/solstone.zip"

echo "gen-brand-assets: done -> $OUT"
