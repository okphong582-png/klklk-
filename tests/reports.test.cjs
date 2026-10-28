'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ADMIN,OWNER}=require('../config.cjs');
const {reportSvg,reportCaption,planTotals,totals,renderReport}=require('../reports.cjs');
const row=(key,days=1,priceVnd=5000)=>({key,days,priceVnd,createdBy:ADMIN,createdAt:Date.parse('2026-10-25T20:30:00+07:00')});
test('new daily cards and caption retain historical prices and exclude owner keys from debt',()=>{
 const rows=[row('DEMO-A',1,6000),row('DEMO-B',7,21000),row('OLD-NO-PRICE',90,null),{...row('OWNER',30,40000),createdBy:OWNER}];
 const summary=totals(rows);assert.equal(summary.total,27000);assert.equal(summary.keys,3);assert.equal(summary.unpriced,1);
 assert.deepEqual(planTotals(rows).map(x=>x.total),[6000,21000,0]);
 const caption=reportCaption('2026-10-25',rows);assert.match(caption,/27\.000/);assert.match(caption,/25 \/ 10 \/ 2026/);assert.match(caption,/1 key chưa có giá/);assert.ok(caption.length<1024);assert.match(caption,/Chưa xác nhận thanh toán/);
});
test('long keys wrap without truncation and untrusted key text stays XML-escaped',async()=>{
 const key='MIZZE-'+('ABCD'.repeat(30)),svg=reportSvg('2026-10-25',[row(key),row('<script>&"')]).toString();
 for(const chunk of key.match(/.{1,48}/g))assert.ok(svg.includes(chunk));assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;&amp;&quot;'));
 const png=await renderReport('2026-10-25',[row(key)]),meta=await require('sharp')(png).metadata();assert.equal(meta.width,1160);assert.ok(meta.height>700);
});
test('24-row pages show each key once while keeping the whole-day total on every page',()=>{
 const rows=Array.from({length:25},(_,index)=>row('DEMO-'+String(index).padStart(2,'0')));
 const first=reportSvg('2026-10-25',rows,0).toString(),second=reportSvg('2026-10-25',rows,1).toString();
 assert.ok(first.includes('DEMO-23')&&!first.includes('DEMO-24'));assert.ok(second.includes('DEMO-24')&&!second.includes('DEMO-23'));
 assert.match(first,/125\.000/);assert.match(second,/125\.000/);assert.match(reportCaption('2026-10-25',rows,1),/Trang 2\/2/);
 assert.throws(()=>reportSvg('2026-10-25',rows,2),/invalid_page/);
});
test('zero-sales day has an intentional empty state and a valid readable image',async()=>{
 const svg=reportSvg('2026-10-25',[]).toString();assert.match(svg,/CHƯA CÓ KEY ADMIN/);assert.match(svg,/0 đ/);assert.ok(!svg.includes('NaN'));
 const info=await require('sharp')(await renderReport('2026-10-25',[])).metadata();assert.equal(info.width,1160);assert.ok(info.height>700);
});

test('hour plans keep correct units and remain unpriced in text and image reports',async()=>{
 const rows=[{...row('HOUR'),days:0,hours:1,priceVnd:null},row('DAY')];assert.equal(totals(rows).total,5000);assert.equal(totals(rows).unpriced,1);
 assert.equal(planTotals(rows)[0].hours,1);assert.match(reportCaption('2026-10-25',rows),/1 giờ: 1 key/);
 const svg=reportSvg('2026-10-25',rows).toString();assert.match(svg,/1 GIỜ/);assert.match(svg,/Chưa đặt giá/);assert.ok(!svg.includes('NaN'));
 const png=await renderReport('2026-10-25',rows);assert.equal((await require('sharp')(png).metadata()).width,1160);
});
