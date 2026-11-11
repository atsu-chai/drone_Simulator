import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPhysicalExam} from './helpers/exam-flight.js';
import {mockPlan,deskQuestions,airQuestions,inspectionItems,postItems,incidentCases,poweredQuestions} from '../src/exam-content.js';
import {examClock,examResult} from '../src/exam-flow.js';
import {flightMinutes} from '../src/exam-scoring.js';
test('whole exam runs from reception through oral, four actual flights, logs and two incident answers',()=>{
  for(const preset of ['calm','light']) {
    const session=createPhysicalExam({preset}),send=session.send;
    const submit=data=>send({type:'submit',data});
    const inspect=stage=>{for(const item of inspectionItems.filter(i=>i.stage===stage)){send({type:'observe',id:item.id});send({type:'write',id:item.id,value:item.result||'正常'});}};
    const metadata=()=>{for(const [id,value] of Object.entries({registration:mockPlan.registration,name:'検証操縦者',date:session.exam.date,place:mockPlan.place}))send({type:'metadata',id,value});};
    submit({name:'検証操縦者',helmet:true,glasses:true,notice:true});session.advance(30);
    for(const id of session.exam.questions)send({type:'answer',id,value:deskQuestions.find(q=>q.id===id).answer});submit();
    session.advance(30);for(const q of airQuestions)send({type:'answer',id:q.id,value:q.answer});submit();
    inspect('preflight');metadata();session.advance(30);submit();
    send({type:'power',device:'transmitter'});send({type:'power',device:'aircraft'});for(const q of poweredQuestions)send({type:'answer',id:q.id,value:q.answer});inspect('powered');submit();
    assert.equal(session.fly(),'preRecord',JSON.stringify(session.exam.events));inspect('preRecord');submit();
    assert.equal(session.fly(),'eight',JSON.stringify(session.exam.events));assert.equal(session.fly(),'abnormal',JSON.stringify(session.exam.events));assert.equal(session.fly(),'post',JSON.stringify(session.exam.events));
    assert.equal(session.exam.flights.length,4);for(const f of session.exam.flights)assert.ok(f.landed>f.tookOff);
    // Oral time is excluded from every airborne interval, including the first landing.
    assert.ok(session.exam.flights[0].tookOff>90);assert.ok(session.exam.flights[0].landed>90);
    send({type:'power',device:'aircraft'});send({type:'power',device:'transmitter'});
    for(const item of postItems){send({type:'observe',id:item.id});send({type:'write',id:item.id,value:'正常'});}metadata();
    const s=session.exam,record={date:s.date,name:s.name,overview:'飛行点検と実技3科目',takeoffPlace:mockPlan.place,landingPlace:mockPlan.place,safety:'なし',defects:'なし',minutes:flightMinutes(s.flights).toFixed(2),total:(mockPlan.priorMinutes+flightMinutes(s.flights)).toFixed(2)};
    for(const [i,f] of s.flights.entries()){record[`off${i}`]=examClock(s,f.tookOff);record[`on${i}`]=examClock(s,f.landed);record[`minutes${i}`]=flightMinutes([f]).toFixed(2);}
    submit({record});submit({cases:incidentCases.filter(c=>c.correct).map(c=>c.id)});submit({answer:1});assert.equal(session.exam.stage,'result');
    assert.equal(examResult(session.exam).fatal,false);assert.ok(!session.exam.events.some(e=>e.code.startsWith('pre-')||e.code.startsWith('post-')||e.code==='flight-record'),JSON.stringify(session.exam.events));
  }
});
