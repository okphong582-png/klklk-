'use strict';
const fs=require('node:fs'),{setTimeout:delay}=require('node:timers/promises');
const {RunnerLease}=require('./runner.cjs');
const {databaseFromEnv,Store}=require('./store.cjs'),{Telegram}=require('./telegram.cjs'),{App}=require('./app.cjs');
async function main(){
 const database=databaseFromEnv(),store=new Store(database,process.env.BOT_VAULT_KEY||''),tg=new Telegram(process.env.TELEGRAM_BOT_TOKEN||''),app=new App(store,tg);
 const lease=new RunnerLease(database);let stopping=false;
 process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
 const until=Date.now()+Math.min(18000,Math.max(60,Number(process.env.RUN_SECONDS)||18000))*1000;
 try{
  // A watchdog may start while the leader is healthy. It exits immediately,
  // rather than spending another five hours polling or holding a concurrency slot.
  if(!await lease.renew()){process.stdout.write('A healthy bot worker already owns the lease; standby exits.\n');return;}
  lease.start();await store.backfillSales();await store.nextReportDay();
  const me=await tg.call('getMe'),webhook=await tg.call('getWebhookInfo');
  if(webhook.url)throw Error('webhook_exists_use_dedicated_bot');
  await tg.decorate();
  await tg.call('setMyCommands',{commands:[{command:'start',description:'Mở bảng quản trị Mizze'},{command:'menu',description:'Menu quản lý key'},{command:'check',description:'Owner: /check today xem báo cáo hôm nay'},{command:'cancel',description:'Hủy thao tác'},{command:'id',description:'Xem ID và vai trò'}]});
  process.stdout.write('Bot verified; waiting for authorized private messages.\n');
  let offset=await store.offset(),failures=0,nextReports=0;
  while(!stopping&&Date.now()<until){
   try{
    if(!lease.owned||!await lease.renew())break;
    if(Date.now()>=nextReports){await app.flushReports();await app.dailyTick();nextReports=Date.now()+30000;}
    const updates=await tg.call('getUpdates',{offset,timeout:25,limit:20,allowed_updates:['message','callback_query']});
    for(const update of updates){
     if(stopping||Date.now()>=until)break;
     if(!Number.isSafeInteger(update.update_id)||update.update_id<offset)continue;
     if(!lease.owned||!await lease.renew())break;
     await app.handle(update);offset=update.update_id+1;await store.offset(offset);
    }
    failures=0;
   }catch(error){
    if(error.code===409)throw Error('another_bot_poller_active');
    failures++;process.stderr.write('Temporary bot transport/storage failure; retrying with backoff.\n');
    await delay(Math.min(60000,(error.retry||Math.min(30,2**Math.min(failures,5)))*1000));
   }
  }
  // Signal a handoff only for a natural five-hour leader rotation. The workflow
  // dispatch step runs after finally releases the Firebase lock and closes SDK.
  if(!stopping&&lease.owned&&Date.now()>=until&&process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'relaunch=true\n');
 }finally{
  await lease.release();
  await database.app.delete();
 }
}
if(require.main===module)main().catch(()=>{process.stderr.write('Bot stopped. Check private Secrets, Firebase access and single-runner setup. No credentials are logged.\n');process.exitCode=1;});
module.exports={main};
