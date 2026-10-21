import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,businessMetrics} from '../operations/metrics.js';
test('empty records never imply validated business, and CSV supports quoted commas',()=>{
  assert.equal(businessMetrics({}).continuationCriteriaMet,false);
  assert.deepEqual(parseCsv('id,note\na,"hello, world"\n'),[{id:'a',note:'hello, world'}]);
});
test('business criteria distinguish revenue, direct margin, labor and seven day activation',()=>{
  const customer={revenue_jpy:'10000',payment_fees_jpy:'400',variable_cost_jpy:'100',refund_jpy:'0',support_minutes:'20',purchased_at:'2026-10-01',first_training_at:'2026-10-04'};
  const rows=Array.from({length:10},()=>({...customer}));const result=businessMetrics({customers:rows});assert.equal(result.directMargin,95000);assert.equal(result.continuationCriteriaMet,true);
  rows[0].refund_jpy='10000';assert.equal(businessMetrics({customers:rows}).continuationCriteriaMet,false);
  rows[0].refund_jpy='';assert.equal(businessMetrics({customers:rows}).directMargin,null);
});
