// Android Storage Access Framework: instalar plugin en el proyecto generado por Capacitor.
import fs from 'node:fs/promises';
import path from 'node:path';
import {addMiNoteProvider,PROVIDER_CLASS,PROVIDER_AUTHORITY,PROVIDER_XML} from './share-provider.mjs';
const root=process.cwd();
const javaRoot=path.join(root,'android','app','src','main','java');
const pkg=path.join(javaRoot,'cl','stikgatica','minote','x10');
await fs.mkdir(pkg,{recursive:true});
await fs.copyFile(path.join(root,'native-backup','PrivateBackupPlugin.java'),path.join(pkg,'PrivateBackupPlugin.java'));
await fs.copyFile(path.join(root,'native-backup','MiNoteFileExportPlugin.java'),path.join(pkg,'MiNoteFileExportPlugin.java'));
await fs.copyFile(path.join(root,'native-backup','MiNoteShareProvider.java'),path.join(pkg,'MiNoteShareProvider.java'));
await fs.copyFile(path.join(root,'native-backup','MiNoteCalendarPlugin.java'),path.join(pkg,'MiNoteCalendarPlugin.java'));
const activity=path.join(pkg,'MainActivity.java');
const content=`package cl.stikgatica.minote.x10;

import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PrivateBackupPlugin.class);
    registerPlugin(MiNoteFileExportPlugin.class);
    registerPlugin(MiNoteCalendarPlugin.class);
    super.onCreate(savedInstanceState);
    applyPizarraFullscreen();
  }

  @Override public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    applyPizarraFullscreen();
  }

  @Override public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) applyPizarraFullscreen();
  }

  private void applyPizarraFullscreen() {
    boolean landscape = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
    View decor = getWindow().getDecorView();
    if (landscape) {
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
      decor.setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
        View.SYSTEM_UI_FLAG_FULLSCREEN |
        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    } else {
      decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
      getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
    }
  }
}
`;
await fs.writeFile(activity,content);
// El modelo español se descarga SOLO con el consentimiento del usuario.
// Una vez descargado, el reconocimiento de trazos se hace en el dispositivo.
const gradle=path.join(root,'android','app','build.gradle');
let build=await fs.readFile(gradle,'utf8');
if(!build.includes("com.google.mlkit:digital-ink-recognition:19.0.0")){
 const marker='dependencies {';
 if(!build.includes(marker))throw Error('No se encontró bloque dependencies para ML Kit.');
 build=build.replace(marker,marker+"\n    implementation 'com.google.mlkit:digital-ink-recognition:19.0.0'");
 await fs.writeFile(gradle,build);
}

const xmlRoot=path.join(root,'android','app','src','main','res','xml');
await fs.mkdir(xmlRoot,{recursive:true});
await fs.writeFile(path.join(xmlRoot,'minote_share_paths.xml'),`<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
 <cache-path name="shared_documents" path="shared_documents/" />
</paths>\n`);
const manifestFile=path.join(root,'android','app','src','main','AndroidManifest.xml');
let manifest=await fs.readFile(manifestFile,'utf8');
manifest=addMiNoteProvider(manifest);
if(!manifest.includes('android.permission.INTERNET')){
 manifest=manifest.replace('<manifest ', '<manifest ');
 manifest=manifest.replace(/(<manifest[^>]*>)/,'$1\n<uses-permission android:name="android.permission.INTERNET" />');
}

await fs.writeFile(manifestFile,manifest);
if(!manifest.includes(PROVIDER_CLASS)||!manifest.includes(PROVIDER_AUTHORITY)||!manifest.includes(PROVIDER_XML))
 throw Error('Proveedor nativo de Compartir incompleto.');

console.log('Plugins nativos de respaldo y Compartir Android registrados sin permisos globales de almacenamiento.');
