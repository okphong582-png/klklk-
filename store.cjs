'use strict';
const crypto=require('node:crypto');
const {OWNER,ADMIN,PROJECT,role,path,integer}=require('./config.cjs');
const credentials=require('./credentials.cjs');
class Store{
 constructor(database,vaultKey,clock=Date.now){this.db=database;this.key=Buffer.from(vaultKey,'base64');if(this.key.length!==32)throw Error('invalid_vault_key');this.clock=clock;}
 seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')};}
 open(value){if(value?.v!==1)throw Error('invalid_vault');const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(value.iv,'base64'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8'));}
 checkRole(id){if(!role(id))throw Error('forbidden');}
 async snapshot(hash,id){this.checkRole(id);if(!path.test(hash))throw Error('invalid_hash');const [r,m]=await Promise.all([this.db.ref('licensesV9/'+hash).get(),this.db.ref('licenseAdminV9/'+hash).get()]);const record=r.val(),meta=m.val()||{};if(!record||record.protocol!==9)throw Error('not_found');if(id!==OWNER&&meta.createdBy!==id)throw Error('forbidden');return {hash,record,meta};}
 async list(id){this.checkRole(id);const [r,m]=await Promise.all([this.db.ref('licensesV9').get(),this.db.ref('licenseAdminV9').get()]);const records=r.val()||{},metadata=m.val()||{};return Object.entries(records).filter(([hash,record])=>path.test(hash)&&record?.protocol===9&&(id===OWNER||metadata[hash]?.createdBy===id)).map(([hash,record])=>({hash,record,meta:metadata[hash]||{}})).sort((a,b)=>(b.record.createdAt||0)-(a.record.createdAt||0));}
 async create(id,{days,devices,count=1},operation){
  this.checkRole(id);integer(days,1,3650);integer(devices,1,50);integer(count,1,10);
  if(!/^\d{1,20}$/.test(String(operation)))throw Error('invalid_operation');
  const batchId=id+'-'+operation,ref=this.db.ref('_mizzeBotV1/batches/'+batchId);
  // Persist the entire random bundle before publishing keys: replaying a callback
  // after a process restart must re-use the same credentials, not issue extra keys.
  const existing=(await ref.get()).val();let batch=existing;
  if(!batch){
   const now=this.clock(),entries=[];for(let n=0;n<count;n++){const c=credentials.generate();entries.push({...c,hash:await credentials.hash(c.key,c.password)});}
   const candidate={createdBy:id,createdAt:now,days,devices,count,vault:this.seal(entries)};
   const transaction=await ref.transaction(value=>value||candidate);batch=transaction.snapshot.val();
  }
  if(batch.createdBy!==id||batch.days!==days||batch.devices!==devices||batch.count!==count)throw Error('operation_conflict');
  const entries=this.open(batch.vault),updates={};
  if(!batch.published){
   for(const c of entries){updates['licensesV9/'+c.hash]=credentials.pendingRecord(days*86400000,batch.createdAt,devices);updates['licenseAdminV9/'+c.hash]={key:c.key,createdAt:batch.createdAt,createdBy:id,note:'Telegram · '+role(id),vault:this.seal({key:c.key,password:c.password})};}
   updates['_mizzeBotV1/batches/'+batchId+'/published']=true;
   updates['_mizzeBotV1/outbox/'+batchId]={batchId,createdAt:batch.createdAt,actor:id,type:'created',count,days,devices,vault:batch.vault};
   // All license records, private metadata and owner report are committed together.
   await this.db.ref().update(updates);
  }
  return {batchId,entries,days,devices,count};
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
