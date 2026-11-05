import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyWebhook, hasAccess, checkoutParams, stripeRequest } from './billing.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const localHosts=['localhost','127.0.0.1','[::1]'];
const hostName=value=>{try {return new URL(`http://${value}`).hostname;}catch{return '';}};
// `npm run dev` opens every subject without an account. It must never run on anything
// that could be public or take payment, so such settings stop the server from starting.
export function assertLocalDevAccess({origin,salesEnabled=false,stripeKey='',webhookSecret=''}) {
  if(!localHosts.includes(new URL(origin).hostname))throw new Error('開発用の全科目開放は、APP_ORIGINがlocalhostのときだけ使えます。');
  if(salesEnabled||stripeKey||webhookSecret)throw new Error('開発用の全科目開放は、販売設定やStripeキーと同時に使えません。');
}
export function createApp({dbPath=resolve(root,'.data/service.sqlite'),origin='http://localhost:8000',stripeKey='',webhookSecret='',salesEnabled=false,readinessPath=resolve(root,'operations/launch-readiness.json'),provider=stripeRequest,localDevAccess=false}={}) {
  if(localDevAccess)assertLocalDevAccess({origin,salesEnabled,stripeKey,webhookSecret});
  mkdirSync(dirname(dbPath),{recursive:true});
  const db=new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,customer TEXT,subscription TEXT,paid_until INTEGER DEFAULT 0,validation_until INTEGER DEFAULT 0,status TEXT DEFAULT 'none'); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,account_id TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,created INTEGER); CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,kind TEXT,email TEXT,body TEXT,created INTEGER); CREATE TABLE IF NOT EXISTS billing_lock(id TEXT PRIMARY KEY,expires INTEGER);`);
  if(!db.prepare("PRAGMA table_info(accounts)").all().some(column=>column.name==='subscription_created')) db.exec('ALTER TABLE accounts ADD COLUMN subscription_created INTEGER DEFAULT 0');
  const attempts=new Map();
  const launchRequirements=['demandValidated','controllerAndBrowserVerified','independentInstructorReviewed','realAircraftImprovementVerified','onePassAndThreeExamResultsVerified','billingSandboxVerified','sellerPrivacyRefundTermsPublished','backupRecoveryAndSupportVerified'];
  const sellingAllowed=()=>{
    try {const gates=JSON.parse(readFileSync(readinessPath,'utf8'));return salesEnabled && !gates.salesPaused && launchRequirements.every(key=>gates[key]===true);}
    catch{return false;}
  };
  const now=()=>Math.floor(Date.now()/1000);
  // Checked per request as well: a proxy in front would arrive with a public Host.
  const devAccess=req=>localDevAccess && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && localHosts.includes(hostName(req.headers.host));
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const hash=v=>createHash('sha256').update(v).digest('hex');
  const accountFor=req=>{const token=String(req.headers.cookie||'').split(';').map(p=>p.trim()).find(p=>p.startsWith('drone_session='))?.slice(14);return token ? db.prepare('SELECT a.* FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token=? AND s.expires>?').get(hash(token),now()):null;};
  async function bodyFor(req) {let body='';for await(const chunk of req) {body+=chunk;if(Buffer.byteLength(body)>32768) throw Object.assign(new Error('入力が長すぎます。'),{status:413});}return body;}
  const limited=(req,route)=>{const key=`${req.socket.remoteAddress}:${route}`;const entry=attempts.get(key);if(attempts.size>10000) {for(const [k,v] of attempts) if(v.until<Date.now()) attempts.delete(k);}
    if(!entry || entry.until<Date.now()) {attempts.set(key,{count:1,until:Date.now()+60000});return false;}return ++entry.count>10;};
  async function handler(req,res) {
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    try {
      const url=new URL(req.url,origin),path=url.pathname;
      if(path==='/api/webhook' && req.method==='POST') {
        const raw=await bodyFor(req);
        if(!verifyWebhook(raw,req.headers['stripe-signature'],webhookSecret)) return json(res,400,{error:'署名が一致しません。'});
        const event=JSON.parse(raw);
        if(db.prepare('SELECT id FROM events WHERE id=?').get(event.id)) return json(res,200,{received:true});
        const object=event.data?.object;
        const subscriptionId=event.type.startsWith('customer.subscription.') ? object.id : event.type==='checkout.session.completed' ? object.subscription : object?.parent?.subscription_details?.subscription || object?.subscription;
        if(subscriptionId) {
          // Always reconcile current provider state, never replay old entitlement from a delayed event.
          const sub=await provider(stripeKey,`subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice`);
          const account=db.prepare('SELECT * FROM accounts WHERE customer=?').get(sub.customer);
          if(account && (sub.id===account.subscription || Number(sub.created||0)>=account.subscription_created)) {
            const invoice=sub.latest_invoice;
            const paidEnd=typeof invoice==='object' && invoice.status==='paid' ? Math.max(0,...(invoice.lines?.data||[]).filter(line=>line.subscription || line.parent?.subscription_item_details).map(line=>line.period?.end||0)) : 0;
            const revoked=['canceled','incomplete_expired','unpaid'].includes(sub.status) && Number.isFinite(sub.ended_at);
            db.prepare('UPDATE accounts SET subscription=?,status=?,paid_until=?,subscription_created=? WHERE id=? AND subscription_created<=?').run(sub.id,sub.status,revoked?Math.min(Math.max(account.paid_until,paidEnd),sub.ended_at):Math.max(account.paid_until,paidEnd),Number(sub.created||0),account.id,Number(sub.created||0));
          }
        }
        db.prepare('INSERT OR IGNORE INTO events VALUES(?,?)').run(event.id,now());return json(res,200,{received:true});
      }
      if(path.startsWith('/api/')) {
        if(req.method==='POST' && req.headers.origin!==origin) return json(res,403,{error:'このサイトから操作してください。'});
        const account=accountFor(req);
        if(path==='/api/status') return json(res,200,{salesEnabled:sellingAllowed(),price:{first:10000,renewal:3000},authenticated:!!account,access:hasAccess(account)||devAccess(req),localDev:devAccess(req),account:account?{email:account.email,paidUntil:account.paid_until,validationUntil:account.validation_until,status:account.status}:null});
        if(req.method!=='POST') return json(res,404,{error:'見つかりません。'});
        if(limited(req,path)) return json(res,429,{error:'しばらく待ってから操作してください。'});
        let body;try {body=JSON.parse(await bodyFor(req)||'{}');} catch {return json(res,400,{error:'入力形式を確認してください。'});}
        if(['/api/register','/api/login'].includes(path)) {
          const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<12||password.length>128) return json(res,400,{error:'メールアドレスと12〜128文字のパスワードを入力してください。'});
          let user=db.prepare('SELECT * FROM accounts WHERE email=?').get(email);
          if(path==='/api/register') {
            if(user) return json(res,400,{error:'登録できません。登録済みの場合はログインしてください。'});
            const salt=randomBytes(16).toString('hex'),id=randomBytes(16).toString('hex');
            db.prepare('INSERT INTO accounts(id,email,password) VALUES(?,?,?)').run(id,email,`${salt}:${scryptSync(password,salt,64).toString('hex')}`);
            user=db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
          } else {
            const [salt,expected]=(user?.password||`${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
            const valid=timingSafeEqual(scryptSync(password,salt,64),Buffer.from(expected,'hex'));
            if(!user||!valid) return json(res,401,{error:'メールアドレスまたはパスワードを確認してください。'});
          }
          const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),user.id,now()+604800);
          res.setHeader('Set-Cookie',`drone_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${origin.startsWith('https:')?'; Secure':''}`);return json(res,200,{ok:true});
        }
        if(path==='/api/request') {
          if(!['monitor','support'].includes(body.kind)||body.consent!==true||typeof body.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)||body.email.length>254||typeof body.message!=='string'||!body.message.trim()||body.message.length>5000) return json(res,400,{error:'種別・連絡先・内容と同意を確認してください。'});
          const id=randomBytes(12).toString('hex');db.prepare('INSERT INTO requests VALUES(?,?,?,?,?)').run(id,body.kind,String(body.email).slice(0,254),JSON.stringify({message:body.message,consent:true,at:new Date().toISOString()}),now());return json(res,201,{id});
        }
        if(!account) return json(res,401,{error:'ログインしてください。'});
        if(path==='/api/logout') {db.prepare('DELETE FROM sessions WHERE account_id=?').run(account.id);res.setHeader('Set-Cookie','drone_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
        if(path==='/api/portal') {
          if(!account.customer||!stripeKey) return json(res,409,{error:'管理する契約がありません。'});
          const portal=await provider(stripeKey,'billing_portal/sessions',new URLSearchParams({customer:account.customer,return_url:`${origin}/account.html`}));return json(res,200,{url:portal.url});
        }
        if(path==='/api/checkout') {
          if(!sellingAllowed()||!stripeKey||!webhookSecret) return json(res,503,{error:'監修・実績・販売準備を確認中のため、販売は停止しています。'});
          if(body.acceptTerms!==true) return json(res,400,{error:'料金と利用条件への同意が必要です。'});
          if(hasAccess(account)||(account.subscription && ['active','past_due','incomplete','unpaid'].includes(account.status))) return json(res,409,{error:'契約管理画面で現在の契約を確認してください。'});
          const lock=db.prepare('SELECT * FROM billing_lock WHERE id=?').get(account.id);
          if(lock?.expires>now()) return json(res,409,{error:'決済画面は作成済みです。30分後に再試行してください。'});
          db.prepare('INSERT OR REPLACE INTO billing_lock VALUES(?,?)').run(account.id,now()+1800);
          try {
            if(!account.customer) {const customer=await provider(stripeKey,'customers',new URLSearchParams({email:account.email,'metadata[account_id]':account.id}),`customer-${account.id}`);account.customer=customer.id;db.prepare('UPDATE accounts SET customer=? WHERE id=?').run(customer.id,account.id);}
            const params=checkoutParams(account,origin);params.set('expires_at',String(now()+1800));
            const session=await provider(stripeKey,'checkout/sessions',params,`checkout-${account.id}-${lock?.expires||now()}`);
            return json(res,200,{url:session.url});
          } catch(error) {db.prepare('DELETE FROM billing_lock WHERE id=?').run(account.id);throw error;}
        }
        return json(res,404,{error:'見つかりません。'});
      }
      if(!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'許可されていません。'});
      const publicPath=path==='/'?'/home.html':decodeURIComponent(path);
      if(publicPath==='/src/premium-mission.js' && !hasAccess(accountFor(req)) && !devAccess(req)) return json(res,403,{error:'検証参加または有効な契約が必要です。'});
      if(!/^\/(?:home\.html|index\.html|learn\.html|account\.html|legal\.html|contact\.html|app\.js|site\.js|styles\.css|site\.css|src\/[a-z-]+\.js|assets\/[a-zA-Z0-9_./-]+)$/.test(publicPath)||publicPath.includes('..')) return json(res,404,{error:'見つかりません。'});
      const file=resolve(root,`.${publicPath}`);if(!statSync(file).isFile()) return json(res,404,{error:'見つかりません。'});
      res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.glb':'model/gltf-binary','.hdr':'application/octet-stream'})[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:readFileSync(file));
    } catch(error) {json(res,error.status||500,{error:error.status?error.message:'処理できませんでした。時間をおいて再試行してください。'});}
  }
  const server=http.createServer(handler);return {server,db};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const origin=process.env.APP_ORIGIN||'http://localhost:8000';
  const {server}=createApp({origin,stripeKey:process.env.STRIPE_SECRET_KEY,webhookSecret:process.env.STRIPE_WEBHOOK_SECRET,salesEnabled:process.env.SALES_ENABLED==='true',localDevAccess:process.argv.includes('--local-dev-access')});
  server.listen(Number(process.env.PORT||8000),'127.0.0.1',()=>console.log(`Trainer ready: ${origin}${process.argv.includes('--local-dev-access')?'（開発用：ログインなしで全科目を開放）':''}`));
}
