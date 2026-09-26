# Versión en inglés (/en/)

Las páginas de `en/` **no se editan a mano**: se generan a partir de las páginas en español.

- `keys.json` — todos los textos en español que hay que traducir.
- `translations.json` — diccionario `{"texto en español": "texto en inglés"}`.
- `extract.py` — vuelve a extraer los textos de las páginas en español.
- `apply.py` — genera `en/*.html` (traduce textos, ajusta rutas y el selector ES/EN).

Los textos que genera el JavaScript (errores de formularios, calculadoras) se traducen en `js/main.js` (`NT_EN` y la función `T()`).

Los enlaces van sin `.html` (`consultoria`, `en/consultoria`, portada `./`); el `.htaccess` de la raíz sirve el archivo `.html` y redirige (301) las URLs antiguas con `.html`.

## Cuando cambies un texto en español

1. `python3 tools/i18n/extract.py` → actualiza `keys.json`.
2. `python3 tools/i18n/apply.py` → si hay textos nuevos sin traducir, avisa con la lista y no genera nada.
3. Añade esos textos a `translations.json` y vuelve a ejecutar `apply.py` → regenera `en/`.
