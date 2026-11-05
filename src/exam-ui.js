import {examStages,examParts,mockPlan,deskQuestions,airQuestions,poweredQuestions,inspectionItems,postItems,calls,incidentCases,incidentPrompt,incidentResponse,recordFields,unassessed} from './exam-content.js';
import {examResult,isExamFlight,examClock} from './exam-flow.js';
import {scoringRules,flightScoringCodes} from './exam-scoring.js';
import {practicalInstruction} from './exam-practical.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=(id,label,value='')=>`<label>${escape(label)}<input name="${id}" value="${escape(value)}" autocomplete="off"></label>`;
const choices=(q,answers={})=>`<fieldset><legend>${escape(q.prompt)}</legend>${q.choices.map((text,i)=>`<label class="exam-choice"><input type="radio" name="${q.id}" value="${i}" ${Number(answers[q.id]??-1)===i?'checked':''}>${escape(text)}</label>`).join('')}</fieldset>`;
export function examView(s) {
  const stage=examStages.find(stage=>stage.id===s.stage);
  return {title:stage.title,flight:isExamFlight(s),line:s.practical?practicalInstruction(s.practical):s.stage==='reception'?'氏名と保護具を確認し、注意事項を読んで受付を終えてください。':s.stage==='air'?airQuestions[s.oralIndex]?.prompt||'空域等の確認を終了してください。':s.stage==='result'?`${s.flightOnly?'飛行':'本番形式'}を終了します。細目ごとの記録を確認してください。`:'確認・操作を実施し、記録を提出してください。'};
}
function inspectionDiagram(items,s,post) {
  const positions={body:[48,42],propeller:[17,16],frame:[72,16],control:[83,78],identification:[40,80],power:[43,28],battery:[44,58],remote:[67,43],remarks:[70,76],communication:[25,70],propulsion:[20,20],automatic:[65,42],mount:[48,15],exterior:[18,20],heat:[48,50],debris:[24,78]};
  return `<div class="exam-airframe" role="group" aria-label="点検する機体の部位を選択"><svg viewBox="0 0 600 250" role="img" aria-label="点検用の機体上面図と操縦装置"><g stroke="#5b6964" stroke-width="16"><path d="M180 55L380 195M180 195L380 55"/></g><g fill="#a7b5ac" stroke="#344a43" stroke-width="3"><circle cx="180" cy="55" r="38"/><circle cx="380" cy="55" r="38"/><circle cx="180" cy="195" r="38"/><circle cx="380" cy="195" r="38"/><rect x="235" y="75" width="90" height="100" rx="20"/><rect x="460" y="125" width="110" height="80" rx="16"/></g><g stroke="#243b33" stroke-width="6"><path d="M150 55h60M350 55h60M150 195h60M350 195h60"/><path d="M490 150v22M540 150v22"/></g><rect x="250" y="103" width="60" height="40" rx="5" fill="#4c6e5d"/><text x="280" y="161" fill="#203e31" font-size="12" text-anchor="middle">JA-TEST001</text></svg>${items.map(i=>{const [x,y]=positions[i.id]||[50,50];return `<button type="button" data-observe="${i.id}" style="left:${x}%;top:${y}%" ${s.observed[(post?'post:':'')+i.id]?'class="observed"':''}>${escape(i.label)}を確認</button>`;}).join('')}</div>`;
}
function inspectionSheet(s) {
  const post=s.stage==='post',items=post?postItems:inspectionItems.filter(i=>i.stage===s.stage),records=post?s.postDaily:s.daily;
  return `<h2>日常点検記録（様式2相当）</h2><p>模擬機体図の部位を選び、状態を確認してから、結果を記入してください。</p><div class="exam-inspection">${inspectionDiagram(items,s,post)}<table><thead><tr><th>点検項目</th><th>確認した状態</th><th>点検結果</th></tr></thead><tbody>${items.map(i=>{const seen=s.observed[(post?'post:':'')+i.id];return `<tr><th>${escape(i.label)}</th><td>${seen?escape(i.observation):'未確認'}</td><td><select aria-label="${escape(i.label)}の点検結果" data-write="${i.id}" ${seen?'':'disabled'}>${['','正常','異常','非該当'].map(v=>`<option ${records[i.id]===v?'selected':''}>${v}</option>`).join('')}</select></td></tr>`;}).join('')}</tbody></table></div>`;
}
function metadata(s,post=false) {
  const values=post?s.postMetadata:s.metadata;
  return `<div class="exam-fields">${[['registration','登録記号'],['date','実施年月日'],['place','実施場所'],['name','実施者']].map(([id,label])=>`<label>${label}<input data-meta="${id}" value="${escape(values[id]||'')}"></label>`).join('')}</div>`;
}
function power(s) {
  return `<div class="exam-power">${['transmitter','aircraft'].map(id=>`<button type="button" data-power="${id}">${id==='transmitter'?'送信機':'機体'} 電源${s.stage==='post'?'OFF':'ON'}（現在 ${s.power[id]?'ON':'OFF'}）</button>`).join('')}</div>`;
}
const clock=seconds=>`${Math.floor(seconds/60)}分${String(Math.floor(seconds%60)).padStart(2,'0')}秒`;
function resultSummary(s,r) {
  if(!s.flightOnly)return {title:'模擬採点（公式の合否ではない）',score:r.fatal?'試験中止':`残り ${r.remaining} / 100点`,note:r.fatal?'中止に該当する事象がありました。':`参考の70点と比較：${r.meetsReference?'基準点以上':'基準点未満'}`,actions:''};
  const stage=examStages.find(stage=>stage.id===s.flightOnly);
  return {title:`${stage.title}の飛行のみ／模擬採点（公式の合否ではない）`,score:r.fatal?'試験中止':`減点 ${r.deduction}点`,note:`${r.fatal?'中止に該当する事象がありました。':'この飛行の減点のみです。机上、口述、記録は含みません。'}／経過 ${clock(s.elapsed)}（制限 ${clock(stage.limit)}）`,actions:'<div class="exam-result-actions"><button type="button" data-retry>もう一度飛ぶ</button><button type="button" data-exit>科目選択へ戻る</button></div>'};
}
export function examPaper(s) {
  switch(s.stage) {
    case 'reception':return `<h2>本番形式の受付</h2><p>二等・基本・マルチローターの模擬試験を最初から最後まで行います。</p>${field('name','受験者氏名（この実行中の記録に使用）')}<label><input type="checkbox" name="helmet">ヘルメットを確認しました</label><label><input type="checkbox" name="glasses">保護メガネを確認しました</label><p>指示があるまで移動や姿勢変化をせず、確認結果は試験員へ呼称してください。各科目には制限時間があります。画面を離れると中断結果へ進みます。機体中心と訓練用の閾値で代理評価します。</p><p>氏名はこの画面内だけで使用し、送信・自動保存しません。</p><label><input type="checkbox" name="notice">注意事項を読みました</label><button>受付を終える</button>`;
    case 'desk':return `<h2>模擬飛行計画／独自設問4問・5分</h2><p>${escape(mockPlan.description)}</p><p>場所：${mockPlan.place}／天候：${mockPlan.weather}</p>${s.questions.map(id=>choices(deskQuestions.find(q=>q.id===id),s.answers)).join('')}<button>解答を提出</button>`;
    case 'air':return `<h2>飛行空域及びその他の確認／3分</h2><p>携帯書類：${mockPlan.documents}</p>${airQuestions[s.oralIndex]?choices(airQuestions[s.oralIndex])+'<button>試験員へ回答</button>':'<p>確認を終了してください。</p><button>空域等の確認を終了</button>'}`;
    case 'preflight':return inspectionSheet(s)+metadata(s)+'<button>作動前点検を終了</button>';
    case 'powered':return '<h2>地上での作動点検</h2>'+power(s)+poweredQuestions.map(q=>choices(q,s.answers)).join('')+inspectionSheet(s)+'<button>飛行点検へ進む</button>';
    case 'preRecord':return inspectionSheet(s)+metadata(s)+'<button>日常点検記録を提出し、実技へ進む</button>';
    case 'post':return '<h2>飛行後点検・記録／通算5分</h2>'+power(s)+inspectionSheet(s)+metadata(s,true)+`<h2>飛行記録（様式1相当）</h2><p>本日の年月日：${s.date}／場所：${mockPlan.place}／飛行前の総飛行時間：${mockPlan.priorMinutes}分</p><p>離着陸の観測時刻（この実行の時計）：${s.flights.map(f=>`${escape(f.subject)} ${examClock(s,f.tookOff)} → ${examClock(s,f.landed)}`).join('、')}。時刻と所要時間を記入してください。時間は分、小数第2位まで入力できます。</p><div class="exam-fields">${recordFields.map(([id,label])=>field(id,label,s.record?.[id])).join('')}${s.flights.map((f,i)=>field(`off${i}`,`${i+1}回目 離陸時刻 HH:MM:SS`,s.record?.[`off${i}`])+field(`on${i}`,`${i+1}回目 着陸時刻 HH:MM:SS`,s.record?.[`on${i}`])+field(`minutes${i}`,`${i+1}回目 飛行時間（分）`,s.record?.[`minutes${i}`])).join('')}${field('minutes','今回の飛行時間の合計（分）',s.record?.minutes)}${field('total','累積の総飛行時間（分）',s.record?.total)}</div><button>飛行後の記録を提出</button>`;
    case 'incident1':return `<h2>6-1／3分</h2><p>${escape(incidentPrompt)}</p>${incidentCases.map(c=>`<label class="exam-choice"><input type="checkbox" name="cases" value="${c.id}">${escape(c.text)}</label>`).join('')}<button>回答を提出</button>`;
    case 'incident2':return '<h2>6-2／3分</h2>'+choices({...incidentResponse,id:'answer'})+'<button>回答を提出</button>';
    case 'result': {const r=examResult(s),summary=resultSummary(s,r),rules=Object.entries(scoringRules).filter(([code])=>!s.flightOnly||flightScoringCodes.includes(code));return `<h2>${escape(summary.title)}</h2><p class="exam-score">${summary.score}</p><p>${summary.note}${s.interrupted?'／中断あり':''}${r.pauses?`／一時停止 ${r.pauses}回`:''}</p><table><thead><tr><th>減点細目</th><th>適用した減点</th></tr></thead><tbody>${rules.map(([code,rule])=>`<tr><th>${escape(rule.label)}</th><td>${rule.fatal?(r.fatal?'中止':'なし'):r.rows.filter(row=>row.code===code&&row.applied).reduce((sum,row)=>sum+row.points,0)}</td></tr>`).join('')}</tbody></table><h2>記録された事象</h2><table><thead><tr><th>細目</th><th>記録</th><th>減点</th></tr></thead><tbody>${r.rows.map(row=>`<tr><td>${escape(row.label)}</td><td>${escape(row.detail)}</td><td>${row.fatal?'中止':row.applied?row.points:'最大1件のため適用なし'}</td></tr>`).join('')||'<tr><td colspan="3">減点事象なし</td></tr>'}</tbody></table><p>未評価：${unassessed.join('、')}。実機との一致・公式の合否を保証しません。</p>${summary.actions}`;}
    default:return '';
  }
}
export function createExamUI({stageElement,send,exit,resume=()=>{},title='本番形式（通し）',retry=null}) {
  const originalParent=stageElement.parentNode,originalNext=stageElement.nextSibling;
  const root=document.createElement('section');root.className=retry?'exam-console exam-flight-only':'exam-console';root.setAttribute('aria-label','本番形式コンソール');
  root.innerHTML=`<header><div><strong>${escape(title)}</strong><p>進め方は受験機関の案内を優先</p></div><ol class="exam-progress"></ol>${retry?'<button type="button" data-retry>最初からやり直す</button>':''}<button type="button" data-exit>終了して科目選択へ</button></header>`+'<div class="exam-center"><div class="exam-paper"><form novalidate></form></div></div><footer><div class="exam-context"></div><p class="exam-line" aria-live="polite"></p><p class="exam-warning" role="status"></p><div class="exam-calls"><label>呼称を選択（数字キー1〜5でも呼称できます）<select aria-label="受験者の呼称"><option value="">選択してください</option>'+calls.map((c,i)=>`<option value="${c.id}">${i+1}：${escape(c.text)}</option>`).join('')+'</select></label><button type="button" data-call>選択した呼称を伝える（Space）</button></div><span class="exam-time"></span></footer>';
  document.body.append(root);root.querySelector('.exam-center').prepend(stageElement);document.body.classList.add('exam-active');
  let current=null,signature='';const form=root.querySelector('form');
  const resumeButton=document.createElement('button');resumeButton.type='button';resumeButton.dataset.resume='';resumeButton.textContent='再開する';resumeButton.hidden=true;
  root.querySelector('.exam-calls').before(resumeButton);
  const call=()=>{const value=root.querySelector('.exam-calls select').value;if(value)send({type:'call',call:value});};
  root.addEventListener('click',e=>{
    if(e.target.closest('[data-exit]'))exit();
    if(e.target.closest('[data-resume]'))resume();
    if(e.target.closest('[data-retry]'))retry?.();
    if(e.target.closest('[data-call]'))call();
    const observe=e.target.closest('[data-observe]');if(observe)send({type:'observe',id:observe.dataset.observe});
    const power=e.target.closest('[data-power]');if(power)send({type:'power',device:power.dataset.power});
  });
  form.addEventListener('input',e=>{
    if(e.target.dataset.meta)send({type:'metadata',id:e.target.dataset.meta,value:e.target.value});
    if(current?.stage==='post')send({type:'draft',data:Object.fromEntries(new FormData(form))});
  });
  root.querySelector('.exam-calls select').addEventListener('change',e=>e.target.blur());
  form.addEventListener('change',e=>{
    if(e.target.dataset.write)send({type:'write',id:e.target.dataset.write,value:e.target.value});
    if(current?.stage==='post')send({type:'draft',data:Object.fromEntries(new FormData(form))});
    if(['desk','powered'].includes(current?.stage)&&e.target.type==='radio')send({type:'answer',id:e.target.name,value:Number(e.target.value)});
  });
  form.addEventListener('submit',e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(form));
    if(current.stage==='air'&&airQuestions[current.oralIndex]) {const q=airQuestions[current.oralIndex];send({type:'answer',id:q.id,value:Number(data[q.id]??-1)});return;}
    if(current.stage==='post')send({type:'submit',data:{record:data}});
    else send({type:'submit',data:{...data,cases:new FormData(form).getAll('cases')}});
  });
  // Both hands stay on the sticks in flight, so calls also work from one key.
  const key=e=>{
    if(!current?.practical||e.repeat||['INPUT','TEXTAREA'].includes(e.target.tagName))return;
    const number=/^Digit([1-5])$/.exec(e.code);
    if(number){e.preventDefault();send({type:'call',call:calls[Number(number[1])-1].id});}
    else if(e.code==='Space'&&!['SELECT','BUTTON'].includes(e.target.tagName)){e.preventDefault();call();}
  };
  window.addEventListener('keydown',key);
  return {
    render(s,environment,paused=false,pauseReason='') {
      current=s;const v=examView(s),nextSignature=JSON.stringify([s.stage,s.oralIndex,s.observed,s.daily,s.postDaily,s.power,s.practical?.step,s.practical?.mode]);
      if(nextSignature!==signature) {
        signature=nextSignature;form.innerHTML=examPaper(s);
        root.querySelector('.exam-progress').innerHTML=s.flightOnly?'':examParts.map((part,i)=>`<li ${part.stages.includes(s.stage)?'aria-current="step"':''}>${i+1} ${escape(part.title)}</li>`).join('');
      }
      stageElement.hidden=!v.flight;root.querySelector('.exam-paper').hidden=v.flight;
      root.querySelector('.exam-calls').hidden=!v.flight||paused;
      resumeButton.hidden=!paused;
      const measured=s.windChecks[s.stage]?.speed??environment?.wind?.speed??s.wind.speed??0;
      root.querySelector('.exam-line').textContent=paused?`${pauseReason||'一時停止しました。'} スティックを中立にして再開してください。`:(s.practical?.step===0?`風速計 ${measured.toFixed(1)} m/sを確認しました。${v.line}`:v.line);
      root.querySelector('.exam-warning').textContent=s.practical?.warning||s.practical?.callNote||'';
      root.querySelector('.exam-context').textContent=`${v.title} ／ ${s.date} ／ ${mockPlan.place} ／ ${mockPlan.weather} ／ ${s.wind.label}（訓練設定）／ 風速計 ${(environment?.wind?.speed??s.wind.speed??0).toFixed(1)} m/s（模擬）`;
      root.querySelector('.exam-time').textContent=v.flight?(s.flightOnly?'':'計時は試験員が管理しています'):s.stage==='reception'||s.stage==='result'?'':`試験員の時計 ${Math.floor(s.stageElapsed/60)}:${String(Math.floor(s.stageElapsed%60)).padStart(2,'0')}`;
    },
    destroy() {window.removeEventListener('keydown',key);originalParent.insertBefore(stageElement,originalNext);stageElement.hidden=false;root.remove();document.body.classList.remove('exam-active');}
  };
}
