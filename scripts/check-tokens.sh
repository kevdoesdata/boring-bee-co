#!/usr/bin/env bash
# Keeps the site inside the Boring Bee design system.
# Fails if a raw color (hex, rgb, hsl) appears anywhere except the token block
# at the top of styles.css. Use a token instead, e.g. var(--leaf).
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
pat='(^|[^&])#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\b|rgba?\(|hsla?\('
fail=0
report(){ echo "✗ $1"; echo "$2" | sed 's/^/    /'; fail=1; }

body=$(awk '/tokens:end/{f=1;next} f{print NR": "$0}' "$root/styles.css")
hits=$(printf '%s\n' "$body" | grep -E "$pat" | cut -c1-160)
[ -n "$hits" ] && report "styles.css has raw colors outside the token block:" "$hits"

for f in "$root"/*.js "$root"/index.html; do
  hits=$(grep -nE "$pat" "$f" | cut -c1-160)
  [ -n "$hits" ] && report "${f#$root/} has raw colors (read them from CSS tokens instead):" "$hits"
done

[ $fail -eq 0 ] && echo "✓ Design tokens check passed: every color comes from the token block."
exit $fail
