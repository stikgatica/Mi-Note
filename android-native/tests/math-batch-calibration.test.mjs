import test from 'node:test';
import assert from 'node:assert/strict';
import {captureBatchBaseline,readBatchCells,trainBatch} from '../src/math/math-batch-calibration.mjs';
import {createUserProfile} from '../src/math/math-personalization.mjs';
const stroke=(id,pts)=>({id,pts});
test('each repetition is an independent multi-stroke example; old ink excluded',()=>{
 const page={id:'p',orientation:'portrait',strokes:[stroke('old',[[1,1],[5,10]])]};
 const baseline=captureBatchBaseline(page,5);
 page.strokes.push(stroke('a',[[30,30],[70,70]]),stroke('b',[[30,70],[70,30]]),stroke('c',[[230,30],[270,70]]),stroke('d',[[230,70],[270,30]]));
 const snapshot=JSON.stringify(page);
 const result=readBatchCells(page,baseline);
 assert.deepEqual(result.cells.map(c=>c.strokes.length),[2,2,0,0,0]);
 const profile=trainBatch(createUserProfile(),'×',result.cells.filter(c=>c.valid));
 assert.equal(profile.frequentSymbols['×'],2);
 assert.equal(JSON.stringify(page),snapshot);
});
test('crossing boundaries rejected and different page blocked',()=>{
 const page={id:'p',orientation:'portrait',strokes:[]};
 const baseline=captureBatchBaseline(page,5);
 page.strokes.push(stroke('bad',[[190,10],[220,30]]));
 assert.deepEqual(readBatchCells(page,baseline).rejected,['bad']);
 assert.throws(()=>readBatchCells({...page,id:'q'},baseline));
});
test('landscape reading coordinates and numeric category',()=>{
 const page={id:'p',orientation:'landscape-cw',strokes:[]};
 const baseline=captureBatchBaseline(page,10);
 page.strokes.push(stroke('one',[[20,1380],[80,1380]]));
 const cells=readBatchCells(page,baseline).cells.filter(c=>c.valid);
 assert.equal(cells.length,1);
 const profile=trainBatch(createUserProfile(),'1',cells);
 assert.equal(profile.calibrationHistory[0].category,'numbers');
 assert.throws(()=>trainBatch(profile,'1',[cells[0],cells[0]]));
});
