#!/usr/bin/env sh
# Builds both versions of Savepoint.
#  - savepoint/index.html: the claude.ai version (savepoint/app.html) wrapped as a standalone page.
#  - index.html (repo root): the picture-first website for GitHub Pages, from site/index.src.html,
#    with the Instagram export reader copied in from savepoint/app.html so both stay in sync.
set -e
cd "$(dirname "$0")/.."
{
  printf '%s\n' '<!doctype html>' '<html lang="en">' '<head>' '<meta charset="utf-8">' \
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' '</head>' '<body>'
  cat savepoint/app.html
  printf '%s\n' '</body>' '</html>'
} > savepoint/index.html
node -e '
const fs = require("fs");
const app = fs.readFileSync("savepoint/app.html", "utf8");
const cut = (a, b) => { const i = app.indexOf(a), j = app.indexOf(b); if (i < 0 || j < 0) throw new Error("marker missing: " + a); return app.slice(i, j + b.length); };
const shared = cut("/* =============== Instagram export parser (PARSER-START)", "/* (PARSER-END) */") + "\n" + cut("/* ZIP-START */", "/* ZIP-END */");
const src = fs.readFileSync("site/index.src.html", "utf8");
if (!src.includes("/*@@SHARED@@*/")) throw new Error("placeholder missing");
fs.writeFileSync("index.html", src.replace("/*@@SHARED@@*/", () => "/* Copied from savepoint/app.html by scripts/build.sh. Edit it there. */\n" + shared));
'
touch .nojekyll
echo "Built savepoint/index.html and index.html"
