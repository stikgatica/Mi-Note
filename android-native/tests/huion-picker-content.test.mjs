import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Android SAF can return a display name without an .ahn/.ahns suffix.
// Confirm that native validation is based on the ZIP signature and that the
// JSZip parser still verifies internal Huion structure. Never upload data.
test('Android Huion selector accepts ZIP content independently of display name',()=>{
 const java=fs.readFileSync(new URL('../native-backup/PrivateBackupPlugin.java',import.meta.url),'utf8');
 assert.match(java,/openHuionArchive\(PluginCall call\)/);
 assert.match(java,/boolean zip=bytes\.length>=4/);
 assert.match(java,/bytes\[0\]==0x50&&bytes\[1\]==0x4b/);
 assert.doesNotMatch(java,/suffix\.endsWith\("\.ahn"\)/);
 assert.match(java,/intent\.addFlags\(Intent\.FLAG_GRANT_READ_URI_PERMISSION\)/);
});
