import test from 'node:test';import assert from 'node:assert/strict';import {validResult} from '../js/saisupi-result.js';
test('retired snapshot cannot invent completed target count',()=>{assert.equal(validResult({retired:true,phase:'RUNNING',targetCount:10,completedTargetCount:10,elapsedMs:100,scoreCentiseconds:null,targetTimings:[]}),false)});
