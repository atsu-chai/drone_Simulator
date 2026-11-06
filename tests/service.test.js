import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/main.js';
import {verifyWebhook,hasAccess,checkoutParams} from '../server/billing.js';
test('webhook signature requires original body, recent timestamp and valid signature',()=>{
  const raw='{"id":"evt"}',secret='whsec_test',time=1000,signature=createHmac('sha256',secret).update(`${time}.${raw}`).digest('hex');
  assert.equal(verifyWebhook(raw,`t=${time},v1=${signature}`,secret,time),true);
  assert.equal(verifyWebhook(raw+' ',`t=${time},v1=${signature}`,secret,time),false);
  assert.equal(verifyWebhook(raw,`t=${time},v1=${signature}`,secret,time+301),false);
});
test('access ends exactly at paid period; validation is independent',()=>{
  assert.equal(hasAccess({paid_until:100},99),true);assert.equal(hasAccess({paid_until:100},100),false);assert.equal(hasAccess({validation_until:101},100),true);
  const params=checkoutParams({id:'a',customer:'cus'},'https://test.example');
  assert.equal(params.get('line_items[0][price_data][unit_amount]'),'3000');assert.equal(params.get('line_items[1][price_data][unit_amount]'),'7000');assert.equal(params.get('mode'),'subscription');
});
test('local dev access opens subjects only on an explicit, local, non-commercial start',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'drone-dev-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const start=async(name,options)=>{
    const app=createApp({dbPath:join(directory,`${name}.sqlite`),origin:'http://localhost:8000',...options});
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    t.after(()=>{app.server.close();app.db.close();});
    return `http://127.0.0.1:${app.server.address().port}`;
  };
  const normal=await start('normal',{});
  const closed=await (await fetch(normal+'/api/status')).json();
  assert.equal(closed.access,false);assert.equal(closed.localDev,false);
  assert.equal((await fetch(normal+'/src/premium-mission.js')).status,403);
  for(const name of ['flow','content','scoring','practical','ui'])assert.equal((await fetch(normal+`/src/exam-${name}.js`)).status,403);
  const dev=await start('dev',{localDevAccess:true});
  const open=await (await fetch(dev+'/api/status')).json();
  assert.equal(open.access,true);assert.equal(open.localDev,true);assert.equal(open.authenticated,false);
  assert.equal((await fetch(dev+'/src/premium-mission.js')).status,200);
  for(const name of ['flow','content','scoring','practical','ui'])assert.equal((await fetch(dev+`/src/exam-${name}.js`)).status,200);
  for(const path of ['/.env','/.data/service.sqlite','/server/main.js'])assert.equal((await fetch(dev+path)).status,404);
  const {request}=await import('node:http');
  const viaProxy=await new Promise((resolve,reject)=>{
    const {hostname,port}=new URL(dev);
    request({hostname,port,path:'/api/status',headers:{Host:'trainer.example.com'}},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve(JSON.parse(body)));}).on('error',reject).end();
  });
  assert.equal(viaProxy.access,false);assert.equal(viaProxy.localDev,false);
  for(const unsafe of [{origin:'https://trainer.example.com'},{salesEnabled:true},{stripeKey:'test-key'},{webhookSecret:'test-secret'}])
    assert.throws(()=>createApp({dbPath:join(directory,'refused.sqlite'),origin:'http://localhost:8000',localDevAccess:true,...unsafe}),/開発用の全科目開放/);
});
test('signup, login, grants, CSRF, stopped sales, persistence and private files',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'drone-test-'));
  const app=createApp({dbPath:join(directory,'db.sqlite'),origin:'http://localhost:8000'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{app.server.close();app.db.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const post=(path,body,cookie,origin='http://localhost:8000')=>fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const credentials={email:'test@example.com',password:'valid-password-123'};
  let response=await post('/api/register',credentials);assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie').split(';')[0];assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  response=await fetch(base+'/api/status',{headers:{Cookie:cookie}});assert.equal((await response.json()).access,false);
  assert.equal((await fetch(base+'/src/premium-mission.js')).status,403);
  app.db.prepare('UPDATE accounts SET validation_until=? WHERE email=?').run(Math.floor(Date.now()/1000)+1000,credentials.email);
  response=await fetch(base+'/api/status',{headers:{Cookie:cookie}});assert.equal((await response.json()).access,true);
  assert.equal((await fetch(base+'/src/premium-mission.js',{headers:{Cookie:cookie}})).status,200);
  assert.equal((await post('/api/checkout',{acceptTerms:true},cookie)).status,503);
  assert.equal((await post('/api/logout',{},cookie,'https://evil.example')).status,403);
  assert.equal((await post('/api/login',{...credentials,password:'wrong-password-123'})).status,401);
  response=await post('/api/request',{kind:'monitor',email:credentials.email,message:'Participation test',consent:true});assert.equal(response.status,201);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM requests').get().count,1);
  for(const path of ['/.env','/server/main.js','/.data/service.sqlite','/operations/launch-readiness.json'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base+'/')).status,200);
  assert.equal((await post('/api/logout',{},cookie)).status,200);
  response=await fetch(base+'/api/status',{headers:{Cookie:cookie}});assert.equal((await response.json()).authenticated,false);
});
test('duplicate and delayed billing events reconcile current provider state; failed renewal preserves paid time',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'drone-billing-'));let calls=0;
  const paidEnd=Math.floor(Date.now()/1000)+1000;
  let current={id:'sub_1',created:100,customer:'cus_1',status:'active',latest_invoice:{status:'paid',lines:{data:[{subscription:'sub_1',period:{end:paidEnd}}]}}};
  const app=createApp({dbPath:join(directory,'db.sqlite'),webhookSecret:'secret',provider:async()=>{calls++;return current;}});
  app.db.prepare('INSERT INTO accounts(id,email,password,customer) VALUES(?,?,?,?)').run('u','u@example.com','not-used','cus_1');
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.server.close();app.db.close();rmSync(directory,{recursive:true,force:true});});
  const send=async(id,type)=>{const raw=JSON.stringify({id,type,data:{object:{id:'sub_1'}}}),time=Math.floor(Date.now()/1000),sig=createHmac('sha256','secret').update(`${time}.${raw}`).digest('hex');return fetch(`http://127.0.0.1:${app.server.address().port}/api/webhook`,{method:'POST',headers:{'stripe-signature':`t=${time},v1=${sig}`},body:raw});};
  assert.equal((await send('evt_1','customer.subscription.updated')).status,200);await send('evt_1','customer.subscription.updated');assert.equal(calls,1);
  assert.equal(app.db.prepare('SELECT paid_until FROM accounts').get().paid_until,paidEnd);
  current={...current,status:'past_due',latest_invoice:{status:'open'}};await send('evt_older','customer.subscription.updated');
  assert.equal(app.db.prepare('SELECT paid_until FROM accounts').get().paid_until,paidEnd);
  current={...current,status:'canceled',ended_at:paidEnd};await send('evt_cancel','customer.subscription.deleted');assert.equal(hasAccess(app.db.prepare('SELECT * FROM accounts').get(),paidEnd),false);
  current={...current,id:'sub_2',created:200,status:'active',ended_at:null,latest_invoice:{status:'paid',lines:{data:[{subscription:'sub_2',period:{end:paidEnd+1000}}]}}};await send('evt_new','customer.subscription.updated');
  current={...current,id:'sub_1',created:100,status:'canceled',ended_at:paidEnd-1000};await send('evt_delayed_old','customer.subscription.deleted');
  assert.equal(app.db.prepare('SELECT subscription FROM accounts').get().subscription,'sub_2');assert.equal(app.db.prepare('SELECT paid_until FROM accounts').get().paid_until,paidEnd+1000);
});

test('checkout is gated, costs 10000 initially, locks duplicate clicks and returns portal only for own customer',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'drone-checkout-')),readinessPath=join(directory,'ready.json');const gates=JSON.parse(readFileSync(new URL('../operations/launch-readiness.json',import.meta.url),'utf8'));Object.keys(gates).forEach(key=>gates[key]=key!=='salesPaused');writeFileSync(readinessPath,JSON.stringify(gates));
  const calls=[];const provider=async(key,path,params)=>{calls.push({path,params});if(path==='customers')return {id:'cus_new'};return {url:'https://checkout.stripe.com/test'};};
  const app=createApp({dbPath:join(directory,'db.sqlite'),origin:'http://localhost:8000',stripeKey:'sk_test_placeholder',webhookSecret:'test',salesEnabled:true,readinessPath,provider});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.server.close();app.db.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  let cookie;const post=(path,body)=>fetch(base+'/api/'+path,{method:'POST',headers:{Origin:'http://localhost:8000','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  let response=await post('register',{email:'buyer@example.com',password:'long-test-password'});cookie=response.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('checkout',{})).status,400);
  response=await post('checkout',{acceptTerms:true});assert.equal(response.status,200);assert.match((await response.json()).url,/checkout.stripe.com/);
  const checkout=calls.find(c=>c.path==='checkout/sessions');assert.equal(checkout.params.get('line_items[0][price_data][unit_amount]'),'3000');assert.equal(checkout.params.get('line_items[1][price_data][unit_amount]'),'7000');
  assert.equal((await post('checkout',{acceptTerms:true})).status,409);
  assert.equal((await post('portal',{})).status,200);assert.equal(calls.at(-1).params.get('customer'),'cus_new');
  writeFileSync(readinessPath,JSON.stringify({verified:true,salesPaused:true}));assert.equal((await post('checkout',{acceptTerms:true})).status,503);
});

// Exercise the real HTTP handler without binding a socket; this also works in restricted environments.
async function get(app,path,{host='localhost:8000',remote='127.0.0.1',cookie=''}={}) {
  let status=200,body='';
  await app.server.listeners('request')[0]({url:path,method:'GET',headers:{host,cookie},socket:{remoteAddress:remote}}, {setHeader(){},writeHead(code){status=code;},end(value){body=value?.toString()||'';}});
  return {status,body};
}
test('full exam modules require existing all-subject access; dev opening stays local and account expiry revokes it',async t=>{
  const normal=createApp({dbPath:':memory:'}),dev=createApp({dbPath:':memory:',localDevAccess:true});
  t.after(()=>{normal.db.close();dev.db.close();});
  const paths=['content','flow','scoring','practical','ui'].map(n=>`/src/exam-${n}.js`);
  for(const path of paths){
    assert.equal((await get(normal,path)).status,403);
    assert.equal((await get(dev,path)).status,200);
    assert.equal((await get(dev,path,{host:'public.example'})).status,403);
    assert.equal((await get(dev,path,{remote:'192.0.2.10'})).status,403);
  }
  const now=Math.floor(Date.now()/1000),token='exam-test-session';
  normal.db.prepare('INSERT INTO accounts(id,email,password,validation_until) VALUES(?,?,?,?)').run('exam','exam@example.invalid','unused',now+600);
  normal.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),'exam',now+600);
  for(const path of paths)assert.equal((await get(normal,path,{cookie:'drone_session='+token})).status,200);
  normal.db.prepare('UPDATE accounts SET validation_until=0').run();
  for(const path of paths)assert.equal((await get(normal,path,{cookie:'drone_session='+token})).status,403);
  assert.equal((await get(normal,'/index.html')).status,200);
  assert.equal((await get(normal,'/practice.html')).status,200);assert.equal((await get(normal,'/practice.js')).status,200);
});
