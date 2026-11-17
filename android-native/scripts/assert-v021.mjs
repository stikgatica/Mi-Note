import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const [boot,app,library,css]=await Promise.all([
 fs.readFile('stage/android-ui-main.js','utf8'),fs.readFile('stage/app.js','utf8'),
 fs.readFile('stage/library-v021.js','utf8'),fs.readFile('stage/library-v021.css','utf8')
]);
assert(boot.includes("import './library-v021.css'"));
assert(boot.includes("import('./library-v021.js')"));
assert(!boot.includes("import('./library-page-ui.js')"));
for(const k of ['previewNotebook(id)','async addNotebook(title,options={})','nb.cover=','nb.pages[0].orientation=','createdAt:n.createdAt']) assert(app.includes(k),'Falta '+k);
for(const k of ['huion-notebook-grid','huionNewNotebook','huionNewTemplate','huionNewOrientation','huionSearchToggle','floatingCreateNotebook']) assert(library.includes(k),'Falta '+k);
assert(css.includes('huion-book-cover'));
console.log('OK V0.21: biblioteca visual, portadas y creación guiada.');
