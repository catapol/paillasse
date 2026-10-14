#!/bin/sh
# Assemble index.html : un seul fichier, utilisable hors ligne, sans aucun appel à un serveur extérieur.
cd "$(dirname "$0")"
{ sed '/<!--styles-->/q' head.html | sed '$d'
  printf '<style>\n'; node tools/polices.js; cat vendor/codemirror.min.css; echo '</style>'
  sed '1,/<!--styles-->/d' head.html
  echo '</head>'; echo '<body>'
  cat body.html
  echo '<script>'; cat site.js; echo; cat i18n.js; echo '</script>'
  echo '<script>'; cat vendor/codemirror.min.js; echo '</script>'; echo '<script>'
  for f in cc1.js cc2.js cc3.js cc4.js vh1.js vh2.js vh3.js vh4.js engine.js bus.js eq.js parts.js physique.js monde.js composant.js; do cat "$f"; echo; done
  # descriptions d'exemple, proposées dans la fenêtre Importer
  printf 'const COMP_EXEMPLES = LL(['; for f in composants/*.json; do cat "$f"; printf ','; done; printf '], ['; for f in composants/en/*.json; do cat "$f"; printf ','; done; echo ']);'
  node tools/md2html.js FORMAT_COMPOSANT.md FORMAT_HTML
  node tools/md2html.js FORMAT_COMPOSANT.en.md FORMAT_HTML_EN
  # textes des licences, affichés dans « À propos »
  node -e 'const fs=require("fs");const r=f=>fs.readFileSync(f,"utf8");console.log("const LICENCES = "+JSON.stringify({paillasse:r("LICENSE"),codemirror:r("vendor/LICENCE-codemirror.txt"),plexMono:r("vendor/fonts/LICENCE-ibm-plex-mono-OFL.txt"),plexSans:r("vendor/fonts/LICENCE-ibm-plex-sans-condensed-OFL.txt")})+";")'
  for f in sample.js views.js mondeui.js aide_en.js ui.js; do cat "$f"; echo; done
  echo '</script>'; echo '</body>'; echo '</html>'; } > index.html
wc -c index.html
