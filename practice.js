import {subjects,historyStore} from './src/training.js';
const groups=[
  {id:'exam',title:'本番形式で試す',note:'受付から結果まで、試験当日の流れで通します。'},
  {id:'flight',title:'飛行だけ繰り返す',note:'受付と口述を省き、本番と同じ指示と採点で1飛行だけ行います。'},
  {id:'guided',title:'補助つきで身につける',note:'経路ガイド、視点の切替、機体の拡大を使って練習します。'},
  {id:'free',title:'まず試す',note:'登録せずに使えます。'},
];
const link=(subject,extra='')=>`index.html?subject=${subject}${extra}`;
const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
function card(id,subject,access) {
  const free=subject.group==='free',open=free||access,node=element('a','menu-card');
  node.href=open?link(id):'account.html';
  node.append(element('strong','',subject.label.replace(/^飛行のみ：/,'')),element('span','',subject.summary));
  const meta=element('small','',open?(subject.limit||'開始 →'):'利用権が必要です');
  if(!open)node.classList.add('locked');
  node.append(meta);
  return node;
}
function demoLinks() {
  const node=element('p','menu-demos','解説付きの見本を見る：');
  for(const id of ['square','eight','abnormal']) {const a=element('a','',subjects[id].label);a.href=link(id,'&watch=1');node.append(a);}
  return node;
}
function renderGroups(access) {
  const root=document.getElementById('menuGroups');root.replaceChildren();
  for(const group of groups) {
    const section=element('section','menu-group'),head=element('div','menu-group-head'),title=element('h2','',group.title),list=element('div','menu-cards');
    section.setAttribute('aria-label',group.title);head.append(title,element('p','',group.note));section.append(head,list);
    for(const [id,subject] of Object.entries(subjects))if(subject.group===group.id)list.append(card(id,subject,access));
    if(group.id==='free')section.append(demoLinks());
    root.append(section);
  }
}
function renderNext(records,access) {
  const root=document.getElementById('nextStep'),last=records[0];
  const known=last&&subjects[last.subject];
  const target=known?(last.retrySubject&&subjects[last.retrySubject]?last.retrySubject:last.subject):'square';
  const usable=subjects[target].group==='free'||access;
  const action=element('a','action',known?`${subjects[target].label}を練習する →`:'見本飛行を見る →');
  action.href=known?(usable?link(target):'index.html?subject=demo'):link('square','&watch=1');
  if(known&&!usable)action.textContent='無料体験を開く →';
  const text=element('div');
  text.append(element('strong','',known?'次の練習':'はじめての方へ'),element('p','',known?`前回は${subjects[last.subject].label}でした。続きから練習できます。`:'まず見本で流れを確認し、無料体験で操作を試してください。'));
  root.replaceChildren(text,action);
}
function renderRecent(records) {
  const root=document.getElementById('recentList');root.replaceChildren();
  for(const record of records.slice(0,5)) {
    const li=element('li');
    li.append(element('time','',new Date(record.at).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})),element('span','',subjects[record.subject]?.label||'練習'),element('small','',record.interrupted?'中断あり':''));
    root.append(li);
  }
  if(!root.children.length)root.append(element('li','', 'まだ記録はありません。'));
}
let records=[];
try {records=historyStore(localStorage).read();}catch{}
renderGroups(false);renderNext(records,false);renderRecent(records);
const status=await fetch('/api/status').then(r=>r.json()).catch(()=>({access:false}));
document.getElementById('accessStatus').textContent=status.localDev?'ローカル開発用：すべての科目を利用できます。':status.access?'すべての科目を利用できます。':'いまは無料体験と見本を利用できます。ほかの科目は検証参加者・契約者向けです。';
renderGroups(status.access);renderNext(records,status.access);
