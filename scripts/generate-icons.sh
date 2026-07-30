set -e
cd "$(git rev-parse --show-toplevel)"
SRC=public/icons

mark () { # $1=ring $2=arc $3=dot
cat <<EOF
  <circle cx="256" cy="256" r="96" fill="none" stroke="$1" stroke-width="30"/>
  <path d="M 289.9 120.1 A 140 140 0 1 1 222.1 120.2" fill="none" stroke="$2" stroke-width="30" stroke-linecap="round"/>
  <circle cx="256" cy="256" r="42" fill="$3"/>
EOF
}

write () { # $1=file $2=tile $3=ring $4=arc $5=dot $6=radius
{
  echo '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
  echo "  <rect width=\"512\" height=\"512\" rx=\"$6\" ry=\"$6\" fill=\"$2\"/>"
  mark "$3" "$4" "$5"
  echo '</svg>'
} > "$1"
}

#      file                     tile     ring     arc      dot      radius
write $SRC/icon-light.svg          '#F7F5F0' '#E4EDE7' '#1A1917' '#46655A' 113
write $SRC/icon-dark.svg           '#1A1917' '#46655A' '#F7F5F0' '#E4EDE7' 113
write $SRC/maskable-light.svg      '#F7F5F0' '#E4EDE7' '#1A1917' '#46655A' 0
write $SRC/maskable-dark.svg       '#1A1917' '#46655A' '#F7F5F0' '#E4EDE7' 0
ls -la $SRC

# Rasterize PNGs. Dark variant keeps the canonical filenames (app defaults to the
# dark theme); the light variant ships alongside as *-light.png.
for s in 72 96 128 144 152 180 192 384 512; do
  rsvg-convert -w $s -h $s public/icons/icon-dark.svg  -o public/icons/icon-${s}x${s}.png
  rsvg-convert -w $s -h $s public/icons/icon-light.svg -o public/icons/icon-light-${s}x${s}.png
done
for s in 192 512; do
  rsvg-convert -w $s -h $s public/icons/maskable-dark.svg  -o public/icons/maskable-${s}x${s}.png
  rsvg-convert -w $s -h $s public/icons/maskable-light.svg -o public/icons/maskable-light-${s}x${s}.png
done
