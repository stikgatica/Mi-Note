// Android Storage Access Framework: instalar plugin en el proyecto generado por Capacitor.
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const javaRoot=path.join(root,'android','app','src','main','java');
const pkg=path.join(javaRoot,'cl','stikgatica','minote','x10');
await fs.mkdir(pkg,{recursive:true});
await fs.copyFile(path.join(root,'native-backup','PrivateBackupPlugin.java'),path.join(pkg,'PrivateBackupPlugin.java'));
await fs.copyFile(path.join(root,'native-backup','MiNoteFileExportPlugin.java'),path.join(pkg,'MiNoteFileExportPlugin.java'));
const activity=path.join(pkg,'MainActivity.java');
const content=`package cl.stikgatica.minote.x10;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PrivateBackupPlugin.class);
    registerPlugin(MiNoteFileExportPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
`;
await fs.writeFile(activity,content);
const xmlRoot=path.join(root,'android','app','src','main','res','xml');
await fs.mkdir(xmlRoot,{recursive:true});
await fs.writeFile(path.join(xmlRoot,'minote_share_paths.xml'),`<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
 <cache-path name="shared_documents" path="shared_documents/" />
</paths>\n`);
const manifestFile=path.join(root,'android','app','src','main','AndroidManifest.xml');
let manifest=await fs.readFile(manifestFile,'utf8');
if(!manifest.includes('androidx.core.content.FileProvider')){
 const provider=`<provider android:name="androidx.core.content.FileProvider"
 android:authorities="\${applicationId}.minote.files"
 android:exported="false" android:grantUriPermissions="true">
 <meta-data android:name="android.support.FILE_PROVIDER_PATHS"
 android:resource="@xml/minote_share_paths" />
 </provider>`;
 manifest=manifest.replace('</application>',provider+'\n</application>');
 await fs.writeFile(manifestFile,manifest);
}
console.log('Plugins nativos de respaldo y Compartir Android registrados sin permisos globales de almacenamiento.');
