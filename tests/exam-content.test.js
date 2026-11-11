import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deskQuestions,inspectionItems,examStages} from '../src/exam-content.js';
import {chooseQuestions} from '../src/exam-flow.js';
test('independent four-choice pool supplies four unique seeded questions',()=>{
  assert.ok(deskQuestions.length>=8);assert.equal(new Set(deskQuestions.map(q=>q.id)).size,deskQuestions.length);
  for(const q of deskQuestions){assert.equal(q.choices.length,4);assert.ok(q.answer>=0&&q.answer<4);}
  assert.equal(new Set(chooseQuestions(1)).size,4);assert.deepEqual(chooseQuestions(1),chooseQuestions(1));assert.notDeepEqual(chooseQuestions(1),chooseQuestions(2));
  assert.equal(new Set(inspectionItems.map(i=>i.id)).size,inspectionItems.length);assert.equal(examStages.at(-1).id,'result');
});
test('6-1 asks for accidents only; serious incidents are distractors',async()=>{
  const {incidentCases,incidentPrompt}=await import('../src/exam-content.js');
  assert.match(incidentPrompt,/事故/);assert.equal(incidentCases.filter(c=>c.correct).length,3);
  assert.ok(incidentCases.filter(c=>c.correct).every(c=>!c.text.includes('重大インシデント')));
});
