// Endurecimiento del APK Android: se aplica después de "cap sync".
// No modifica la PWA ni solicita permisos nuevos de los usuarios.
import fs from 'node:fs/promises';
import path from 'node:path';
const file=path.join('android','app','src','main','AndroidManifest.xml');
let xml=await fs.readFile(file,'utf8');
if(!xml.includes('xmlns:tools='))xml=xml.replace('<manifest ','<manifest xmlns:tools="http://schemas.android.com/tools" ');
xml=xml.replace(/<uses-permission\s+android:name="android.permission.INTERNET"\s*\/>/g,'');
xml=xml.replace(/<uses-permission\s+android:name="android.permission.ACCESS_FINE_LOCATION"[^>]*\/>/g,'');
xml=xml.replace(/<uses-permission\s+android:name="android.permission.ACCESS_COARSE_LOCATION"[^>]*\/>/g,'');
xml=xml.replace(/<uses-permission\s+android:name="android.permission.ACCESS_BACKGROUND_LOCATION"[^>]*\/>/g,'');
xml=xml.replace('<application ', '<uses-permission android:name="android.permission.INTERNET" tools:node="remove" />\n'
 +'    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" tools:node="remove" />\n'
 +'    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" tools:node="replace" />\n'
 +'    <application ');
xml=xml.replace(/android:allowBackup="[^"]*"/g,'android:allowBackup="false"');
if(!xml.includes('android:allowBackup='))xml=xml.replace('<application ','<application android:allowBackup="false" ');
if(!xml.includes('android:usesCleartextTraffic='))xml=xml.replace('<application ','<application android:usesCleartextTraffic="false" ');
const attrs='android:dataExtractionRules="@xml/mi_note_data_extraction_rules"';
if(!xml.includes('android:dataExtractionRules='))xml=xml.replace('<application ','<application '+attrs+' ');
xml=xml.replace(/android:label="[^"]*"/, 'android:label="Mi Note X10"');
await fs.writeFile(file,xml);
const res=path.join('android','app','src','main','res','xml');
await fs.mkdir(res,{recursive:true});
await fs.writeFile(path.join(res,'mi_note_data_extraction_rules.xml'),`<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
 <cloud-backup><exclude domain="root" path="."/></cloud-backup>
 <device-transfer><exclude domain="root" path="."/></device-transfer>
</data-extraction-rules>
`);
const gradle=path.join('android','app','build.gradle');
let grad=await fs.readFile(gradle,'utf8');
if(!grad.includes('versionCode 2')){
 grad=grad.replace(/versionCode\s+\d+/,'versionCode 2');
 grad=grad.replace(/versionName\s+["'][^"']+["']/,'versionName "0.2.0"');
}
await fs.writeFile(gradle,grad);
console.log('Android: permisos limitados, red desactivada, backup desactivado y versión 0.2.0.');
