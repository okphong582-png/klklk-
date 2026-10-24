'use strict';
const crypto=require('node:crypto');
const {OWNER,ADMIN,ADMINS,role,allowed,html,integer}=require('./config.cjs');
const {PRICES,vnDay,totals,money,renderReport,reportCaption}=require('./reports.cjs');
function status(record){return record.enabled!==true?'Đã khóa':record.timeMode==='firstUse'&&record.activatedAt===0?'Chưa kích hoạt':record.expiresAt<=Date.now()?'Hết hạn':'Đang hoạt động';}
function summary(item){const r=item.record;return '<b>'+html(item.meta.key||item.hash.slice(0,12))+'</b>\n'+status(r)+' · '+Object.keys(r.devices||{}).length+'/'+r.maxDevices+' máy\n'+(r.activatedAt===0&&r.timeMode==='firstUse'?'Thời hạn: '+r.durationMs/86400000+' ngày từ lần dùng đầu':'Hết hạn: '+new Date(r.expiresAt).toISOString().replace('T',' ').slice(0,19)+' UTC');}
class App{
 constructor(store,telegram,renderer=renderReport){this.store=store;this.tg=telegram;this.renderer=renderer;}
 b(...args){return this.tg.button(...args);}
 async state(id,value){await this.store.saveState(id,value?{...value,until:Date.now()+15*60000}:null);}
 async home(id){await this.state(id,null);return this.tg.send(id,'<b>MIZZE · LICENSE CONSOLE</b>\n'+(id===OWNER?'OWNER · Toàn quyền':'ADMIN · Quản lý key do bạn tạo')+'\n\nKey chỉ tính giờ từ lần kích hoạt hợp lệ đầu tiên.',[
  [this.b('Tạo key','new','success','➕'),this.b('Danh sách key','list:0','primary','📋')],
  [this.b('Tra cứu key','search','primary','🔎'),this.b('Thống kê','stats','primary','📊')],
  [this.b('Xóa key hết hạn','expired','danger')],
  ...(id===OWNER?[[this.b('Báo cáo hôm nay','report:today')]]:[]),
  [this.b('Hướng dẫn','help','primary','💎')]]);}
 async createMenu(id){await this.state(id,{kind:'create',days:30,devices:1,count:1});return this.days(id);}
 async days(id){return this.tg.send(id,'<b>01 · CHỌN THỜI HẠN</b>\nChỉ bắt đầu tính khi khách dùng key lần đầu.',[
  [this.b('1 ngày · 5k','days:1'),this.b('7 ngày · 20k','days:7')],[this.b('30 ngày · 40k','days:30')],
  ...(id===OWNER?[[this.b('90 ngày','days:90'),this.b('365 ngày','days:365')],[this.b('Nhập số ngày','ask:days')]]:[]),[this.b('Hủy','home','danger')]]);}
 async devices(id){return this.tg.send(id,'<b>02 · SỐ THIẾT BỊ / KEY</b>\nCác máy dùng chung hạn key; thêm máy không gia hạn.',[
  [this.b('1 máy','devices:1'),this.b('2 máy','devices:2'),this.b('3 máy','devices:3')],
  [this.b('5 máy','devices:5'),this.b('10 máy','devices:10'),this.b('50 máy','devices:50')],
  [this.b('Nhập số máy','ask:devices')],[this.b('Hủy','home','danger')]]);}
 async quantity(id){return this.tg.send(id,'<b>03 · SỐ KEY CẦN TẠO</b>',[[this.b('1 key','count:1'),this.b('5 key','count:5'),this.b('10 key','count:10')],[this.b('Nhập số key','ask:count')],[this.b('Hủy','home','danger')]]);}
 async confirmation(id,state){const nonce=crypto.randomBytes(8).toString('hex');await this.state(id,{...state,kind:'confirm',nonce});return this.tg.send(id,'<b>XÁC NHẬN CẤP KEY</b>\n'+state.count+' key · '+state.days+' ngày · '+state.devices+' máy/key\nKey chưa dùng chưa tính giờ.',[[this.b('Tạo ngay','issue:'+nonce,'success','✅'),this.b('Hủy','home','danger','✖️')]]);}
 async list(id,page=0){const items=await this.store.list(id),pages=Math.max(1,Math.ceil(items.length/6));page=Math.min(Math.max(0,page),pages-1);
  const slice=items.slice(page*6,page*6+6),rows=slice.map(x=>[this.b((x.meta.key||x.hash.slice(0,10))+' · '+status(x.record),'view:'+x.hash.slice(0,16))]);
  rows.push([...(page>0?[this.b('Trước','list:'+(page-1))]:[]),...(page+1<pages?[this.b('Sau','list:'+(page+1))]:[])]);
  rows.push([this.b('Menu chính','home')]);return this.tg.send(id,'<b>DANH SÁCH KEY</b>\n'+items.length+' key · Trang '+(page+1)+'/'+pages+'\n'+(items.length?'Chọn một key để quản lý.':'Chưa có key.'),rows.filter(x=>x.length));
 }
 async resolve(id,prefix){if(!/^[a-f0-9]{16}$/.test(prefix))throw Error('invalid_key');const all=await this.store.list(id),hits=all.filter(x=>x.hash.startsWith(prefix));if(hits.length!==1)throw Error('not_found');return hits[0];}
 async details(id,item){
  const p=item.hash.slice(0,16),r=item.record;let text=summary(item)+'\nMã tra cứu: <code>'+item.hash+'</code>';
  const rows=[[this.b(r.enabled?'Khóa key':'Mở key','act:'+(r.enabled?'disable':'enable')+':'+p,r.enabled?'danger':'success')],
   [this.b('Xem Key / mật khẩu','secret:'+p),this.b('Đổi số máy','cap:'+p)],
   [this.b('Danh sách thiết bị','dev:'+p),this.b('Gỡ tất cả máy','confirm:reset:'+p,'danger')],
   [this.b('Xóa key','confirm:delete:'+p,'danger'),this.b('Danh sách','list:0')]];
  return this.tg.send(id,text,rows);
 }
 async handle(update){
  if(!allowed(update)){if(update.callback_query)await this.tg.answer(update.callback_query.id,'Không có quyền');return;}
  const callback=update.callback_query,id=(callback||update.message).from.id;
  if(callback)await this.tg.answer(callback.id);
  try{
   if(!callback){const text=update.message.text||'';
    if(text==='/start'||text==='/menu'||text==='/cancel')return this.home(id);
    if(text==='/id')return this.tg.send(id,'ID: <code>'+id+'</code> · '+role(id));
    if(/^\/check(?:\s+today)?\s*$/i.test(text)){if(id!==OWNER)throw Error('forbidden');return this.sendDaily(vnDay(this.store.clock()),false);}
    const state=await this.store.state(id);
    if(state?.kind==='search'){const item=await this.store.lookup(id,text);if(!item)return this.tg.send(id,'Không tìm thấy key trong phạm vi quản lý.',[[this.b('Menu','home')]]);await this.state(id,null);return this.details(id,item);}
    if(state?.kind==='input'){
     if(!/^\d+$/.test(text.trim()))throw Error('invalid_number');
     const n=integer(text.trim(),1,state.field==='days'?3650:state.field==='count'?10:50);
     if(state.field==='limit'){await this.store.mutate(id,state.hash,'limit',n);await this.state(id,null);return this.details(id,await this.store.snapshot(state.hash,id));}
     const next={...state,kind:'create',[state.field]:n};delete next.field;await this.state(id,next);
     return state.field==='days'?this.devices(id):state.field==='devices'?this.quantity(id):this.confirmation(id,next);
    }
    return this.home(id);
   }
   const data=callback.data||'',parts=data.split(':'),action=parts[0];
   if(data==='home')return this.home(id);if(data==='new')return this.createMenu(id);
   if(data==='report:today'){if(id!==OWNER)throw Error('forbidden');return this.sendDaily(vnDay(this.store.clock()),false);}
   if(data==='expired'){
    const entries=await this.store.expired(id);if(!entries.length)return this.tg.send(id,'Không có key hết hạn trong phạm vi quản lý.',[[this.b('Menu','home')]]);
    const nonce=crypto.randomBytes(6).toString('hex');await this.state(id,{kind:'expired',hashes:entries.map(x=>x.hash),nonce});
    return this.tg.send(id,'<b>XÓA KEY HẾT HẠN</b>\n'+entries.length+' key sẽ được xóa. Key chưa kích hoạt hoặc còn hạn không bị xóa. Lịch sử báo cáo vẫn giữ.',[[this.b('Xác nhận xóa','expired-do:'+nonce,'danger'),this.b('Hủy','home')]]);
   }
   if(action==='expired-do'){
    const state=await this.store.state(id);if(state?.kind!=='expired'||state.nonce!==parts[1])throw Error('expired_state');
    const result=await this.store.deleteExpired(id,state.hashes);await this.state(id,null);return this.tg.send(id,'Đã xóa '+result.deleted+' key hết hạn; bỏ qua '+result.skipped+' key đã thay đổi.',[[this.b('Danh sách','list:0'),this.b('Menu','home')]]);
   }
   if(action==='list')return this.list(id,integer(parts[1],0,1000000));
   if(data==='search'){await this.state(id,{kind:'search'});return this.tg.send(id,'Gửi Key hoặc mã tra cứu 64 ký tự. Không gửi mật khẩu.',[[this.b('Hủy','home','danger')]]);}
   if(data==='stats'){const all=await this.store.list(id),counts={};for(const x of all)counts[status(x.record)]=(counts[status(x.record)]||0)+1;return this.tg.send(id,'<b>THỐNG KÊ</b>\n'+Object.entries(counts).map(([s,n])=>html(s)+': '+n).join('\n')+'\nTổng: '+all.length,[[this.b('Menu','home')]]);}
   if(data==='help')return this.tg.send(id,'<b>HƯỚNG DẪN</b>\n1. Tạo key → chọn ngày, số máy, số lượng → xác nhận.\n2. Giao Key và mật khẩu cho khách.\n3. Key tính giờ từ lần kích hoạt đầu; dùng chung hạn cho các máy.\n4. Khóa, xóa hoặc gỡ máy có hiệu lực ở lần làm mới; proof offline còn tối đa 600 giây.\n\nOwner: '+OWNER+'\nAdmin: '+ADMINS.join(', ')+' (chỉ key tự tạo).\nIcon Premium phụ thuộc quyền bot của Telegram.\n/cancel để hủy thao tác.',[[this.b('Menu','home')]]);
   if(['days','devices','count','ask','issue'].includes(action)){
    const state=await this.store.state(id);if(!state)throw Error('expired_state');
    if(action==='issue'){
     if(state.kind!=='confirm'||parts[1]!==state.nonce)throw Error('expired_state');
     const batch=await this.store.create(id,state,update.update_id);await this.state(id,null);
     for(const [index,c] of batch.entries.entries())await this.tg.send(id,'<b>KEY ĐÃ TẠO · '+(index+1)+'/'+batch.count+'</b>\nKey: <code>'+c.key+'</code>\nMật khẩu: <code>'+c.password+'</code>\n'+batch.days+' ngày từ lần kích hoạt đầu · '+batch.devices+' máy\nMã tra cứu: <code>'+c.hash+'</code>',this.deliveryButtons(c),{forwardable:true});
     await this.flushReports();return;
    }
    if(state.kind!=='create'&&state.kind!=='input')throw Error('expired_state');
    if(action==='ask'){if(!['days','devices','count'].includes(parts[1]))throw Error('invalid_action');if(parts[1]==='days'&&id!==OWNER)throw Error('admin_plan');await this.state(id,{...state,kind:'input',field:parts[1]});return this.tg.send(id,'Nhập số nguyên '+(parts[1]==='days'?'ngày (1–3650)':parts[1]==='devices'?'máy (1–50)':'key (1–10)')+'.',[[this.b('Hủy','home','danger')]]);}
    const n=integer(parts[1],1,action==='days'?3650:action==='count'?10:50);if(action==='days'&&id!==OWNER&&!Object.hasOwn(PRICES,n))throw Error('admin_plan');const next={...state,kind:'create',[action]:n};await this.state(id,next);
    return action==='days'?this.devices(id):action==='devices'?this.quantity(id):this.confirmation(id,next);
   }
   const prefix=['act','confirm','do','rmdev'].includes(action)?parts[2]:parts[1],item=await this.resolve(id,prefix);
   if(action==='view')return this.details(id,item);
   if(action==='secret'){
    if(!item.meta.vault)return this.tg.send(id,'Mật khẩu key cũ chỉ có trên trình duyệt đã tạo; bot không có bản lưu.',[[this.b('Quay lại','view:'+prefix)]]);
    const c=this.store.open(item.meta.vault);return this.tg.send(id,'<b>THÔNG TIN GIAO KHÁCH</b>\nKey: <code>'+html(c.key)+'</code>\nMật khẩu: <code>'+html(c.password)+'</code>\n'+html(status(item.record)),this.deliveryButtons({...c,hash:item.hash}),{forwardable:true});
   }
   if(action==='cap'){await this.state(id,{kind:'input',field:'limit',hash:item.hash});return this.tg.send(id,'Nhập số máy mới (1–50). Không được thấp hơn số máy đang đăng ký.',[[this.b('Hủy','home','danger')]]);}
   if(action==='act'&&['enable','disable'].includes(parts[1])){await this.store.mutate(id,item.hash,parts[1]);return this.details(id,await this.store.snapshot(item.hash,id));}
   if(action==='dev'){
    const devices=Object.entries(item.record.devices||{}),page=Math.min(integer(parts[2]||0,0,100),Math.max(0,Math.ceil(devices.length/8)-1)),slice=devices.slice(page*8,page*8+8);
    const rows=slice.map(([device],n)=>[this.b('Gỡ máy '+(page*8+n+1),'rmdev:'+device.slice(0,12)+':'+prefix,'danger')]);
    rows.push([...(page>0?[this.b('Trước','dev:'+prefix+':'+(page-1))]:[]),...(page*8+8<devices.length?[this.b('Sau','dev:'+prefix+':'+(page+1))]:[])]);
    rows.push([this.b('Quay lại','view:'+prefix)]);
    return this.tg.send(id,'<b>THIẾT BỊ ĐĂNG KÝ</b>\n'+(devices.length?slice.map(([hash,value],n)=>(page*8+n+1)+'. <code>'+hash+'</code>\n'+new Date(value.claimedAt).toISOString()).join('\n'):'Chưa có máy.'),rows.filter(x=>x.length));
   }
   if(action==='rmdev'){
    const hits=Object.keys(item.record.devices||{}).filter(d=>d.startsWith(parts[1]));if(hits.length!==1)throw Error('not_found');await this.store.mutate(id,item.hash,'removeDevice',hits[0]);return this.details(id,await this.store.snapshot(item.hash,id));
   }
   if(action==='confirm'&&['delete','reset'].includes(parts[1])){
    const nonce=crypto.randomBytes(6).toString('hex');await this.state(id,{kind:'destructive',hash:item.hash,action:parts[1],nonce});
    return this.tg.send(id,'<b>XÁC NHẬN '+(parts[1]==='delete'?'XÓA KEY':'GỠ TẤT CẢ MÁY')+'</b>\n'+html(item.meta.key||item.hash)+'\n'+(parts[1]==='delete'?'Key sẽ bị thu hồi.':'Giờ hết hạn của key vẫn giữ nguyên.'),[[this.b('Xác nhận','do:'+parts[1]+':'+prefix+':'+nonce,'danger'),this.b('Hủy','view:'+prefix)]]);
   }
   if(action==='do'){
    const state=await this.store.state(id);if(state?.kind!=='destructive'||state.hash!==item.hash||state.action!==parts[1]||state.nonce!==parts[3])throw Error('expired_state');
    await this.store.mutate(id,item.hash,state.action);await this.state(id,null);return this.tg.send(id,'Đã xử lý. Phiên đã cấp vẫn có thể còn hiệu lực tối đa 600 giây.',[[this.b('Danh sách','list:0')]]);
   }
   throw Error('invalid_action');
  }catch(error){
   const message={admin_plan:'Admin chỉ tạo key 1, 7 hoặc 30 ngày.',invalid_number:'Số nhập không hợp lệ. Hãy nhập lại.',not_found:'Không tìm thấy key hoặc thiết bị.',forbidden:'Bạn không có quyền quản lý key này.',expired_state:'Nút đã hết hạn. Mở menu và thao tác lại.',conflict:'Chưa thay đổi: key không còn tồn tại hoặc số máy thấp hơn số đang dùng.'}[error.message]||'Không hoàn tất. Dữ liệu đã tạo có thể đã lưu; kiểm tra danh sách trước khi tạo lại.';
   await this.tg.send(id,message,[[this.b('Menu','home')]]);
  }
 }
 deliveryButtons(c){return [[this.tg.copyButton('Copy Key',c.key),this.tg.copyButton('Copy mật khẩu',c.password)],[this.tg.copyButton('Copy cả bộ','Key: '+c.key+'\nMật khẩu: '+c.password)],[this.b('Quản lý key','view:'+c.hash.slice(0,16)),this.b('Menu','home')]];}
 async sendDaily(day,scheduled=false){
  const rows=await this.store.sales(day),t=totals(rows),pages=Math.max(1,Math.ceil(rows.length/24)),start=scheduled?await this.store.reportPage(day):0;
  for(let page=start;page<pages;page++){
   const image=await this.renderer(day,rows,page);await this.tg.photo(OWNER,image,reportCaption(day,rows,page,pages));
   if(scheduled)await this.store.sentReportPage(day,page+1);
  }
  if(scheduled)await this.store.completeDaily(day);
 }
 async dailyTick(){for(let n=0;n<3;n++){const day=await this.store.nextReportDay();if(day>=vnDay(this.store.clock()))return;await this.sendDaily(day,true);}}
 async flushReports(){
  for(const [key,event] of Object.entries(await this.store.pendingReports())){
   if(event.actor===OWNER){await this.store.completeReport(key);continue;}
   try{const entries=this.store.open(event.vault);await this.tg.send(OWNER,'<b>ADMIN VỪA TẠO KEY</b>\nAdmin: <code>'+event.actor+'</code>\n'+event.count+' key · '+event.days+' ngày · '+event.devices+' máy/key\n'+entries.map(c=>'Key: <code>'+c.key+'</code>\nMật khẩu: <code>'+c.password+'</code>\nHash: <code>'+c.hash+'</code>').join('\n\n'));await this.store.completeReport(key);}catch{/* Durable outbox retries after the owner has opened /start. */}
  }
 }
}
module.exports={App,status,summary};
