import { lessons, subjects } from './src/training.js';
async function api(path,body) {
  const response=await fetch(`/api/${path}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  const result=await response.json();if(!response.ok) throw new Error(result.error||'処理できませんでした。');return result;
}
const status=await api('status').catch(()=>({salesEnabled:false,access:false}));
const lessonList=document.getElementById('lessonList');
if(lessonList) {
  let progress={};try {progress=JSON.parse(localStorage.getItem('drone.lessons.v1')||'{}');}catch{}
  for(const lesson of lessons) {
    const section=document.createElement('section');section.className='lesson';
    const heading=document.createElement('h2');heading.textContent=lesson.title;
    const body=document.createElement('p');body.textContent=lesson.body;
    const form=document.createElement('form'),fieldset=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=lesson.question;fieldset.append(legend);
    lesson.choices.forEach((text,index)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name='answer';input.value=index;input.required=true;label.append(input,document.createTextNode(text));fieldset.append(label);});
    const button=document.createElement('button');button.type='submit';button.textContent='回答を確認';
    const answer=document.createElement('p');answer.className='answer';answer.setAttribute('role','status');if(progress[lesson.id]) answer.textContent='前回の回答：理解確認済み';
    const link=document.createElement('a');link.href=`index.html?subject=${lesson.subject}`;link.textContent=`${subjects[lesson.subject].label}へ →`;
    form.append(fieldset,button,answer);form.addEventListener('submit',event=>{event.preventDefault();const correct=Number(new FormData(form).get('answer'))===lesson.answer;answer.textContent=`${correct?'正解です。':'もう一度確認しましょう。'} ${lesson.explanation}`;progress[lesson.id]=correct;try{localStorage.setItem('drone.lessons.v1',JSON.stringify(progress));}catch{document.getElementById('lessonStatus').textContent='回答を保存できません。このブラウザの保存設定を確認してください。';}});
    section.append(heading,body,form,link);lessonList.append(section);
  }
}
const authForm=document.getElementById('authForm');
if(authForm) {
  document.getElementById('accountStatus').textContent=status.authenticated?`${status.account.email} / ${status.access?'利用可能':'無料体験のみ'} / 支払済み期限：${status.account.paidUntil?new Date(status.account.paidUntil*1000).toLocaleString('ja-JP'):'なし'}${status.account.status==='past_due'?' / お支払いを確認してください':''}`:'ログインしていません。';
  const checkout=document.getElementById('checkoutButton');checkout.disabled=!status.salesEnabled||!status.authenticated||status.access;checkout.textContent=status.salesEnabled?'初月10,000円で購入手続き':'販売準備中（課金されません）';
  document.getElementById('portalButton').disabled=!status.authenticated;
  const message=document.getElementById('accountMessage');
  authForm.addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await api(button.value,Object.fromEntries(new FormData(authForm)));location.reload();}catch(error){message.textContent=error.message;}finally{button.disabled=false;}});
  for(const [id,path] of [['checkoutButton','checkout'],['portalButton','portal'],['logoutButton','logout']]) document.getElementById(id).addEventListener('click',async event=>{event.target.disabled=true;try{const result=await api(path,{acceptTerms:document.getElementById('termsAccepted').checked});if(result.url) location.assign(result.url);else location.reload();}catch(error){message.textContent=error.message;event.target.disabled=false;}});
}
const contactForm=document.getElementById('contactForm');
if(contactForm) {
  const kind=new URLSearchParams(location.search).get('kind');if(['support','monitor'].includes(kind)) contactForm.elements.kind.value=kind;
  contactForm.addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;const target=document.getElementById('contactStatus');try {const values=Object.fromEntries(new FormData(contactForm));values.consent=contactForm.elements.consent.checked;const result=await api('request',values);target.textContent=`受付番号：${result.id}。このサーバーに保存しました。`;contactForm.reset();}catch(error){target.textContent=`送信できませんでした：${error.message}`;}finally{button.disabled=false;}});
}
