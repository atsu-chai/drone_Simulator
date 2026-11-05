import {examStages,deskQuestions,airQuestions,poweredQuestions,inspectionItems,postItems,mockPlan,incidentCases,incidentResponse} from './exam-content.js';
import {scoreExam,matchesFlightMinutes,flightMinutes} from './exam-scoring.js';
import {createPractical,tickPractical,respondPractical} from './exam-practical.js';
const flightStages=['flightcheck','square','eight','abnormal'];
const beforeGroup=['preflight','powered','flightcheck','preRecord'];
const group=stage=>beforeGroup.includes(stage)?'before':stage;
export function chooseQuestions(seed=1) {
  const pool=[...deskQuestions];let n=seed>>>0;
  for(let i=pool.length-1;i>0;i--){n=(Math.imul(n,1664525)+1013904223)>>>0;const j=n%(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
  return pool.slice(0,4).map(q=>q.id);
}
export function createExam({seed=1,date='2026-11-06',epoch=0,wind={label:'無風',speed:0}}={}) {
  return {stage:'reception',elapsed:0,stageElapsed:0,seed,date,epoch,wind,windChecks:{},questions:chooseQuestions(seed),name:'',events:[],answers:{},observed:{},daily:{},postDaily:{},metadata:{},postMetadata:{},flights:[],practical:null,oralIndex:0,power:{transmitter:false,aircraft:false},powerLog:[],completed:[],interrupted:false};
}
function issue(s,code,detail) {s.events.push({code,detail,stage:s.stage,time:s.elapsed});}
function enter(s,stage) {
  if(group(stage)!==group(s.stage))s.stageElapsed=0;
  s.completed.push(s.stage);s.stage=stage;s.oralIndex=0;s.answers={};
  s.practical=flightStages.includes(stage)?createPractical(stage==='flightcheck'?'inspection':stage,{extraLegs:stage==='abnormal'?(s.seed>>>0)%3:0,emergencyFraction:.3+((s.seed>>>0)%40)/100}):null;
}
function compareFields(s,actual,expected,major,minor) {
  for(const [key,value] of Object.entries(expected)) {
    if(actual[key]===value)continue;
    const normalized=String(actual[key]??'').trim();
    issue(s,normalized===value||(key==='date'&&normalized.replaceAll('/','-')===value)?minor:major,`${key}の記入漏れ・誤り`);
  }
}
function checkMetadata(s,meta,post=false) {
  compareFields(s,meta,{registration:mockPlan.registration,date:s.date,place:mockPlan.place,name:s.name},post?'post-daily':'pre-record',post?'post-minor':'pre-minor');
}
function checkDaily(s,stage) {
  for(const item of inspectionItems.filter(i=>i.stage===stage)) {
    if(!s.observed[item.id])issue(s,'pre-omission',`${item.label}を確認していません`);
    if(s.daily[item.id]!== (item.result||'正常'))issue(s,'pre-record',`${item.label}の記入漏れ・誤り`);
  }
}
function complete(s,data={},timeout=false) {
  switch(s.stage) {
    case 'reception':
      if(!String(data.name||'').trim()||!data.helmet||!data.glasses||!data.notice)return;
      s.name=data.name.trim().slice(0,80);enter(s,'desk');break;
    case 'desk':
      for(const id of s.questions) {const q=deskQuestions.find(q=>q.id===id);if(Number(s.answers[id]??-1)!==q.answer)issue(s,'desk-answer',q.prompt);}
      enter(s,'air');break;
    case 'air':
      for(const q of airQuestions)if(Number(s.answers[q.id]??-1)!==q.answer)issue(s,'pre-omission',q.prompt);
      enter(s,'preflight');break;
    case 'preflight':checkDaily(s,'preflight');enter(s,'powered');break;
    case 'powered':
      checkDaily(s,'powered');
      if(!s.power.aircraft||!s.power.transmitter)issue(s,'pre-omission','電源投入の未実施');
      for(const q of poweredQuestions)if(Number(s.answers[q.id]??-1)!==q.answer)issue(s,'pre-omission',q.prompt);
      enter(s,'flightcheck');break;
    case 'preRecord':
      checkDaily(s,'preRecord');checkMetadata(s,s.metadata);enter(s,'square');break;
    case 'post': {
      if(s.power.aircraft||s.power.transmitter)issue(s,'post-inspection','電源OFFの未実施');
      for(const item of postItems) {
        if(!s.observed[`post:${item.id}`])issue(s,'post-inspection',`${item.label}を確認していません`);
        if(s.postDaily[item.id]!=='正常')issue(s,'post-daily',`${item.label}の記入漏れ・誤り`);
      }
      checkMetadata(s,s.postMetadata,true);
      const r=data.record||s.record||{};
      compareFields(s,r,{date:s.date,name:s.name,takeoffPlace:mockPlan.place,landingPlace:mockPlan.place},'flight-record','flight-minor');
      if(!r.overview?.trim()||!r.safety?.trim()||!r.defects?.trim())issue(s,'flight-record','様式1の項目に記入漏れ・誤り');
      for(const [i,f] of s.flights.entries()){
        compareFields(s,r,{[`off${i}`]:examClock(s,f.tookOff),[`on${i}`]:examClock(s,f.landed)},'flight-record','flight-minor');
        if(!matchesFlightMinutes(r[`minutes${i}`],[f],s.epoch))issue(s,'flight-record',`${i+1}回目の飛行時間に誤り`);
      }
      if(!matchesFlightMinutes(r.minutes,s.flights,s.epoch)||String(r.total??'').trim()===''||Number(r.total)!==mockPlan.priorMinutes+flightMinutes(s.flights,s.epoch))issue(s,'flight-record','飛行時間・総飛行時間の計算誤り');
      s.record=r;enter(s,'incident1');break;
    }
    case 'incident1': {
      const selected=data.cases||[];
      if(selected.length!==3||incidentCases.some(c=>c.correct!==selected.includes(c.id)))issue(s,'incident-answer','6-1：該当する3事態の抜け・誤り');enter(s,'incident2');break;
    }
    case 'incident2':if(Number(data.answer??-1)!==incidentResponse.answer)issue(s,'incident-answer','6-2：発生時の措置の誤り・未回答');enter(s,'result');break;
  }
  if(timeout) s.events.push({code:'timeout',stage:s.completed.at(-1),time:s.elapsed,detail:'制限時間を超過。未完了項目を評価しました。'});
}
export function examClock(s,seconds) {return new Date(s.epoch+seconds*1000).toISOString().slice(11,16);}
export function isExamFlight(s) {return flightStages.includes(s.stage);}
export function reduceExam(previous,event) {
  if(previous.stage==='result')return previous;
  const s=structuredClone(previous);
  if(event.type==='interrupt') {s.interrupted=true;issue(s,'fatal',event.reason||'本番形式を中断');enter(s,'result');return s;}
  if(event.type==='pause')s.pauses=(s.pauses||0)+1;
  if(event.type==='draft')s.record={...event.data};
  if(event.type==='answer') {s.answers[event.id]=event.value;if(s.stage==='air')s.oralIndex++;}
  if(event.type==='observe') {
    const items=s.stage==='post'?postItems:inspectionItems.filter(i=>i.stage===s.stage);
    if(items.some(i=>i.id===event.id))s.observed[(s.stage==='post'?'post:':'')+event.id]=true;
  }
  if(event.type==='write') {
    const key=s.stage==='post'?'postDaily':'daily',observed=(s.stage==='post'?'post:':'')+event.id;
    if(s.observed[observed])s[key][event.id]=event.value;
  }
  if(event.type==='metadata')s[s.stage==='post'?'postMetadata':'metadata'][event.id]=event.value;
  if(event.type==='power'&&['powered','post'].includes(s.stage)) {
    const on=s.stage==='powered',device=event.device;
    if(!['aircraft','transmitter'].includes(device))return previous;
    if(on&&device==='aircraft'&&!s.power.transmitter||!on&&device==='transmitter'&&s.power.aircraft)issue(s,on?'pre-minor':'post-minor','電源操作順の誤り');
    s.power[device]=on;s.powerLog.push({device,on,time:s.elapsed});
  }
  if(event.type==='call'&&s.practical)s.practical=respondPractical(s.practical,event.call);
  if(event.type==='submit'&&!isExamFlight(s))complete(s,event.data);
  return s;
}
export function tickExam(previous,dt,sample=null) {
  if(previous.stage==='result'||dt<=0)return previous;
  const s={...previous,events:[...previous.events],completed:[...previous.completed],observed:{...previous.observed},flights:[...previous.flights],elapsed:previous.elapsed+dt,stageElapsed:previous.stageElapsed+dt};
  if(s.practical&&sample) {
    const old=s.practical;
    if(old.elapsed===0)s.windChecks={...s.windChecks,[s.stage]:{speed:sample.windSpeed??s.wind.speed,label:s.wind.label}};
    s.practical=tickPractical(old,{...sample,time:s.elapsed},dt);
    s.events.push(...s.practical.events.slice(old.events.length).map(e=>({...e,stage:s.stage})));
    if(s.practical.fatal) {enter(s,'result');return s;}
    if(s.practical.done) {
      if(s.practical.flight)s.flights.push({...s.practical.flight,subject:s.stage});
      if(s.stage==='flightcheck') {for(const id of ['communication','propulsion','automatic'])s.observed[id]=true;enter(s,'preRecord');}
      else enter(s,s.stage==='square'?'eight':s.stage==='eight'?'abnormal':'post');
      return s;
    }
  }
  const limit=examStages.find(stage=>stage.id===s.stage).limit;
  if(limit&&s.stageElapsed>limit) {
    if(beforeGroup.includes(s.stage)) {
      if(s.stage==='preRecord'){checkDaily(s,'preRecord');checkMetadata(s,s.metadata);}
      else issue(s,'pre-omission','飛行前点検の通算12分超過');
      if(s.stage==='flightcheck'&&(sample?.drone.y||0)>.001){issue(s,'fatal','飛行点検中に通算時間を超過');enter(s,'result');}
      else enter(s,'square');
    } else if(isExamFlight(s)) {issue(s,'fatal','実技の制限時間超過');enter(s,'result');}
    else complete(s,{},true);
  }
  return s;
}
export function examResult(s) {return {...scoreExam(s.events),interrupted:s.interrupted,pauses:s.pauses||0};}
