import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('Horizontal usa pizarra blanca inmersiva, sin estirar las coordenadas A5',()=>{
 const css=read('../src/floating-ui.css');
 const landscape=read('../src/landscape-ui.js');
 assert.match(landscape,/classList\.toggle\('landscape-board',landscape\)/);
 assert.match(landscape,/window\.innerWidth>window\.innerHeight/);
 assert.match(css,/\.landscape-board \.workspace/);
 assert.match(css,/background:#fff!important/);
 assert.match(css,/width:min\(100vw,140dvh\)!important/);
 assert.match(css,/aspect-ratio:7 \/ 5!important/);
 assert.match(css,/\.landscape-board \.paper-shell canvas#paper/);
 assert.doesNotMatch(landscape,/canvas\.style\.transform\s*=/);
});
test('Barras del sistema se ocultan solo horizontal y reaparecen vertical',()=>{
 const setup=read('../native-backup/setup.mjs');
 assert.match(setup,/onConfigurationChanged\(Configuration newConfig\)/);
 assert.match(setup,/onWindowFocusChanged\(boolean hasFocus\)/);
 assert.match(setup,/Configuration\.ORIENTATION_LANDSCAPE/);
 assert.match(setup,/SYSTEM_UI_FLAG_IMMERSIVE_STICKY/);
 assert.match(setup,/SYSTEM_UI_FLAG_HIDE_NAVIGATION/);
 assert.match(setup,/View\.SYSTEM_UI_FLAG_VISIBLE/);
 assert.match(setup,/clearFlags\(WindowManager\.LayoutParams\.FLAG_FULLSCREEN\)/);
});
test('Biblioteca tiene controles independientes sin superposición',()=>{
 const library=read('../src/library-v021.js');
 const css=read('../src/library-v021.css');
 const floating=read('../src/floating-ui.js');
 assert.match(library,/huion-library-tools/);
 assert.match(library,/id="floatingLibraryClose"/);
 assert.match(floating,/node\('floatingSidebarClose'/);
 assert.doesNotMatch(floating,/node\('floatingLibraryClose'/);
 assert.match(css,/\.huion-library-tools button/);
 assert.match(css,/position:static!important/);
});
test('La compilación conserva versionado coherente y pizarra desde V0.48',()=>{
 const workflow=read('../../.github/workflows/android-release.yml');
 const pkg=JSON.parse(read('../package.json'));
 const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
 assert.ok(match);
 const minor=Number(match[2]);
 assert.ok(minor>=48);
 assert.match(workflow,new RegExp('versionCode '+minor+'\\b'));
 const tag='v'+match[1]+'.'+match[2];
 assert.ok(workflow.includes('Mi-Note-X10-Android-'+tag+'.apk'));
 assert.ok(workflow.includes('android-'+tag));
});
