'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Store}=require('../store.cjs'),{App}=require('../app.cjs'),{Telegram}=require('../telegram.cjs'),{OWNER,ADMIN,allowed}=require('../config.cjs');
function fakeDB(){let root={},queue=Promise.resolve();const clone=x=>x===undefined?null:structuredClone(x);
 const parts=p=>(p||'').split('/').filter(Boolean),get=p=>{let v=root;for(const k of parts(p))v=v?.[k];return clone(v);};
 const set=(p,value)=>{const keys=parts(p);if(!keys.length){root=clone(value)||{};return;}let v=root;for(const key of keys.slice(0,-1)){if(!v[key]||typeof v[key]!=='object')v[key]={};v=v[key];}if(value===null)delete v[keys.at(-1)];else v[keys.at(-1)]=clone(value);};
 return {ref(path=''){return {get:async()=>({val:()=>get(path)}),set:async v=>set(path,v),remove:async()=>set(path,null),update:async updates=>{for(const [p,v] of Object.entries(updates))set(path+'/'+p,v);},transaction(fn){const next=queue.then(()=>{const value=fn(get(path));if(value===undefined)return {committed:false,snapshot:{val:()=>get(path)}};set(path,value);return {committed:true,snapshot:{val:()=>get(path)}};});queue=next.catch(()=>{});return next;}};},dump:()=>clone(root)};
}
function fixture(){const db=fakeDB(),store=new Store(db,crypto.randomBytes(32).toString('base64')),sent=[],tg={button:(text,callback_data,style)=>({text,callback_data,style}),copyButton:(text,value)=>({text,copy_text:{text:value}}),photo:async(id,image,caption)=>{sent.push({id,image,caption});},send:async(id,text,rows=[],options={})=>{sent.push({id,text,rows,options});return {message_id:sent.length};},answer:async()=>{}},app=new App(store,tg);return {db,store,tg,sent,app};}
let uid=100;
const message=(id,text,chat={id,type:'private'})=>({update_id:uid++,message:{from:{id,is_bot:false},chat,text}});
const callback=(id,data,chat={id,type:'private'})=>({update_id:uid++,callback_query:{id:'callback',from:{id,is_bot:false},message:{chat},data}});
async function created(store,id=ADMIN,op=1){return store.create(id,{days:30,devices:2,count:1},op);}

test('only the three allowlisted user IDs in their own private chats can touch the bot',async()=>{
 const f=fixture();for(const u of [message(1,'/start'),message(OWNER,'/start',{id:-100,type:'group'}),message(ADMIN,'/start',{id:OWNER,type:'private'}),callback(1,'new')]){assert.equal(allowed(u),false);await f.app.handle(u);}
 assert.equal(f.sent.length,0);assert.deepEqual(f.db.dump(),{});await f.app.handle(message(OWNER,'/start'));assert.equal(f.sent[0].id,OWNER);
});
test('key generation is pending, high entropy and exact callback replay cannot reset a used key',async()=>{
 const f=fixture(),a=await created(f.store),hash=a.entries[0].hash,record=(await f.db.ref('licensesV9/'+hash).get()).val();
 assert.equal(record.expiresAt,0);assert.equal(record.activatedAt,0);assert.equal(record.durationMs,30*86400000);assert.equal(record.credentialMode,2);
 const meta=(await f.db.ref('licenseAdminV9/'+hash).get()).val();assert.equal(meta.createdBy,ADMIN);assert.ok(!JSON.stringify(meta).includes(a.entries[0].password));assert.ok(!JSON.stringify(record).includes(a.entries[0].key));assert.equal(f.store.open(meta.vault).password,a.entries[0].password);
 await f.db.ref('licensesV9/'+hash+'/expiresAt').set(1234);const again=await created(f.store);assert.equal(again.entries[0].key,a.entries[0].key);assert.equal((await f.db.ref('licensesV9/'+hash+'/expiresAt').get()).val(),1234);
 await f.store.mutate(ADMIN,hash,'delete');await created(f.store);assert.equal((await f.db.ref('licensesV9/'+hash).get()).val(),null);
});
test('admin cannot list, inspect, decrypt through UI or mutate owner/web-issued keys',async()=>{
 const f=fixture(),owner=await created(f.store,OWNER,2),admin=await created(f.store,ADMIN,3),hash=owner.entries[0].hash;
 assert.equal((await f.store.list(ADMIN)).length,1);assert.equal((await f.store.list(OWNER)).length,2);
 for(const action of ['delete','reset','disable'])await assert.rejects(f.store.mutate(ADMIN,hash,action),/forbidden/);
 await assert.rejects(f.store.snapshot(hash,42),/forbidden/);await f.app.handle(callback(ADMIN,'secret:'+hash.slice(0,16)));assert.ok(!f.sent.some(x=>x.text.includes(owner.entries[0].password)));
 assert.ok((await f.store.snapshot(admin.entries[0].hash,ADMIN)).record);
});
test('create wizard has clickable steps, confirmation, owner reporting and stale-button protection',async()=>{
 const f=fixture();await f.app.handle(callback(ADMIN,'new'));await f.app.handle(callback(ADMIN,'days:7'));await f.app.handle(callback(ADMIN,'devices:3'));await f.app.handle(callback(ADMIN,'count:1'));
 const c=f.sent.at(-1).rows[0][0].callback_data;await f.app.handle(callback(ADMIN,c));
 assert.equal((await f.store.list(ADMIN)).length,1);assert.equal((await f.store.list(ADMIN))[0].record.durationMs,7*86400000);
 assert.ok(f.sent.some(x=>x.id===OWNER&&x.text.includes('ADMIN VỪA TẠO KEY')));await f.app.handle(callback(ADMIN,c));assert.equal((await f.store.list(ADMIN)).length,1);
});
test('owner notification survives Telegram failures and is retried without minting keys',async()=>{
 const f=fixture();await created(f.store);const send=f.tg.send;f.tg.send=async(id,...args)=>{if(id===OWNER)throw Error('unavailable');return send(id,...args);};await f.app.flushReports();assert.equal(Object.keys(await f.store.pendingReports()).length,1);
 f.tg.send=send;await new App(f.store,f.tg).flushReports();assert.equal(Object.keys(await f.store.pendingReports()).length,0);assert.equal((await f.store.list(OWNER)).length,1);assert.equal(f.sent.filter(x=>x.id===OWNER).length,1);
});
test('signed-license deadlines survive device resets and safe quota mutation',async()=>{
 const f=fixture(),a=await created(f.store),hash=a.entries[0].hash,device='a'.repeat(64);await f.db.ref('licensesV9/'+hash+'/expiresAt').set(9876);await f.db.ref('licensesV9/'+hash+'/devices').set({[device]:{version:1,claimedAt:1},['b'.repeat(64)]:{version:1,claimedAt:2}});
 await assert.rejects(f.store.mutate(ADMIN,hash,'limit',1),/conflict/);await f.store.mutate(ADMIN,hash,'removeDevice',device);await f.store.mutate(ADMIN,hash,'limit',1);await f.store.mutate(ADMIN,hash,'reset');const after=(await f.store.snapshot(hash,ADMIN)).record;assert.equal(after.expiresAt,9876);assert.equal(after.devices,undefined);assert.equal(after.maxDevices,1);
});
test('deletion requires a fresh matching confirmation and cannot resurrect data',async()=>{
 const f=fixture(),a=await created(f.store),p=a.entries[0].hash.slice(0,16);await f.app.handle(callback(ADMIN,'do:delete:'+p+':forged'));assert.equal((await f.store.list(ADMIN)).length,1);
 await f.app.handle(callback(ADMIN,'confirm:delete:'+p));const data=f.sent.at(-1).rows[0][0].callback_data;await f.app.handle(callback(ADMIN,data));assert.equal((await f.store.list(ADMIN)).length,0);
});
test('batch bounds, numeric input and private vault integrity reject bad values',async()=>{
 const f=fixture();for(const args of [{days:0,devices:1},{days:7,devices:51},{days:7,devices:1,count:11}])await assert.rejects(f.store.create(ADMIN,args,5));
 await f.app.handle(callback(ADMIN,'new'));await f.app.handle(callback(ADMIN,'ask:days'));await f.app.handle(message(ADMIN,'1.5'));assert.equal((await f.store.list(ADMIN)).length,0);
 const v=f.store.seal({password:'only-test'});v.tag=crypto.randomBytes(16).toString('base64');assert.throws(()=>f.store.open(v));
});
test('50-device view paginates within Telegram length and callback limits',async()=>{
 const f=fixture(),a=await created(f.store),hash=a.entries[0].hash;await f.db.ref('licensesV9/'+hash+'/devices').set(Object.fromEntries(Array.from({length:50},(_,n)=>[crypto.createHash('sha256').update('device'+n).digest('hex'),{version:1,claimedAt:Date.now()}])));
 await f.app.handle(callback(ADMIN,'dev:'+hash.slice(0,16)));const sent=f.sent.at(-1);assert.ok(sent.text.length<4096);assert.equal(sent.rows.length,10);assert.ok(sent.rows.flat().every(b=>Buffer.byteLength(b.callback_data)<=64));
});
test('Premium buttons use real custom emoji IDs and safely fall back on Telegram denial',async()=>{
 const calls=[];const tg=new Telegram('1234:ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(calls.length===1)return {ok:false,status:400,json:async()=>({ok:false,error_code:400})};return {ok:true,json:async()=>({ok:true,result:{message_id:1}})};});
 tg.defaultIcon='123456789';await tg.send(OWNER,'Test',[[tg.button('Test','home')]]);assert.equal(calls.length,2);assert.equal(calls[0].reply_markup.inline_keyboard[0][0].icon_custom_emoji_id,'123456789');assert.ok(!calls[1].reply_markup.inline_keyboard[0][0].icon_custom_emoji_id);
});

test('animated theme gives distinct action icons and a custom emoji title',async()=>{
 const {ICONS}=require('../icons.cjs'),calls=[];
 const tg=new Telegram('1234:ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',async(url,options)=>{
  const body=JSON.parse(options.body);calls.push(body);
  return {ok:true,json:async()=>({ok:true,result:url.endsWith('/getCustomEmojiStickers')?Object.values(ICONS).map(x=>({custom_emoji_id:x.id,is_animated:true})): {message_id:2}})};
 });
 await tg.decorate();const a=tg.button('Tạo','new'),b=tg.button('Tìm','search'),c=tg.button('Thống kê','stats');
 assert.equal(new Set([a,b,c].map(x=>x.icon_custom_emoji_id)).size,3);
 await tg.send(OWNER,'<b>MIZZE · LICENSE CONSOLE</b>',[[a,b,c]]);
 assert.ok(calls.at(-1).text.includes('<tg-emoji emoji-id="'+ICONS.crown.id+'">'));
});

test('header-only custom emoji failure falls back once; static stickers are rejected',async()=>{
 const {ICONS}=require('../icons.cjs'),calls=[];
 const tg=new Telegram('1234:ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return calls.length===1?{ok:false,status:400,json:async()=>({ok:false,error_code:400})}:{ok:true,json:async()=>({ok:true,result:{message_id:3}})};});
 tg.icons[ICONS.crown.id]=ICONS.crown.id;
 await tg.send(OWNER,'<b>MIZZE · LICENSE CONSOLE</b>');assert.equal(calls.length,2);assert.ok(!calls[1].text.includes('<tg-emoji'));assert.ok(calls[1].text.includes('👑'));
 const onlyStatic=new Telegram('1234:ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',async()=>({ok:true,json:async()=>({ok:true,result:[{custom_emoji_id:ICONS.star.id,is_animated:false,is_video:false}]})}));
 await onlyStatic.decorate();assert.equal(onlyStatic.custom,false);assert.ok(!onlyStatic.button('Tạo','new').icon_custom_emoji_id);
});

test('both admins can create only 1/7/30-day plans; owner retains other durations',async()=>{
 const f=fixture(),other=7976468365;
 assert.ok(allowed(message(other,'/start')));await f.app.handle(message(other,'/start'));assert.ok(f.sent.some(s=>s.id===other));
 const a=await f.store.create(ADMIN,{days:1,devices:1},700),b=await f.store.create(other,{days:7,devices:1},701);
 assert.equal((await f.store.snapshot(a.entries[0].hash,ADMIN)).record.durationMs,86400000);
 await assert.rejects(f.store.snapshot(a.entries[0].hash,other),/forbidden/);
 for(const id of [ADMIN,other])await assert.rejects(f.store.create(id,{days:90,devices:1},702),/admin_plan/);
 await f.store.create(OWNER,{days:90,devices:1},703);assert.equal((await f.store.list(OWNER)).length,3);assert.equal((await f.store.list(other)).length,1);
});

test('created and retrieved credential messages have copy buttons and allow forwarding',async()=>{
 const f=fixture();for(const data of ['new','days:1','devices:1','count:1'])await f.app.handle(callback(ADMIN,data));
 await f.app.handle(callback(ADMIN,f.sent.at(-1).rows[0][0].callback_data));
 const delivered=f.sent.find(s=>s.id===ADMIN&&s.text?.includes('KEY ĐÃ TẠO'));assert.equal(delivered.options.forwardable,true);
 assert.match(delivered.rows[0][0].copy_text.text,/^[A-HJ-NP-Z2-9]{16}$/);assert.match(delivered.rows[0][1].copy_text.text,/^[A-HJ-NP-Z2-9]{16}$/);assert.ok(delivered.rows[1][0].copy_text.text.includes('Mật khẩu:'));
 const key=(await f.store.list(ADMIN))[0];await f.app.handle(callback(ADMIN,'secret:'+key.hash.slice(0,16)));assert.equal(f.sent.at(-1).options.forwardable,true);
 const calls=[],tg=new Telegram('1234:ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,result:{message_id:1}})};});
 tg.custom=false;await tg.send(ADMIN,'Credentials',[[tg.copyButton('Copy','test-copy')]],{forwardable:true});assert.equal(calls[0].protect_content,false);assert.equal(calls[0].reply_markup.inline_keyboard[0][0].copy_text.text,'test-copy');assert.ok(!calls[0].reply_markup.inline_keyboard[0][0].callback_data);
});

test('bulk expiry cleanup deletes only own expired keys and retains the sales ledger',async()=>{
 const f=fixture();let now=Date.now();f.store.clock=()=>now;
 const mine=(await f.store.create(ADMIN,{days:1,devices:1,count:3},801)).entries;
 const foreign=(await f.store.create(7976468365,{days:1,devices:1},802)).entries[0];
 await f.db.ref('licensesV9/'+mine[0].hash+'/expiresAt').set(now-1);
 await f.db.ref('licensesV9/'+mine[1].hash+'/expiresAt').set(now+86400000);
 await f.db.ref('licensesV9/'+foreign.hash+'/expiresAt').set(now-1);
 const result=await f.store.deleteExpired(ADMIN,[...mine.map(c=>c.hash),foreign.hash]);assert.equal(result.deleted,1);assert.equal(result.skipped,3);
 assert.ok((await f.db.ref('licensesV9/'+mine[2].hash).get()).val());assert.ok((await f.db.ref('licensesV9/'+foreign.hash).get()).val());
 assert.equal(Object.keys((await f.db.ref('_mizzeBotV1/sales').get()).val()).length,4);
 await f.app.handle(callback(ADMIN,'expired-do:forged'));assert.ok((await f.db.ref('licensesV9/'+mine[1].hash).get()).val());
});

test('Vietnam day boundaries and price totals are exact; old batches backfill only once',async()=>{
 const {reportSvg}=require('../reports.cjs');assert.match(reportSvg('2026-10-23',[{key:'OLD-KEY',createdBy:ADMIN,days:90,createdAt:Date.now()}]).toString(),/Chưa đặt giá/);
 const {vnDay,bounds,totals}=require('../reports.cjs');assert.equal(vnDay(Date.parse('2026-10-23T17:00:00Z')),'2026-10-24');assert.equal(vnDay(Date.parse('2026-10-23T16:59:59.999Z')),'2026-10-23');assert.equal(bounds('2026-10-24').start,Date.parse('2026-10-23T17:00:00Z'));
 const f=fixture();f.store.clock=()=>Date.parse('2026-10-23T12:00:00+07:00');
 for(const [n,days] of [1,7,30].entries())await f.store.create(ADMIN,{days,devices:1},900+n);
 await f.store.create(7976468365,{days:1,devices:1},903);await f.store.create(OWNER,{days:30,devices:1},904);
 let rows=await f.store.sales('2026-10-23');assert.equal(totals(rows).total,70000);assert.equal(totals(rows).keys,4);
 await f.db.ref('_mizzeBotV1/sales').remove();await f.store.backfillSales();await f.store.backfillSales();rows=await f.store.sales('2026-10-23');assert.equal(rows.length,4);assert.equal(totals(rows).total,70000);
});

test('owner /check today returns a private image; scheduled report survives restarts without double totals',async()=>{
 const f=fixture();let now=Date.parse('2026-10-23T23:59:00+07:00');f.store.clock=()=>now;await f.store.nextReportDay();await f.store.create(ADMIN,{days:1,devices:1},1001);
 const renderCalls=[],renderer=async(day,rows,page)=>{renderCalls.push({day,rows,page});return Buffer.from('synthetic-image');},app=new App(f.store,f.tg,renderer);
 await app.handle(message(ADMIN,'/check today'));assert.ok(!f.sent.some(x=>x.image));
 await app.handle(message(OWNER,'/check today'));assert.equal(f.sent.filter(x=>x.image).length,1);assert.ok(f.sent.at(-1).caption.includes('5.000'));
 now=Date.parse('2026-10-24T00:00:30+07:00');await app.dailyTick();assert.equal(f.sent.filter(x=>x.image).length,2);assert.equal(await f.store.nextReportDay(),'2026-10-24');
 await new App(f.store,f.tg,renderer).dailyTick();assert.equal(f.sent.filter(x=>x.image).length,2);assert.equal(renderCalls.at(-1).day,'2026-10-23');
});

test('report renderer produces a real readable PNG with all key rows and total',async()=>{
 const {renderReport}=require('../reports.cjs'),sharp=require('sharp'),fs=require('node:fs'),path=require('node:path');
 const rows=[1,7,30].map((days,i)=>({hash:String(i).repeat(64),key:'MZ10-DEMO-KEY-'+String(i+1).padStart(2,'0'),days,createdAt:Date.parse('2026-10-23T10:00:00+07:00')+i*60000,createdBy:ADMIN,priceVnd:({1:5000,7:20000,30:40000})[days]}));
 const png=await renderReport('2026-10-23',rows);assert.equal(png.subarray(1,4).toString(),'PNG');const info=await sharp(png).metadata();assert.equal(info.width,1160);assert.ok(info.height>500);
 if(process.env.MIZZE_REPORT_PREVIEW)fs.writeFileSync(process.env.MIZZE_REPORT_PREVIEW,png);
});

test('runner lease safely transfers and dispatch really targets workflow_dispatch',async()=>{
 const {RunnerLease,relaunch}=require('../runner.cjs'),db=fakeDB();let now=1000;const first=new RunnerLease(db,()=>now),second=new RunnerLease(db,()=>now);
 assert.ok(await first.renew());assert.equal(await second.renew(),false);now+=90001;assert.ok(await second.renew());assert.equal(await first.renew(),false);await first.release();assert.ok((await db.ref('_mizzeBotV1/runner').get()).val());await second.release();assert.equal((await db.ref('_mizzeBotV1/runner').get()).val(),null);
 let captured;await relaunch({token:'synthetic',repository:'demo/bot',fetcher:async(url,options)=>{captured={url,options};return {status:204};}});assert.ok(captured.url.endsWith('/actions/workflows/bot.yml/dispatches'));assert.equal(JSON.parse(captured.options.body).ref,'main');
 await assert.rejects(relaunch({token:'synthetic',repository:'demo/bot',fetcher:async()=>({status:403})}),/dispatch_http_403/);
});

test('missing sales index uses only private-subtree fallback and retains day/admin filtering',async()=>{
 const rows={a:{hash:'a',createdBy:ADMIN,createdAt:Date.parse('2026-10-23T12:00:00+07:00')},b:{hash:'b',createdBy:OWNER,createdAt:Date.parse('2026-10-23T12:00:00+07:00')},c:{hash:'c',createdBy:ADMIN,createdAt:Date.parse('2026-10-22T12:00:00+07:00')}};
 let reads=0,rootReads=0;const ref={orderByChild(){return {startAt(){return this;},endAt(){return this;},async get(){throw Error('Index not defined, add .indexOn');}};},async get(){reads++;return {val:()=>rows};}};
 const db={ref(p){if(p!=='_mizzeBotV1/sales'){rootReads++;throw Error('unexpected_path');}return ref;}},store=new Store(db,crypto.randomBytes(32).toString('base64'));
 assert.deepEqual((await store.sales('2026-10-23')).map(x=>x.hash),['a']);assert.equal(reads,1);assert.equal(rootReads,0);
 ref.orderByChild=()=>({startAt(){return this;},endAt(){return this;},get:async()=>{throw Error('permission denied');}});
 await assert.rejects(store.sales('2026-10-23'),/permission denied/);assert.equal(reads,1);
 ref.orderByChild=()=>({startAt(){return this;},endAt(){return this;},get:async()=>{throw Error('network unavailable');}});
 await assert.rejects(store.sales('2026-10-23'),/network unavailable/);assert.equal(reads,1);
});

test('background report failure never blocks commands and retries separately after one minute',async()=>{
 const {Worker}=require('../worker.cjs');let now=1000,reports=0,polls=0;const handled=[],saved=[],logs=[];
 const worker=new Worker({clock:()=>now,lease:{owned:true,renew:async()=>true},store:{offset:async n=>saved.push(n)},logger:{write:s=>logs.push(JSON.parse(s))},app:{flushReports:async()=>{},dailyTick:async()=>{reports++;throw Error('Index not defined at https://private.invalid?auth=secret');},handle:async u=>handled.push(u.update_id)},telegram:{call:async()=>{polls++;return [{update_id:10+polls}];}}});
 let result=await worker.cycle(10);assert.equal(result.offset,12);assert.deepEqual(handled,[11]);assert.deepEqual(saved,[12]);assert.equal(logs[0].stage,'reports.background');assert.equal(logs[0].category,'firebase_index_missing');assert.ok(!JSON.stringify(logs).includes('secret'));
 now+=30000;result=await worker.cycle(result.offset);assert.equal(reports,1);assert.equal(polls,2);
 now+=30001;await worker.cycle(result.offset);assert.equal(reports,2);assert.equal(polls,3);
});

test('worker identifies poll/storage errors and preserves progress from earlier updates',async()=>{
 const {Worker}=require('../worker.cjs');const app={flushReports:async()=>{},dailyTick:async()=>{},handle:async()=>{}},lease={owned:true,renew:async()=>true};
 const fail=Object.assign(Error('private response'),{code:429}),worker=new Worker({app,lease,store:{offset:async()=>{}},telegram:{call:async()=>{throw fail;}}});
 await assert.rejects(worker.cycle(0),e=>e===fail);assert.equal(worker.stage,'telegram.poll');
 worker.tg.call=async()=>[{update_id:1},{update_id:2}];worker.store.offset=async n=>{if(n===3)throw Error('storage failed');};
 await assert.rejects(worker.cycle(0),/storage failed/);assert.equal(worker.stage,'storage.offset');assert.equal(worker.offset,2);
 lease.owned=false;assert.equal((await worker.cycle(2)).stop,true);
});

test('retry diagnostics never print credentials, raw exception text or arbitrary categories',async()=>{
 const {logFailure}=require('../diagnostics.cjs'),entries=[],logger={write:s=>entries.push(JSON.parse(s))};
 logFailure('telegram.poll',Object.assign(Error('https://private.invalid/bot999:secret?token=secret'),{code:'network',transport:'ECONNRESET'}),2,logger);
 logFailure('secret-path',Object.assign(Error('secret body'),{code:'secret-token',transport:'secret'}),1,logger);
 assert.equal(entries[0].transport,'ECONNRESET');assert.equal(entries[1].stage,'operation');assert.equal(entries[1].category,'operation_failed');assert.ok(!JSON.stringify(entries).includes('secret'));
});

test('one-hour wizard creates a first-use hour key, reports correct units, preserves replay and rejects mixed plans',async()=>{
 const f=fixture();for(const data of ['new','hours:1','devices:2','count:1'])await f.app.handle(callback(ADMIN,data));
 assert.match(f.sent.at(-1).text,/1 giờ/);await f.app.handle(callback(ADMIN,f.sent.at(-1).rows[0][0].callback_data));
 const item=(await f.store.list(ADMIN))[0],record=item.record;assert.equal(record.durationMs,3600000);assert.equal(record.activatedAt,0);assert.equal(record.expiresAt,0);assert.equal(record.maxDevices,2);
 assert.ok(f.sent.some(s=>s.text?.includes('KEY ĐÃ TẠO')&&s.text.includes('1 giờ từ lần kích hoạt')));
 const sales=Object.values(f.db.dump()._mizzeBotV1.sales);assert.equal(sales[0].hours,1);assert.equal(sales[0].days,0);assert.equal(sales[0].priceVnd,undefined);

 await f.app.handle(callback(ADMIN,'view:'+item.hash.slice(0,16)));assert.match(f.sent.at(-1).text,/1 giờ từ lần dùng đầu/);
 await f.db.ref('_mizzeBotV1/sales/'+item.hash).remove();await f.store.backfillSales();assert.equal((await f.db.ref('_mizzeBotV1/sales/'+item.hash).get()).val().hours,1);
 for(const id of [ADMIN,7976468365,OWNER]){const a=await f.store.create(id,{hours:1,devices:1},900+id);assert.equal((await f.store.snapshot(a.entries[0].hash,id)).record.durationMs,3600000);}
 for(const args of [{hours:8761,devices:1},{days:1,hours:1,devices:1},{hours:.5,devices:1}])await assert.rejects(f.store.create(ADMIN,args,999));
 const a=await f.store.create(ADMIN,{hours:1,devices:1},990);const again=await f.store.create(ADMIN,{hours:1,devices:1},990);assert.equal(a.entries[0].hash,again.entries[0].hash);await assert.rejects(f.store.create(ADMIN,{days:1,devices:1},990),/operation_conflict/);
 await f.app.handle(callback(ADMIN,'new'));await f.app.handle(callback(ADMIN,'hours:1'));await f.app.handle(callback(ADMIN,'days:7'));assert.equal((await f.store.state(ADMIN)).hours,0);
});


test('custom hour plans support admin presets, typed hours, owner extension and immutable first-use expiry',async()=>{
 const f=fixture();for(const h of [2,3,6,12,23]){const a=await f.store.create(ADMIN,{hours:h,devices:1},12000+h);const record=(await f.store.snapshot(a.entries[0].hash,ADMIN)).record;assert.equal(record.durationMs,h*3600000);assert.equal(record.activatedAt,0);assert.equal(record.expiresAt,0);}
 for(const h of [24,48,8760])await assert.rejects(f.store.create(ADMIN,{hours:h,devices:1},13000+h),/admin_plan/);
 const a=await f.store.create(OWNER,{hours:48,devices:2},14000);assert.equal((await f.store.snapshot(a.entries[0].hash,OWNER)).record.durationMs,48*3600000);
 for(const data of ['new','ask:hours'])await f.app.handle(callback(ADMIN,data));await f.app.handle(message(ADMIN,'7'));assert.equal((await f.store.state(ADMIN)).hours,7);assert.equal((await f.store.state(ADMIN)).days,0);
 await f.app.handle(callback(ADMIN,'devices:1'));await f.app.handle(callback(ADMIN,'count:1'));assert.match(f.sent.at(-1).text,/7 giờ/);await f.app.handle(callback(ADMIN,f.sent.at(-1).rows[0][0].callback_data));assert.ok(f.sent.some(x=>x.text?.includes('7 giờ từ lần kích hoạt')));
 await f.app.handle(callback(ADMIN,'new'));await f.app.handle(callback(ADMIN,'hours:3'));await f.app.handle(callback(ADMIN,'days:7'));assert.equal((await f.store.state(ADMIN)).hours,0);
 await f.app.handle(callback(ADMIN,'hours:6'));assert.equal((await f.store.state(ADMIN)).days,0);assert.equal((await f.store.state(ADMIN)).hours,6);
 await assert.rejects(f.store.create(ADMIN,{hours:3,devices:1},12002),/operation_conflict/);
});
