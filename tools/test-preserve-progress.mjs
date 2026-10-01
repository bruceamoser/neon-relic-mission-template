import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveProgress } from '../static/scripts/preserve-progress.mjs';
test('mission refresh keeps live board state while adopting revised event text', () => {
  const live = { type: 'caseBoard', system: { currentDay: 11, shiftsFilled: [{day:12,shift:'Night',filled:true}], informationCardUuids:['Item.known'], relicMilestones:[{day:10,description:'old',triggered:true},{day:3,description:'custom',triggered:true}], organizations:[{id:'O1',value:5,active:false,dormant:true,squaresConsumed:[14,13],milestones:[{label:'O1M1',day:7,triggered:true}]},{id:'CUSTOM',value:2,milestones:[]}] } };
  const pack = {type:'caseBoard',system:{currentDay:14,shiftsFilled:[],informationCardUuids:[],relicMilestones:[{day:10,description:'new',triggered:false}],organizations:[{id:'O1',value:0,active:true,dormant:false,squaresConsumed:[],milestones:[{label:'O1M1',day:7,description:'new attempt',triggered:false}]}]}};
  const original=structuredClone(pack),out=preserveProgress(live,pack).system;
  assert.equal(out.currentDay,11);assert.deepEqual(out.shiftsFilled,live.system.shiftsFilled);assert.deepEqual(out.informationCardUuids,['Item.known']);
  assert.equal(out.relicMilestones[0].description,'new');assert.equal(out.relicMilestones[0].triggered,true);assert.equal(out.relicMilestones[1].description,'custom');
  assert.equal(out.organizations[0].value,5);assert.equal(out.organizations[0].active,false);assert.equal(out.organizations[0].dormant,true);assert.deepEqual(out.organizations[0].squaresConsumed,[14,13]);assert.equal(out.organizations[0].milestones[0].triggered,true);assert.equal(out.organizations[1].id,'CUSTOM');assert.deepEqual(pack,original);
});
test('hidden cards and faction activation survive authored updates',()=>{
 assert.equal(preserveProgress({type:'informationCard',system:{revealed:false}},{system:{revealed:true,content:'revised'}}).system.revealed,false);
 assert.equal(preserveProgress({type:'organization',system:{isActive:false,isDormant:true}},{system:{isActive:true,isDormant:false}}).system.isDormant,true);
});
test('ordinary documents and new milestones keep authored values',()=>{
 const incoming={system:{description:'revised'}};assert.deepEqual(preserveProgress({type:'npc',system:{}},incoming),incoming);
 assert.equal(preserveProgress({type:'caseBoard',system:{}},{system:{relicMilestones:[{day:9,triggered:false}],organizations:[]}}).system.relicMilestones[0].triggered,false);
});
