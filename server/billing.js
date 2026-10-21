import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyWebhook(raw, signature, secret, now=Math.floor(Date.now()/1000)) {
  const parts=String(signature||'').split(',').map(p=>p.split('='));
  const timestamp=Number(parts.find(p=>p[0]==='t')?.[1]);
  if(!secret || !Number.isFinite(timestamp) || Math.abs(now-timestamp)>300) return false;
  const expected=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest();
  return parts.filter(p=>p[0]==='v1').some(p=>{const actual=Buffer.from(p[1]||'','hex');return actual.length===expected.length && timingSafeEqual(actual,expected);});
}
export function hasAccess(account, now=Date.now()/1000) {
  return Boolean(account && (account.validation_until>now || account.paid_until>now));
}
export function checkoutParams(account, origin) {
  return new URLSearchParams({
    mode:'subscription',customer:account.customer,
    'line_items[0][price_data][currency]':'jpy','line_items[0][price_data][unit_amount]':'3000',
    'line_items[0][price_data][recurring][interval]':'month','line_items[0][price_data][product_data][name]':'実地試験トレーナー 月額利用', 'line_items[0][quantity]':'1',
    'line_items[1][price_data][currency]':'jpy','line_items[1][price_data][unit_amount]':'7000',
    'line_items[1][price_data][product_data][name]':'初月教材・診断セット','line_items[1][quantity]':'1',
    'subscription_data[metadata][account_id]':account.id,client_reference_id:account.id,
    success_url:`${origin}/account.html?checkout=returned`,cancel_url:`${origin}/account.html`,locale:'ja',
  });
}
export async function stripeRequest(key, path, params, idempotencyKey) {
  const response=await fetch(`https://api.stripe.com/v1/${path}`,{method:params?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Stripe-Version':'2025-06-30.basil',...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:params?.toString(),signal:AbortSignal.timeout(15000)});
  const body=await response.json();if(!response.ok) throw new Error('決済サービスとの通信に失敗しました。');return body;
}
