'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Store}=require('../store.cjs'),{App}=require('../app.cjs'),{Telegram}=require('../telegram.cjs'),{OWNER,ADMIN,allowed}=require('../config.cjs');
function fakeDB(){let root={},queue=Promise.resolve();const clone=x=>x===undefined?null:structuredClone(x);
 const parts=p=>(p||'').split('/').filter(Boolean),get=p=>{let v=root;for(const k of parts(p))v=v?.[k];return clone(v);};
 const set=(p,value)=>{const keys=parts(p);if(!keys.length){root=clone(value)||{};return;}let v=root;for(const key of keys.slice(0,-1)){if(!v[key]||typeof v[key]!=='object')v[key]={};v=v[key];}if(value===null)delete v[keys.at(-1)];else v[keys.at(-1)]=clone(value);};
 return {ref(path=''){return {get:async()=>({val:()=>get(path)}),set:async v=>set(path,v),remove:async()=>set(path,null),update:async updates=>{for(const [p,v] of Object.entries(updates))set(path+'/'+p,v);},transaction(fn){const next=queue.then(()=>{const value=fn(get(path));if(value===undefined)return {committed:false,snapshot:{val:()=>get(path)}};set(path,value);return {committed:true,snapshot:{val:()=>get(path)}};});queue=next.catch(()=>{});return next;}};},dump:()=>clone(root)};
}
function fixture(){const db=fakeDB(),store=new Store(db,crypto.randomBytes(32).toString('base64')),sent=[],tg={button:(text,callback_data,style)=>({text,callback_data,style}),send:async(id,text,rows=[])=>{sent.push({id,text,rows});return {message_id:sent.length};},answer:async()=>{}},app=new App(store,tg);return {db,store,tg,sent,app};}
let uid=100;
const message=(id,text,chat={id,type:'private'})=>({update_id:uid++,message:{from:{id,is_bot:false},chat,text}});
const callback=(id,data,chat={id,type:'private'})=>({update_id:uid++,callback_query:{id:'callback',from:{id,is_bot:false},message:{chat},data}});
async function created(store,id=ADMIN,op=1){return store.create(id,{days:30,devices:2,count:1},op);}

test('only the exact two user IDs in their own private chats can touch the bot',async()=>{
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
