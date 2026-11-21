import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mathematicalLines,recognizeHybridLine,hasHandwrittenEquals,reviewDigitAmbiguities,
 normalizeArithmetic,hasBinaryArithmetic} from '../src/math/math-hybrid-ocr.mjs';
const stroke=(id,x,y,w=14,h=37)=>({id,pts:[[x,y],[x+w*.5,y+h*.3],[x+w,y+h]]});
test('two small colon dots remain inside the line of 24:7= and other two rows stay independent',()=>{
 const ink=[
  stroke('two',85,100),stroke('four',116,105),stroke('colon1',149,110,3,3),
  stroke('colon2',149,135,3,3),stroke('seven',179,100),
  stroke('eq1',219,113,24,2),stroke('eq2',219,128,24,2),
  stroke('first-other',95,300),stroke('next-other',128,300),
  stroke('last',98,500)
 ];
 const lines=mathematicalLines(ink);
 assert.equal(lines.length,3,JSON.stringify(lines.map(l=>l.strokeIds)));
 assert.deepEqual(lines[0].strokeIds,ink.slice(0,7).map(x=>x.id));
 assert.equal(lines[1].strokes.length,2);
});
test('a handwritten equals pair on right side is detected, but a single stroke is not',()=>{
 const ink=[stroke('one',20,70),stroke('two',60,70),
  stroke('equal1',120,85,24,2),stroke('equal2',120,98,24,2)];
 assert.equal(hasHandwrittenEquals(ink),true);
 assert.equal(hasHandwrittenEquals(ink.slice(0,3)),false);
});
test('ML Kit omits = but visible parallel lines allow a review-only proposal',async()=>{
 const ink=[stroke('one',20,70),stroke('two',60,70),
  stroke('equal1',120,85,24,2),stroke('equal2',120,98,24,2)];
 const result=await recognizeHybridLine(ink,async()=>({candidates:['10-0']}));
 assert.ok(result);
 assert.equal(result.text,'10-0=');
 assert.equal(result.autoAccept,false);
 assert.equal(result.needsReview,true);
});
test('0 versus 8 remains a user choice, with no automatic guessing',async()=>{
 const options=reviewDigitAmbiguities('10-0=');
 assert.deepEqual(options,['10-8=']);
 assert.deepEqual(reviewDigitAmbiguities('10-8='),['10-0=']);
 const ink=[stroke('ten',20,70),stroke('minus',60,80),stroke('zero',90,70)];
 const res=await recognizeHybridLine(ink,async()=>({candidates:['10-0=']}));
 assert.equal(res.text,'10-0=');
 assert.equal(res.autoAccept,false);
 assert.ok(res.alternatives.includes('10-8='));
});
test('normalization retains operator without solving it',()=>{
 assert.equal(normalizeArithmetic('24:7=')?.text,'24÷7=');
 assert.equal(hasBinaryArithmetic('24:7='),true);
 assert.equal(normalizeArithmetic('10-8=')?.text,'10-8=');
});
test('re-scan and visible pending counter prevent misleading 0 new message',()=>{
 const ui=readFileSync(new URL('../src/math/math-controller.js',import.meta.url),'utf8');
 assert.match(ui,/propuesta\(s\) pendientes de revisión/);
 assert.match(ui,/!all&&previous&&!\$\('mathAutoDigital'\)\.checked/);
 assert.match(ui,/Dígito final dudoso/);
 assert.match(ui,/selector\.addEventListener\('change'/);
});
