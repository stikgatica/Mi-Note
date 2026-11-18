import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/x10-ble.js';

test('0x8A avisa al cuaderno cuando la Huion pulsa nueva página',()=>{
 const notified=[];
 const c=new globalThis.MiNoteX10Ble.Connection({onNewPage:index=>notified.push(index)});
 const bytes=Uint8Array.from([0xcd,0x8a,0x05,0x03,0x00]);
 c._onData({target:{value:new DataView(bytes.buffer)}});
 assert.deepEqual(notified,[3]);
});
test('el modo agenda se solicita con un comando no destructivo',()=>{
 assert.deepEqual([...globalThis.MiNoteX10Ble.frame(0x81)],[0xcd,0x81,0x08,0,0,0,0,0xed]);
});
test('las tramas de datos se entregan a suscriptores sin almacenarlas',()=>{
 const seen=[];
 const c=new globalThis.MiNoteX10Ble.Connection({});
 const unsubscribe=c.subscribeFrames(frame=>seen.push([...frame]));
 const bytes=Uint8Array.from([0xcd,0x85,0x05,0x01,0x00]);
 c._onData({target:{value:new DataView(bytes.buffer)}});
 unsubscribe();
 c._onData({target:{value:new DataView(bytes.buffer)}});
 assert.deepEqual(seen,[[0xcd,0x85,0x05,1,0]]);
});
