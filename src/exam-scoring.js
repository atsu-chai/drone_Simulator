// Pure scoring. All evidence is retained; only the largest oral issue in each group counts.
export const scoringRules = {
  'desk-answer':{points:5,label:'机上：誤答・未回答'},
  'pre-omission':{points:10,group:'pre',label:'飛行前：回答・点検漏れ'},
  'pre-record':{points:5,group:'pre',label:'飛行前：記載漏れ・誤り'},
  'pre-minor':{points:1,group:'pre',label:'飛行前：軽微な誤り'},
  'post-inspection':{points:5,group:'post-inspection',label:'飛行後：点検漏れ'},
  'post-daily':{points:5,group:'post-inspection',label:'飛行後：日常点検記録の漏れ・誤り'},
  'post-minor':{points:1,group:'post-inspection',label:'飛行後：軽微な誤り'},
  'flight-record':{points:10,group:'post-record',label:'飛行記録：漏れ・誤り（時間計算を含む）'},
  'flight-minor':{points:1,group:'post-record',label:'飛行記録：軽微な誤り'},
  'incident-answer':{points:5,label:'事故・重大インシデント：抜け・誤り'},
  'route':{points:5,label:'飛行経路逸脱'}, 'instruction':{points:5,label:'指示と異なる飛行'},
  'landing':{points:5,label:'離着陸不良'}, 'safety-call':{points:5,label:'安全確認不足'},
  'wobble':{points:1,label:'ふらつき'}, 'smoothness':{points:1,label:'不円滑'}, 'heading':{points:1,label:'機首方向不良'},
  'fatal':{points:0,fatal:true,label:'中止に該当する事象'},
};
// The items a single flight can lose points on; used by the flight-only result.
export const flightScoringCodes=['route','instruction','landing','safety-call','wobble','smoothness','heading','fatal'];
export function scoreExam(events) {
  const rows=events.filter(e=>scoringRules[e.code]).map(e=>({...e,...scoringRules[e.code],applied:false}));
  const winners={};
  for(const row of rows) {
    if(!row.group)row.applied=true;
    else if(!winners[row.group] || winners[row.group].points<row.points)winners[row.group]=row;
  }
  for(const row of Object.values(winners))row.applied=true;
  const deduction=rows.reduce((sum,row)=>sum+(row.applied?row.points:0),0),remaining=Math.max(0,100-deduction);
  return {rows,deduction,remaining,fatal:rows.some(row=>row.fatal),meetsReference:remaining>=70&&!rows.some(row=>row.fatal)};
}
// Form 1 records clock times to the minute, so flight time comes from those minutes.
const clockMinute=(seconds,epoch)=>Math.floor((epoch+seconds*1000)/60000);
export function flightMinutes(flights,epoch=0) {return flights.reduce((sum,f)=>sum+Math.max(0,clockMinute(f.landed,epoch)-clockMinute(f.tookOff,epoch)),0);}
export function matchesFlightMinutes(value,flights,epoch=0) {return String(value).trim()!=='' && Number(value)===flightMinutes(flights,epoch);}
