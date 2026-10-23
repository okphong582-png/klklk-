'use strict';
const {logFailure}=require('./diagnostics.cjs');
class Worker{
 constructor({store,telegram,app,lease,clock=Date.now,logger=process.stderr}){Object.assign(this,{store,tg:telegram,app,lease,clock,logger});this.nextReports=0;this.reportFailures=0;this.stage='lease.renew';}
 async cycle(offset,shouldStop=()=>false){
  this.offset=offset;
  this.stage='lease.renew';if(shouldStop()||!this.lease.owned||!await this.lease.renew())return {offset,stop:true};
  if(this.clock()>=this.nextReports){
   // Reports have their own retry clock. A bad image, missing index or blocked
   // owner chat must not prevent getUpdates or unrelated admin commands.
   this.nextReports=this.clock()+30000;
   try{await this.app.flushReports();await this.app.dailyTick();this.reportFailures=0;}
   catch(error){this.reportFailures++;this.nextReports=this.clock()+60000;logFailure('reports.background',error,this.reportFailures,this.logger);}
  }
  if(shouldStop()||!this.lease.owned)return {offset,stop:true};
  this.stage='telegram.poll';const updates=await this.tg.call('getUpdates',{offset,timeout:25,limit:20,allowed_updates:['message','callback_query']});
  for(const update of updates){
   if(shouldStop()||!this.lease.owned)return {offset,stop:true};
   if(!Number.isSafeInteger(update.update_id)||update.update_id<offset)continue;
   this.stage='lease.renew';if(!await this.lease.renew())return {offset,stop:true};
   this.stage='telegram.update';await this.app.handle(update);
   this.stage='storage.offset';const nextOffset=update.update_id+1;await this.store.offset(nextOffset);this.offset=offset=nextOffset;
  }
  return {offset,stop:false};
 }
}
module.exports={Worker};
