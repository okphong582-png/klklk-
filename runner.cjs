'use strict';
const crypto=require('node:crypto');
class RunnerLease{
 constructor(database,clock=Date.now){this.ref=database.ref('_mizzeBotV1/runner');this.clock=clock;this.owner=crypto.randomBytes(16).toString('hex');this.owned=false;this.busy=false;}
 async renew(){if(this.busy)return this.owned;this.busy=true;try{const now=this.clock(),result=await this.ref.transaction(value=>(value===null||value.owner===this.owner||value.until<now)?{owner:this.owner,until:now+90000}:undefined);return this.owned=result.committed;}finally{this.busy=false;}}
 start(){this.timer=setInterval(()=>this.renew().catch(()=>{this.owned=false;}),20000);this.timer.unref();}
 async release(){clearInterval(this.timer);await this.ref.transaction(value=>value?.owner===this.owner?null:undefined).catch(()=>{});this.owned=false;}
}
async function relaunch({token,repository,ref='main',fetcher=fetch}={}){
 if(!token||!/^[-\w.]+\/[-\w.]+$/.test(repository||''))throw Error('missing_dispatch_configuration');
 const response=await fetcher('https://api.github.com/repos/'+repository+'/actions/workflows/bot.yml/dispatches',{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({ref}),signal:AbortSignal.timeout(15000)});
 if(response.status!==204)throw Error('dispatch_http_'+response.status);return true;
}
module.exports={RunnerLease,relaunch};
