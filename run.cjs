'use strict';
const crypto=require('node:crypto'),{setTimeout:delay}=require('node:timers/promises');
const {databaseFromEnv,Store}=require('./store.cjs'),{Telegram}=require('./telegram.cjs'),{App}=require('./app.cjs');
async function main(){
 const database=databaseFromEnv(),store=new Store(database,process.env.BOT_VAULT_KEY||''),tg=new Telegram(process.env.TELEGRAM_BOT_TOKEN||''),app=new App(store,tg);
 const owner=crypto.randomBytes(16).toString('hex'),lock=database.ref('_mizzeBotV1/runner');let stopping=false,owned=false;
 process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
 const until=Date.now()+Math.min(19800,Math.max(60,Number(process.env.RUN_SECONDS)||19740))*1000;
 async function renew(){const now=Date.now(),result=await lock.transaction(value=>(value===null||value.owner===owner||value.until<now)?{owner,until:now+90000}:undefined);owned=result.committed;return owned;}
 try{
  const me=await tg.call('getMe'),webhook=await tg.call('getWebhookInfo');
  if(webhook.url)throw Error('webhook_exists_use_dedicated_bot');
  await tg.decorate();
  await tg.call('setMyCommands',{commands:[{command:'start',description:'Mở bảng quản trị Mizze'},{command:'menu',description:'Menu quản lý key'},{command:'cancel',description:'Hủy thao tác'},{command:'id',description:'Xem ID và vai trò'}]});
  process.stdout.write('Bot verified; waiting for authorized private messages.\n');
  let offset=await store.offset(),failures=0,nextReports=0;
  while(!stopping&&Date.now()<until){
   try{
    if(!await renew()){await delay(5000);continue;}
    if(Date.now()>=nextReports){await app.flushReports();nextReports=Date.now()+30000;}
    const updates=await tg.call('getUpdates',{offset,timeout:25,limit:20,allowed_updates:['message','callback_query']});
    for(const update of updates){
     if(stopping||Date.now()>=until)break;
     if(!Number.isSafeInteger(update.update_id)||update.update_id<offset)continue;
     if(!await renew())break;
     await app.handle(update);offset=update.update_id+1;await store.offset(offset);
    }
    failures=0;
   }catch(error){
    if(error.code===409)throw Error('another_bot_poller_active');
    failures++;process.stderr.write('Temporary bot transport/storage failure; retrying with backoff.\n');
    await delay(Math.min(60000,(error.retry||Math.min(30,2**Math.min(failures,5)))*1000));
   }
  }
 }finally{
  if(owned)await lock.transaction(value=>value?.owner===owner?null:undefined).catch(()=>{});
  await database.app.delete();
 }
}
if(require.main===module)main().catch(()=>{process.stderr.write('Bot stopped. Check private Secrets, Firebase access and single-runner setup. No credentials are logged.\n');process.exitCode=1;});
module.exports={main};
