'use strict';
const fs=require('node:fs'),{setTimeout:delay}=require('node:timers/promises');
const {RunnerLease}=require('./runner.cjs');
const {Worker}=require('./worker.cjs'),{logFailure}=require('./diagnostics.cjs');
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
  let offset=await store.offset(),failures=0;const worker=new Worker({store,telegram:tg,app,lease});
  while(!stopping&&Date.now()<until){
   try{
    const result=await worker.cycle(offset,()=>stopping||Date.now()>=until);offset=result.offset;if(result.stop)break;
    failures=0;
   }catch(error){
    offset=worker.offset??offset;
    if(error.code===409)throw Error('another_bot_poller_active');
    failures++;logFailure(worker.stage,error,failures);
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
if(require.main===module)main().catch(error=>{logFailure('startup',error);process.stderr.write('Bot stopped. Check private Secrets, Firebase access and single-runner setup. No credentials are logged.\n');process.exitCode=1;});
module.exports={main};
