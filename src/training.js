export const versions = Object.freeze({ app: '0.6.6', course: 'mlit-basic-4', scoring: 'training-5', physics: '20261022', curriculum: 'basic-1' });
export { squarePath } from './course-layout.js';
import { squarePath, eightCenters, layouts, abnormalTargets, courseIdFor, fieldZone } from './course-layout.js';
export const course = Object.freeze({ penalty: 1.5, failure: 2.5, grace: 2, squarePath, eightCenters, eightRadius: 2.5 });
export function segmentDistance(p, a, b) {
  const dx=b.x-a.x, dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
export function routeDistance(p, phase, index=0, anchor={x:0,z:0}) {
  const layout=layouts[courseIdFor(phase)];
  if(['takeoff','eightTakeoff','abnormalTakeoff'].includes(phase)) return Math.hypot(p.x-layout.takeoff.x,p.z-layout.takeoff.z);
  if(phase==='emergencyHover') return Math.hypot(p.x-anchor.x,p.z-anchor.z);
  if(phase==='emergencyArrival') return Math.hypot(p.x-layout.takeoff.x,p.z-layout.takeoff.z);
  if(phase==='square') {
    const from=index===0?layouts.square.takeoff:squarePath[Math.min(index-1,4)];
    return segmentDistance(p,from,squarePath[Math.min(index,5)]);
  }
  if(phase==='eight') {
    const center=eightCenters[Math.floor((index%8)/4)];
    return Math.abs(Math.hypot(p.x-center.x,p.z-center.z)-course.eightRadius);
  }
  if(phase==='abnormal') return index===0 ? segmentDistance(p,layout.takeoff,abnormalTargets[0]) : segmentDistance(p,abnormalTargets[index-1],abnormalTargets[index]);
  if(phase==='emergencyTransit') return segmentDistance(p,anchor,layout.takeoff);
  return null;
}
export function createEvaluation() { return {events:[], segments:{}, fatal:false}; }
export function evaluateSample(evaluation, sample) {
  const {phase,index=0,time,position}=sample;
  const deviation=routeDistance(position,phase,index,sample.anchor);
  if(deviation===null || evaluation.fatal) return [];
  const key=`${phase}:${index}`;
  const s=evaluation.segments[key] ||= {inside:true,entries:0,since:0,penalized:false};
  const emitted=[];
  const emit=(type,points=0)=>{
    const event={type,points,phase,index,time:Number(time.toFixed(3)),position:{...position},deviation:Number(deviation.toFixed(3)),source:'training-proxy',input:sample.input,velocity:sample.velocity};
    evaluation.events.push(event); emitted.push(event);
  };
  const transit=['square','eight','abnormal','emergencyHover','emergencyTransit'].includes(phase);
  const arrival=phase==='emergencyArrival';
  const zone=arrival && deviation<1 ? 'safe' : transit || arrival ? fieldZone(position,courseIdFor(phase)) : 'safe';
  if(zone==='failure') { evaluation.fatal=true; emit('failure-zone'); return emitted; }
  const outsideArrival=phase==='emergencyArrival' && deviation>=1;
  if(outsideArrival || (phase!=='emergencyTransit' && !(phase==='square' && index===0) && (zone==='penalty' || deviation>=course.penalty))) {
    if(s.inside) {s.inside=false;s.entries++;s.since=time;s.penalized=false;emit('route-warning');}
    if(!s.penalized && (s.entries>1 || time-s.since>=course.grace)) {emit('route-penalty',5);s.penalized=true;}
  } else if(!s.inside) {emit('route-return');s.inside=true;}
  return emitted;
}
export function summarizeEvents(events) {
  return {deduction:events.reduce((n,e)=>n+(e.points||0),0),fatal:events.some(e=>e.type==='failure-zone'),warnings:events.filter(e=>e.type==='route-warning').length};
}
export {normalizedAxis} from './controller-input.js';
export function calibrationValid(axes) { return axes.length>=4 && axes.slice(0,4).every(v=>Number.isFinite(v)&&Math.abs(v)<=.2); }
export const subjects = {
  demo:{label:'無料体験：離陸・ホバリング・着陸',phase:'takeoff'},
  square:{label:'スクエア飛行',phase:'takeoff'},
  eight:{label:'8の字飛行',phase:'eightTakeoff'},
  abnormal:{label:'異常事態・緊急着陸',phase:'abnormalTakeoff'},
  full:{label:'通し練習',phase:'takeoff'},
};
export function historyStore(storage) {
  const key='drone.history.v2';
  return {
    read(){try {const rows=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(rows)?rows:[];}catch{return [];}},
    append(record){const rows=this.read();rows.unshift(record);storage.setItem(key,JSON.stringify(rows.slice(0,100)));},
    clear(){storage.removeItem(key);}
  };
}
export const lessons = [
 {id:'controls',title:'1. 操作と実機練習の準備',body:'購入前にPCとコントローラーの接続・軸方向・中立を確認します。まず離陸と停止を練習し、次に機首を横・手前へ向けた際の入力方向を確かめます。家庭用パッドの感触は実機の送信機と異なります。実機での確認を併用してください。',question:'機首を手前に向けると、操縦者から見た左右操作はどうなりますか？',choices:['機体基準の左右なので、見かけの方向が反転する','常に画面基準で同じ'],answer:0,explanation:'操縦入力は機体基準です。向きが変わったときの対応を段階的に練習します。',subject:'demo'},
 {id:'plan',title:'2. 机上：飛行計画の確認',body:'指定された条件に対して、飛行空域・周囲の状況、必要な手続き、安全確保、機体の限界、フェールセーフ設定を確認し、理由を説明する練習をします。例題は独自教材で、実際の出題ではありません。',question:'計画した飛行が機体の性能限界を超えると分かった場合は？',choices:['短時間ならそのまま実施','条件や計画を見直し、安全を確保できなければ中止'],answer:1,explanation:'計画と機体性能の適合を確認し、実施できない判断も含めて説明します。',subject:'square'},
 {id:'preflight',title:'3. 飛行前：確認・申告・記録',body:'空域、周囲、気象、体調、書類を確認した後、作動前点検と作動点検を行います。異常の有無を判断して申告し、点検結果を記録します。本画面のチェックは練習用で、実機の点検操作を評価するものではありません。',question:'プロペラの損傷を発見しました。どうしますか？',choices:['離陸せず異常を報告し、対処する','記録だけして飛ばす'],answer:0,explanation:'異常を発見し、飛行を開始せず適切に対処することを練習します。',subject:'square'},
 {id:'flight',title:'4. 実技：3科目を反復',body:'スクエアでは区間ごとの直線と機首方向、8の字では円弧と高度、異常事態では位置安定OFFでの停止と緊急着陸を練習します。結果で一番大きなミスを確認し、該当科目を再練習します。',question:'位置安定OFFでスティックを中立に戻すと？',choices:['必ずその場で静止する','惰性で流れるため、早めの修正が必要'],answer:1,explanation:'位置保持の有無による違いを、実機でも指導者と確認してください。',subject:'abnormal'},
 {id:'postflight',title:'5. 飛行後：点検と飛行記録',body:'機体・プロペラ・取付部・発熱・汚損を確認し、飛行日時、離着陸場所、飛行時間、異常の有無などを記録します。実際に行った飛行と記録が一致することを確認します。',question:'飛行記録に書く飛行時間は？',choices:['予定時間','実際の飛行に対応する時間'],answer:1,explanation:'飛行記録は実施内容に基づいて作成します。',subject:'full'},
 {id:'incident',title:'6. 事故・重大インシデント対応',body:'事故事例を見て、まず飛行停止や負傷者の救護など必要な措置を判断し、周囲の危険を防ぎます。その後、状況に応じた通報・報告と記録を確認します。対象事例と報告手順は最新の公式資料で確認してください。',question:'人が負傷した事故で最初に優先するのは？',choices:['飛行の継続','安全確保と必要な救護・緊急通報'],answer:1,explanation:'人命と周囲の安全を優先し、状況に応じて関係機関へ連絡・報告します。',subject:'full'},
];
