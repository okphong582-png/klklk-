'use strict';
const crypto=require('node:crypto');
const {OWNER,ADMIN,PROJECT,role,path,integer}=require('./config.cjs');
const credentials=require('./credentials.cjs');
const {plan}=require('./plans.cjs');
const {PRICES,vnDay,bounds,nextDay}=require('./reports.cjs');
class Store{
 constructor(database,vaultKey,clock=Date.now){this.db=database;this.key=Buffer.from(vaultKey,'base64');if(this.key.length!==32)throw Error('invalid_vault_key');this.clock=clock;}
 seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')};}
 open(value){if(value?.v!==1)throw Error('invalid_vault');const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(value.iv,'base64'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8'));}
 checkRole(id){if(!role(id))throw Error('forbidden');}
 async snapshot(hash,id){this.checkRole(id);if(!path.test(hash))throw Error('invalid_hash');const [r,m]=await Promise.all([this.db.ref('licensesV9/'+hash).get(),this.db.ref('licenseAdminV9/'+hash).get()]);const record=r.val(),meta=m.val()||{};if(!record||record.protocol!==9)throw Error('not_found');if(id!==OWNER&&meta.createdBy!==id)throw Error('forbidden');return {hash,record,meta};}
 async list(id){this.checkRole(id);const [r,m]=await Promise.all([this.db.ref('licensesV9').get(),this.db.ref('licenseAdminV9').get()]);const records=r.val()||{},metadata=m.val()||{};return Object.entries(records).filter(([hash,record])=>path.test(hash)&&record?.protocol===9&&(id===OWNER||metadata[hash]?.createdBy===id)).map(([hash,record])=>({hash,record,meta:metadata[hash]||{}})).sort((a,b)=>(b.record.createdAt||0)-(a.record.createdAt||0));}
 async create(id,{days,hours,devices,count=1},operation){
  this.checkRole(id);const selected=plan({days,hours});days=selected.days;hours=selected.hours;integer(devices,1,50);integer(count,1,10);
  if(id!==OWNER&&(hours>23||(!hours&&!Object.hasOwn(PRICES,days))))throw Error('admin_plan');
  if(!/^\d{1,20}$/.test(String(operation)))throw Error('invalid_operation');
  const batchId=id+'-'+operation,ref=this.db.ref('_mizzeBotV1/batches/'+batchId);
  // Persist the entire random bundle before publishing keys: replaying a callback
  // after a process restart must re-use the same credentials, not issue extra keys.
  const existing=(await ref.get()).val();let batch=existing;
  if(!batch){
   const now=this.clock(),entries=[];for(let n=0;n<count;n++){const c=credentials.generate();entries.push({...c,hash:await credentials.hash(c.key,c.password)});}
   const candidate={createdBy:id,createdAt:now,days,hours,devices,count,vault:this.seal(entries)};
   const transaction=await ref.transaction(value=>value||candidate);batch=transaction.snapshot.val();
  }
  if(batch.createdBy!==id||plan(batch).durationMs!==selected.durationMs||batch.devices!==devices||batch.count!==count)throw Error('operation_conflict');
  const entries=this.open(batch.vault),updates={};
  if(!batch.published){
   for(const c of entries){updates['licensesV9/'+c.hash]=credentials.pendingRecord(selected.durationMs,batch.createdAt,devices);updates['licenseAdminV9/'+c.hash]={key:c.key,createdAt:batch.createdAt,createdBy:id,note:'Telegram · '+role(id),vault:this.seal({key:c.key,password:c.password})};if(role(id)==='admin')updates['_mizzeBotV1/sales/'+c.hash]={hash:c.hash,key:c.key,createdAt:batch.createdAt,createdBy:id,days,hours,durationMs:selected.durationMs,...(hours?{}:{priceVnd:PRICES[days]}),batchId};}
   updates['_mizzeBotV1/batches/'+batchId+'/published']=true;
   updates['_mizzeBotV1/outbox/'+batchId]={batchId,createdAt:batch.createdAt,actor:id,type:'created',count,days,hours,devices,vault:batch.vault};
   // All license records, private metadata and owner report are committed together.
   await this.db.ref().update(updates);
  }
  return {batchId,entries,days,hours,devices,count};
 }
 async mutate(id,hash,action,value){
  await this.snapshot(hash,id);const ref=this.db.ref('licensesV9/'+hash);
  if(action==='delete'){
   // Remove authoritative license before private metadata. Never resurrect a key.
   await ref.remove();await this.db.ref('licenseAdminV9/'+hash).remove();
  }else{
   const result=await ref.transaction(record=>{
    // A cold Admin SDK cache may initially pass null for an existing record.
    // Return null to force the conditional server round-trip, not undefined.
    if(record===null)return null;
    if(!record||record.protocol!==9)return;
    if(action==='enable')return {...record,enabled:true};if(action==='disable')return {...record,enabled:false};
    if(action==='reset'){const next={...record};delete next.devices;return next;}
    if(action==='limit'){const maximum=integer(value,1,50);if(Object.keys(record.devices||{}).length>maximum)return;return {...record,maxDevices:maximum};}
    if(action==='removeDevice'){if(!path.test(value))throw Error('invalid_hash');const next={...record,devices:{...record.devices}};delete next.devices[value];return next;}
    throw Error('invalid_action');
   });if(!result.committed||!result.snapshot.val())throw Error('conflict');
  }
  const event=crypto.randomBytes(12).toString('hex');await this.db.ref('_mizzeBotV1/audit/'+event).set({actor:id,hash,action,at:this.clock()});
 }
 async lookup(id,value){const all=await this.list(id);const needle=value.trim().toUpperCase();return all.find(x=>x.hash===value.trim()||x.meta.key===needle)||null;}
 async expired(id){return (await this.list(id)).filter(x=>Number.isSafeInteger(x.record.expiresAt)&&x.record.expiresAt>0&&x.record.expiresAt<=this.clock());}
 async deleteExpired(id,hashes){
  this.checkRole(id);const scope=new Set((await this.expired(id)).map(x=>x.hash));let deleted=0,skipped=0;
  for(const hash of hashes){if(!scope.has(hash)){skipped++;continue;}
   const result=await this.db.ref('licensesV9/'+hash).transaction(record=>{
    if(record===null)return null;if(record.protocol!==9||!Number.isSafeInteger(record.expiresAt)||record.expiresAt<=0||record.expiresAt>this.clock())return;return null;
   });
   if(result.committed&&result.snapshot.val()===null){await this.db.ref('licenseAdminV9/'+hash).remove();deleted++;}else skipped++;
  }
  return {deleted,skipped};
 }
 async backfillSales(){
  const batches=(await this.db.ref('_mizzeBotV1/batches').get()).val()||{},existing=(await this.db.ref('_mizzeBotV1/sales').get()).val()||{},updates={};
  for(const [batchId,batch] of Object.entries(batches)){
   if(!batch.published||role(batch.createdBy)!=='admin')continue;
   for(const c of this.open(batch.vault))if(!existing[c.hash])updates['_mizzeBotV1/sales/'+c.hash]={hash:c.hash,key:c.key,createdAt:batch.createdAt,createdBy:batch.createdBy,days:batch.days,hours:batch.hours||0,priceVnd:PRICES[batch.days]??null,batchId};
  }
  if(Object.keys(updates).length)await this.db.ref().update(updates);
 }
 async sales(day){const {start,end}=bounds(day),ref=this.db.ref('_mizzeBotV1/sales');
  const query=typeof ref.orderByChild==='function'?ref.orderByChild('createdAt').startAt(start).endAt(end-1):ref;
  let snapshot;try{snapshot=await query.get();}catch(error){
   // Existing installations may not have published the optional index. Only
   // that exact failure permits a plain read of this private sales subtree;
   // network/permission errors still propagate and never become empty reports.
   if(query===ref||!/index not defined|no index defined/i.test(String(error.message||'')))throw error;
   snapshot=await ref.get();
  }
  return Object.values(snapshot.val()||{}).filter(x=>role(x.createdBy)==='admin'&&x.createdAt>=start&&x.createdAt<end).sort((a,b)=>a.createdAt-b.createdAt||a.hash.localeCompare(b.hash));
 }
 async nextReportDay(){const ref=this.db.ref('_mizzeBotV1/reportCursor'),today=vnDay(this.clock());const result=await ref.transaction(value=>value||today);return result.snapshot.val();}
 async reportPage(day){return (await this.db.ref('_mizzeBotV1/dailyReports/'+day+'/nextPage').get()).val()||0;}
 async sentReportPage(day,page){await this.db.ref('_mizzeBotV1/dailyReports/'+day+'/nextPage').set(page);}
 async completeDaily(day){await this.db.ref().update({'_mizzeBotV1/reportCursor':nextDay(day),['_mizzeBotV1/dailyReports/'+day+'/completedAt']:this.clock()});}
 async saveState(id,value){this.checkRole(id);await this.db.ref('_mizzeBotV1/state/'+id).set(value);}
 async state(id){this.checkRole(id);const value=(await this.db.ref('_mizzeBotV1/state/'+id).get()).val();return value&&value.until>this.clock()?value:null;}
 async pendingReports(){return (await this.db.ref('_mizzeBotV1/outbox').get()).val()||{};}
 async completeReport(key){await this.db.ref('_mizzeBotV1/outbox/'+key).remove();}
 async offset(value){const ref=this.db.ref('_mizzeBotV1/offset');if(value!==undefined)await ref.set(value);return (await ref.get()).val()||0;}
}
function databaseFromEnv(env=process.env){
 const {initializeApp,cert}=require('firebase-admin/app'),{getDatabase}=require('firebase-admin/database');
 const account=JSON.parse(env.FIREBASE_ADMIN_JSON||'null');
 if(account?.type!=='service_account'||account.project_id!==PROJECT||account.token_uri!=='https://oauth2.googleapis.com/token')throw Error('wrong_firebase_project');
 return getDatabase(initializeApp({credential:cert(account),databaseURL:'https://'+PROJECT+'-default-rtdb.firebaseio.com'}));
}
module.exports={Store,databaseFromEnv};
