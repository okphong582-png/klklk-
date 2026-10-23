'use strict';
const OWNER=6482147126,ADMIN=7567932286,PROJECT='vghgfhf-7000b';
function role(id){return id===OWNER?'owner':id===ADMIN?'admin':null;}
function allowed(update){
 const event=update.callback_query||update.message,from=event?.from,chat=update.callback_query?event.message?.chat:event?.chat;
 return !!(role(from?.id)&&chat?.type==='private'&&chat.id===from.id&&!from.is_bot);
}
const path=/^[a-f0-9]{64}$/;
const html=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function integer(value,min,max){const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('invalid_number');return n;}
module.exports={OWNER,ADMIN,PROJECT,role,allowed,path,html,integer};
