import {test} from 'node:test';
import assert from 'node:assert/strict';
import {examView} from '../src/exam-ui.js';
import {createExam} from '../src/exam-flow.js';
import {createPractical} from '../src/exam-practical.js';
test('console models papers, sequential oral questions, examiner instructions and result',()=>{
  const s=createExam();assert.equal(examView(s).flight,false);
  const flight=examView({...s,stage:'square',practical:createPractical('square')});assert.equal(flight.flight,true);assert.match(flight.line,/離陸/);
  assert.match(examView({...s,stage:'air',oralIndex:2}).line,/周辺/);assert.match(examView({...s,stage:'result'}).title,/模擬/);
});
import {examPaper} from '../src/exam-ui.js';
test('paper renders all stages, complete forms, escaped identity, and per-item score totals',()=>{
  let s=createExam();s.name='<script>bad</script>';s.metadata={name:s.name};
  for(const stage of ['reception','desk','air','preflight','powered','preRecord','post','incident1','incident2','result']) {
    const html=examPaper({...s,stage});assert.ok(html.length>50,stage);assert.ok(!html.includes('<script>'),stage);assert.ok(!html.includes('undefined'),stage);
  }
  assert.match(examPaper({...s,stage:'preflight'}),/&lt;script&gt;/);
  const post=examPaper({...s,stage:'post'});for(const name of ['date','name','overview','takeoffPlace','landingPlace','safety','defects','minutes','total'])assert.ok(post.includes(`name="${name}"`));
  const result=examPaper({...s,stage:'result'});assert.match(result,/公式の合否ではない/);assert.match(result,/70点/);assert.match(result,/安全確認不足/);assert.match(result,/未評価/);
});
