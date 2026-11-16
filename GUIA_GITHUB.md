# Publicar Mi Note en tu propio GitHub

**Repositorio sugerido:** `stikgatica/Mi-Note`.

1. Abre https://github.com/new, usa el nombre `Mi-Note`, marca **Public** y activa **Add a README file** para crear la rama `main`.
2. Sube los archivos de este proyecto a la raiz del repositorio. No subas el ZIP sin descomprimir; `index.html` debe quedar visible en la raiz.
3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main → Folder: /(root) → Save**.
4. Una vez publicado, la dirección esperada es `https://stikgatica.github.io/Mi-Note/` (no existirá antes del despliegue).
5. Abre la URL en Chrome/Edge en Windows o Chrome en Android. Cuando tu navegador lo permita, usa **Instalar**.

## Privacidad

- GitHub Pages publica los archivos del sitio web y la app. **No subas cuadernos, respaldos JSON, credenciales ni fotografías privadas al repositorio.**
- Los cuadernos que crees con Mi Note se guardan primero en el almacenamiento local de cada navegador.
- El respaldo Google Drive es **manual** en esta versión; requiere configurar un OAuth Client ID (web) y habilitar Drive API. No implica sincronización automática.
- Los datos locales se perderían si se eliminan los datos del sitio o el perfil del navegador y no existe copia de seguridad. Haz exportaciones periódicas.
- Aún no se extraen hojas directamente por Bluetooth: los archivos JSON de la X10 deben venir de un extractor externo.
