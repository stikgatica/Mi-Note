import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('Calendario Capacitor usa importaciones correctas del SDK ML Kit',()=>{
 const java=read('../native-backup/MiNoteCalendarPlugin.java');
 assert.match(java,/import com\.getcapacitor\.PluginMethod;/);
 assert.match(java,/import com\.getcapacitor\.annotation\.CapacitorPlugin;/);
 assert.match(java,/import com\.google\.mlkit\.vision\.digitalink\.recognition\.Ink;/);
 assert.match(java,/import com\.google\.mlkit\.vision\.digitalink\.recognition\.DigitalInkRecognition;/);
 assert.doesNotMatch(java,/import com\.getcapacitor\.annotation\.PluginMethod;/);
 assert.doesNotMatch(java,/import com\.google\.mlkit\.vision\.digitalink\.DigitalInk/);
});
test('La dependencia ML Kit y el permiso de descarga sobreviven a configuración Android',()=>{
 const setup=read('../native-backup/setup.mjs'),harden=read('../scripts/harden.mjs'),workflow=read('../../.github/workflows/android-release.yml');
 assert.match(setup,/digital-ink-recognition:19\.0\.0/);
 assert.match(setup,/android\.permission\.INTERNET/);
 assert.doesNotMatch(harden,/android\.permission\.INTERNET" tools:node="remove"/);
 assert.match(workflow,/grep -Fq 'android\.permission\.INTERNET'/);
 assert.doesNotMatch(workflow,/android\.permission\.WRITE_CALENDAR' signed\/PERMISOS\.txt\s*\|\|/);
});
