# Versión en inglés (/en/)

Las páginas de `en/` **no se editan a mano**: se generan a partir de las páginas en español.

- `keys.json` — todos los textos en español, en orden (su posición es su número).
- `t01.tsv` … `t07.tsv` — traducciones: `número<TAB>texto en inglés`.
- `extract.py` — vuelve a extraer los textos de las páginas en español.
- `apply.py` — genera `en/*.html` (traduce textos, ajusta rutas y el selector ES/EN).

Los textos que genera el JavaScript (errores de formularios, calculadoras) se traducen en `js/main.js` (`NT_EN` y la función `T()`).

## Cuando cambies un texto en español

1. `python3 tools/i18n/extract.py` → actualiza `keys.json` e `ids.txt` (los textos nuevos aparecen con su número).
2. Añade la traducción de los números nuevos en un `t08.tsv`.
3. `python3 tools/i18n/apply.py` → regenera `en/`. Si falta alguna traducción, el script avisa y no genera nada.

Ojo: `extract.py` renumera; si un texto cambia de posición, revisa que las traducciones antiguas sigan cuadrando (el script comprueba que no falte ninguna).
