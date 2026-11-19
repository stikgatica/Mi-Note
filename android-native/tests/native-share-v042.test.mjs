import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('WebM ofrece Guardar y Compartir vía el puente nativo Android',()=>{
 const replay=read('../src/replay.js'),ui=read('../scripts/mobile.mjs');
 assert.match(replay,/import \{exportBlob\} from '\.\/export-native\.js'/);
 assert.match(replay,/exportBlob\(new Blob\(parts/);
 assert.match(replay,/exportVideo\('save'\)/);
 assert.match(replay,/exportVideo\('share'\)/);
 assert.doesNotMatch(replay,/function save\(blob\)/);
 assert.match(ui,/id="replayVideo"/);
 assert.match(ui,/id="replayShareVideo"/);
});
test('Android abre ACTION_CREATE_DOCUMENT y ACTION_SEND mediante FileProvider',()=>{
 const java=read('../native-backup/MiNoteFileExportPlugin.java');
 assert.match(java,/Intent\.ACTION_CREATE_DOCUMENT/);
 assert.match(java,/Intent\.ACTION_SEND/);
 assert.match(java,/FileProvider\.getUriForFile/);
 assert.match(java,/Intent\.FLAG_GRANT_READ_URI_PERMISSION/);
 assert.match(java,/appendExport\(/);
 assert.match(java,/appendPdfPage\(/);
 assert.match(java,/finishPdf\(/);
 assert.doesNotMatch(java,/MediaStore\.Downloads|MANAGE_EXTERNAL_STORAGE|Environment\.getExternalStorage/);
 const setup=read('../native-backup/setup.mjs');
 assert.match(setup,/registerPlugin\(MiNoteFileExportPlugin\.class\)/);
 assert.match(setup,/minote_share_paths\.xml/);
 assert.match(setup,/androidx\.core\.content\.FileProvider/);
});
test('Compartir hoja o libro soporta SVG PNG y PDF; varios SVG PNG van en ZIP',()=>{
 const ui=read('../scripts/mobile.mjs'),js=read('../src/share-documents.js');
 assert.match(ui,/id="shareDocumentOpen"/);
 assert.match(ui,/id="shareDocumentScope"/);
 assert.match(ui,/id="shareDocumentFormat"/);
 assert.match(ui,/id="shareDocumentAction"/);
 assert.match(js,/import JSZip from 'jszip'/);
 assert.match(js,/pdfBook\(/);
 assert.match(js,/zipBook\(/);
 assert.match(js,/image\/svg\+xml/);
 assert.match(js,/image\/png/);
 assert.match(js,/application\/zip/);
 assert.match(js,/application\/pdf/); // PDF via native plugin
 const boot=read('../src/android-ui-main.js');
 assert.match(boot,/import\('\.\/share-documents\.js'\)/);
 const builder=read('../scripts/mobile.mjs');
 assert.match(builder,/MiNoteExportSnapshot/);
 assert.match(builder,/MiNoteExportSvg/);
});
test('El protocolo BLE e importador X10 no se modificaron con Compartir',()=>{
 const ble=read('../src/x10-ble.js');
 const offline=read('../src/offline-x10.js');
 assert.match(ble,/parseNotePenFrames/);
 assert.match(ble,/0x8d/);
 assert.match(offline,/decodePage/);
 assert.doesNotMatch(offline,/frame\(0x8b|frame\(0x8c/i);
});
