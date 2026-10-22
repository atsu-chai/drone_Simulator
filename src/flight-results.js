import {subjects} from './training.js';
import {safetyMessages} from './flight-safety.js';
import {coachingMessages} from './flight-coaching.js';
const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
const taskInfo={
  demo:{total:1,count:s=>s.completedSubjects.includes('demo')?1:0,next:'高度3.5mで5秒停止し、Hへ静かに着陸してください。'},
  square:{total:6,count:s=>s.squareIndex,next:'A→B→C→D→E→Aの順を確認し、各点で減速してください。'},
  eight:{total:16,count:s=>s.eightIndex,next:'円の接線へ機首を向け、左右の円を連続2周してください。'},
  abnormal:{total:4,count:s=>s.abnormalIndex,next:'A→B→E→Bを側方移動し、高度を保ってHへ戻ってください。'},
};
export function summarizeFlight(state) {
  const ids=state.subject==='full'?['square','eight','abnormal']:[state.subject];
  const progress=ids.map(id=>{
    const task=taskInfo[id],count=Math.min(task.total,task.count(state)),complete=state.completedSubjects.includes(id);
    return {subject:id,label:subjects[id].label,count,total:task.total,complete,status:complete?'完了':count===task.total?'経路完了・着陸未完了':count?'途中':'未完了'};
  });
  const events=state.evaluation.events,feedback=[];
  const add=text=>{if(text&&!feedback.includes(text))feedback.push(text);};
  let score=100-events.reduce((n,e)=>n+(e.points||0),0);
  for(const event of events.filter(e=>e.fatal || e.type==='failure-zone'))add(safetyMessages[event.type] || '中止区画へ入りました。早めに減速し、区画内で経路を保つ練習をしてください。');
  if(state.timeLimitExceeded)add(`${subjects[state.timeLimitExceeded]?.label || '科目'}の制限時間を超過しました。見本で手順を確認してから単科目を再練習してください。`);
  for(const event of events.filter(e=>e.points>0))add(safetyMessages[event.type] || coachingMessages[event.type] || (event.type==='route-penalty'?'経路逸脱を記録しました。航跡の位置から減速を始める場所を見直してください。':null));
  const incomplete=progress.filter(task=>!task.complete);
  for(const task of incomplete) {
    score-=14;
    add(`${task.label}：${task.count}/${task.total}。${task.status==='経路完了・着陸未完了'?'経路は完了しています。H上空で停止し、接地まで終えてください。':taskInfo[task.subject].next}`);
  }
  const altitudeRms=state.altitudeSampleTime?Math.sqrt(state.altitudeErrorSquared/state.altitudeSampleTime):0;
  if(altitudeRms>.35) {score-=16;add(`高度の平均誤差は${altitudeRms.toFixed(2)}mでした。小さい上下入力で高度を保つ練習をしてください。`);}
  const headingRms=state.headingSampleTime?Math.sqrt(state.headingErrorSquared/state.headingSampleTime):0;
  if(state.checklistMistakes){score-=state.checklistMistakes*8;add('点検の確認順序を間違えました。教材で手順を確認し、声に出して反復してください。');}
  if(average(state.responseDelays)>2.8){score-=10;add('指示から操作まで時間がかかりました。見本で次の課題を確認してください。');}
  if(!feedback.length)add('指定した経路と着陸を完了しました。航跡を確認して、次は模擬モードに進んでください。');
  const stopped=state.evaluation.fatal || Boolean(state.timeLimitExceeded);
  if(stopped)score=0;
  const status=stopped?'練習中止・要改善':incomplete.length?'未完了・要再練習':'練習終了（公式合否は未評価）';
  const firstIssue=events.find(e=>e.fatal || e.type==='failure-zone') || events.find(e=>e.points>0);
  const phase=firstIssue?.phase || state.phase;
  const retrySubject=phase.startsWith('eight')?'eight':['abnormalTakeoff','abnormal','emergencyHover','emergencyTransit','emergencyArrival','landing'].includes(phase)?'abnormal':phase.startsWith('square')?'square':incomplete[0]?.subject || (state.subject==='full'?'square':state.subject);
  return {score:Math.max(0,Math.round(score)),status,feedback:feedback.slice(0,3),progress,retrySubject,altitudeRms,headingRms};
}
