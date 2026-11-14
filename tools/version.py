#!/usr/bin/env python3
"""Ajoute un numéro de version (?v=…) à la feuille de style, aux scripts et à chaque import de www/.

Sans ça, Safari peut garder d'anciens fichiers JavaScript en cache (GitHub Pages les sert avec
10 minutes de cache) et les mélanger avec la nouvelle page : écran noir.
À lancer avant chaque mise en ligne :  python3 tools/version.py
"""
import re
import sys
import time
from pathlib import Path

www = Path(__file__).resolve().parent.parent / 'www'
version = sys.argv[1] if len(sys.argv) > 1 else time.strftime('%Y%m%d%H%M%S')

def stamp(text: str) -> str:
    # href="css/app.css" / src="js/app.js" (avec ou sans ?v= déjà présent)
    text = re.sub(r'((?:href|src)="(?:css|js)/[\w./-]+\.(?:css|js))(\?v=[\w.-]+)?"', rf'\1?v={version}"', text)
    # import … from './x.js'  /  import('./x.js')
    text = re.sub(r"""((?:from\s+|import\()\s*['"]\.{1,2}/[\w./-]+\.js)(\?v=[\w.-]+)?(['"])""", rf'\1?v={version}\3', text)
    return text

files = [www / 'index.html'] + sorted((www / 'js').glob('*.js'))
for f in files:
    old = f.read_text(encoding='utf-8')
    new = stamp(old)
    if new != old:
        f.write_text(new, encoding='utf-8')
print(f'version {version} : {len(files)} fichiers vérifiés')
