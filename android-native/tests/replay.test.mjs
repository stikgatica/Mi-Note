import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimeline,timelineAt} from '../src/replay-timeline.mjs';
test('orden temporal creciente de trazos y pausa entre ellos',()=>{
 const t=createTimeline([
  {pts:[[0,0,.5],[100,0,.5]],color:'#123abc',width:3},
  {pts:[[10,10,.4],[50,10,.4]]}
 ]);
 assert.equal(t.strokes,2);
 assert.ok(t.clips[1].start>t.clips[0].end);
 assert.ok(t.total>=t.clips[1].end);
 assert.equal(t.clips[0].steps.length,1);
});
test('trazos vacíos y valores fuera de límites son seguros',()=>{
 const t=createTimeline([
  {pts:[]},{pts:[[2000,-3,.4]]}, {pts:[['invalid',3]]}
 ]);
 assert.equal(t.strokes,1);
 assert.deepEqual(t.clips[0].points[0],[1000,0,.4]);
 assert.equal(timelineAt(t,-10),0);
 assert.equal(timelineAt(t,10),t.total);
});
test('la reproducción no modifica las coordenadas de entrada',()=>{
 const a={pts:[[1,2,.3],[100,20,.6]],color:'#ff0033',width:2};
 const original=JSON.stringify(a);
 const t=createTimeline([a]);
 assert.equal(JSON.stringify(a),original);
 assert.equal(t.clips[0].color,'#ff0033');
});
