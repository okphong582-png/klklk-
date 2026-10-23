'use strict';
class TelegramError extends Error{constructor(code,retry){super('telegram_'+code);this.code=code;this.retry=retry;}}
class Telegram{
 constructor(token,fetcher=fetch){if(!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token))throw Error('invalid_bot_token');this.token=token;this.fetcher=fetcher;this.icons={};this.custom=true;}
 async call(method,body={}){
  let response;try{response=await this.fetcher('https://api.telegram.org/bot'+this.token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(method==='getUpdates'?45000:12000)});}catch{throw new TelegramError('network');}
  let value;try{value=await response.json();}catch{throw new TelegramError('invalid_response');}
  if(!response.ok||!value.ok)throw new TelegramError(value.error_code||response.status,value.parameters?.retry_after);
  return value.result;
 }
 async decorate(){
  try{const stickers=await this.call('getForumTopicIconStickers');for(const item of stickers)if(item.custom_emoji_id&&item.emoji&&!this.icons[item.emoji])this.icons[item.emoji]=item.custom_emoji_id;
   this.defaultIcon=stickers.find(x=>x.custom_emoji_id)?.custom_emoji_id;
  }catch{this.custom=false;}
 }
 button(text,data,style='primary',emoji='⭐'){
  const icon=this.custom&&(this.icons[emoji]||this.defaultIcon);
  return {text:icon?text:emoji+' '+text,callback_data:data,style,...(icon?{icon_custom_emoji_id:icon}:{})};
 }
 async send(chat,text,rows=[]){
  const body={chat_id:chat,text,parse_mode:'HTML',protect_content:true,link_preview_options:{is_disabled:true},...(rows.length?{reply_markup:{inline_keyboard:rows}}:{})};
  try{return await this.call('sendMessage',body);}catch(error){
   // Telegram Premium permission is evaluated by Telegram, never assumed locally.
   if(error.code!==400||!rows.some(row=>row.some(b=>b.icon_custom_emoji_id)))throw error;
   this.custom=false;body.reply_markup.inline_keyboard=rows.map(row=>row.map(({icon_custom_emoji_id,...button})=>button));
   return this.call('sendMessage',body);
  }
 }
 async answer(id,text=''){try{await this.call('answerCallbackQuery',{callback_query_id:id,text});}catch{}}
}
module.exports={Telegram,TelegramError};
