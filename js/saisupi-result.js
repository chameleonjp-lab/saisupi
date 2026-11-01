import {queueResult,isAcknowledged,acknowledgeResult,validSubmissionId} from './saisupi-outbox.js';
import {P1_PHASES} from './saisupi-session.js';
import {scoreCentisecondsFromElapsedMs} from './saisupi-clock.js';
export function validResult(r) {
 if(!r || typeof r.retired!=='boolean' || !Number.isInteger(r.completedTargetCount) || r.completedTargetCount<0 || r.completedTargetCount>10 || !Array.isArray(r.targetTimings) || r.targetTimings.length>10)return false;
 const seen=new Set();
 for(const t of r.targetTimings){if(!t || !Number.isInteger(t.index) || t.index<1 || t.index>10 || seen.has(t.index) || typeof t.completed!=='boolean')return false;seen.add(t.index);if(t.completed&&(!Number.isSafeInteger(t.scoreCentiseconds)||t.scoreCentiseconds<0))return false;}
 if(!Number.isFinite(r.elapsedMs)||r.elapsedMs<0||r.targetCount!==10||!Object.values(P1_PHASES).includes(r.phase)||r.targetTimings.filter(t=>t.completed).length!==r.completedTargetCount)return false;
 if(r.retired)return r.phase!=='FINISHED' && r.completedTargetCount<10 && r.scoreCentiseconds===null && r.targetTimings.every(t=>!t.completed||t.scoreCentiseconds<=scoreCentisecondsFromElapsedMs(r.elapsedMs));
 return r.phase==='FINISHED' && r.targetCount===10 && r.completedTargetCount===10 && r.targetTimings.length===10 && r.targetTimings.every(t=>t.completed&&t.scoreCentiseconds<=r.scoreCentiseconds) && Math.max(...r.targetTimings.map(t=>t.scoreCentiseconds))===r.scoreCentiseconds && Number.isSafeInteger(r.scoreCentiseconds) && r.scoreCentiseconds>=0 && r.scoreCentiseconds<=100000000 && scoreCentisecondsFromElapsedMs(r.elapsedMs)===r.scoreCentiseconds;
}
export function validSnapshot(value){return validResult(value?.result)&&typeof value.run?.displayName==='string'&&typeof value.run.clientVersion==='string'&&(validSubmissionId(value.run.submissionId)||value.run.submissionId===null);}
export function saveSnapshot(storage,key,value){if(!storage)throw Error('Storage unavailable');const raw=JSON.stringify(value);storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('Storage did not persist snapshot');}
export async function submitDurableResult(storage,run,result,client){
 if(!run.displayName||result.retired)return null;
 if(!validResult(result))throw Error('Unverified result');
 queueResult(storage,run,result);
 if(isAcknowledged(storage,run.submissionId))return {accepted:true,bestScore:null,isNewBest:false};
 const response=await client.submitScore({displayName:run.displayName,submissionId:run.submissionId,clientVersion:run.clientVersion,score:result.scoreCentiseconds});
 acknowledgeResult(storage,run.submissionId,{run,result});
 return response;
}
