// Instalación idempotente del FileProvider PRIVADO de Mi Note.
// No reutilizar el FileProvider de Capacitor u otro plugin: la clase/autoridad
// debe ser única, o Android fusionará metadatos de dos proveedores diferentes.
export const PROVIDER_CLASS='cl.stikgatica.minote.x10.MiNoteShareProvider';
export const PROVIDER_AUTHORITY='${applicationId}.minote.files';
export const PROVIDER_XML='@xml/minote_share_paths';
export function addMiNoteProvider(manifest){
 if(typeof manifest!=='string'||!manifest.includes('</application>'))throw Error('AndroidManifest.xml sin nodo application de cierre.');
 if(manifest.includes(PROVIDER_CLASS)){
  if(!manifest.includes(PROVIDER_AUTHORITY)||!manifest.includes(PROVIDER_XML))
   throw Error('El proveedor privado ya existe pero no coincide su autoridad o su XML.');
  return manifest;
 }
 const xml=`<provider android:name="${PROVIDER_CLASS}"
  android:authorities="${PROVIDER_AUTHORITY}"
  android:exported="false"
  android:grantUriPermissions="true">
  <meta-data android:name="android.support.FILE_PROVIDER_PATHS"
    android:resource="${PROVIDER_XML}" />
 </provider>`;
 const result=manifest.replace('</application>',xml+'\n</application>');
 if(!result.includes(PROVIDER_CLASS)||!result.includes(PROVIDER_AUTHORITY))throw Error('No fue posible instalar FileProvider privado.');
 return result;
}
