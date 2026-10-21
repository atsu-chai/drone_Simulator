export function parseCsv(text) {
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const char=text[i];
    if(char==='"') {if(quoted && text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(char===',' && !quoted){row.push(field);field='';}
    else if(char==='\n' && !quoted){row.push(field.replace(/\r$/,''));if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=char;
  }
  if(quoted)throw new Error('CSVの引用符が閉じていません。');
  if(field||row.length){row.push(field);rows.push(row);}
  const headers=rows.shift()||[];return rows.map(values=>Object.fromEntries(headers.map((key,i)=>[key,values[i]||''])));
}
export function businessMetrics({interviews=[],participants=[],customers=[]}) {
  const values=customers.map(c=>{
    const number=key=>c[key]!=='' && Number.isFinite(Number(c[key]))?Number(c[key]):null;
    const costs=['revenue_jpy','payment_fees_jpy','variable_cost_jpy','refund_jpy'].map(number);
    const support=number('support_minutes');
    return {margin:costs.every(v=>v!==null)?costs[0]-costs[1]-costs[2]-costs[3]:null,support,
      activated:Number.isFinite(Date.parse(c.purchased_at))&&Number.isFinite(Date.parse(c.first_training_at))&&Date.parse(c.first_training_at)>=Date.parse(c.purchased_at)&&Date.parse(c.first_training_at)-Date.parse(c.purchased_at)<=7*86400000};
  });
  const complete=values.length>0 && values.every(v=>v.margin!==null&&v.support!==null);
  const supportMean=complete?values.reduce((n,v)=>n+v.support,0)/values.length:null;
  return {
    interviews:interviews.length,conditionalPaidIntent:interviews.filter(r=>r.paid_intent==='yes').length,monitorCandidates:interviews.filter(r=>r.monitor_candidate==='yes').length,
    participants:participants.length,examTakers:participants.filter(r=>['pass','fail'].includes(r.exam_result)).length,passes:participants.filter(r=>r.exam_result==='pass'&&r.evidence_checked_at).length,
    paidCustomers:customers.length,activatedWithinSevenDays:values.filter(v=>v.activated).length,
    directMargin:complete?values.reduce((n,v)=>n+v.margin,0):null,averageSupportMinutes:supportMean,
    supportLaborCostAt2000PerHour:complete?values.reduce((n,v)=>n+v.support,0)/60*2000:null,
    continuationCriteriaMet:complete && customers.length>=10 && values.filter(v=>v.activated).length/customers.length>=.8 && supportMean<=30 && values.every(v=>v.margin>0),
  };
}
