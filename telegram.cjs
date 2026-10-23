'use strict';
const {ICONS,buttonIcon,titleIcon}=require('./icons.cjs');
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
  try{const stickers=await this.call('getCustomEmojiStickers',{custom_emoji_ids:Object.values(ICONS).map(x=>x.id)});
   this.icons={};for(const item of stickers)if(item.custom_emoji_id&&(item.is_animated||item.is_video))this.icons[item.custom_emoji_id]=item.custom_emoji_id;
   this.custom=Object.keys(this.icons).length>0;
  }catch{this.custom=false;}
 }
 button(text,data,style='primary',emoji='⭐'){
  const selected=buttonIcon(data),icon=this.custom&&(this.icons[selected.id]||this.defaultIcon);
  return {text:icon?text:selected.emoji+' '+text,callback_data:data,style,...(icon?{icon_custom_emoji_id:icon}:{})};
 }
 async send(chat,text,rows=[]){
  const icon=titleIcon(text),prefix=this.custom&&this.icons[icon.id]?'<tg-emoji emoji-id="'+icon.id+'">'+icon.emoji+'</tg-emoji>':icon.emoji;
  const decorated=text.startsWith('<b>')?text.replace('<b>','<b>'+prefix+' '):text;
  const body={chat_id:chat,text:decorated,parse_mode:'HTML',protect_content:true,link_preview_options:{is_disabled:true},...(rows.length?{reply_markup:{inline_keyboard:rows}}:{})};
  try{return await this.call('sendMessage',body);}catch(error){
   // Telegram Premium permission is evaluated by Telegram, never assumed locally.
   if(error.code!==400||(!body.text.includes('<tg-emoji ')&&!rows.some(row=>row.some(b=>b.icon_custom_emoji_id))))throw error;
   this.custom=false;body.text=body.text.replace(/<tg-emoji emoji-id="\d+">([^<]*)<\/tg-emoji>/g,'$1');
   if(rows.length)body.reply_markup.inline_keyboard=rows.map(row=>row.map(({icon_custom_emoji_id,...button})=>({...button,text:icon_custom_emoji_id?buttonIcon(button.callback_data).emoji+' '+button.text:button.text})));
   return this.call('sendMessage',body);
  }
 }
 async answer(id,text=''){try{await this.call('answerCallbackQuery',{callback_query_id:id,text});}catch{}}
}
module.exports={Telegram,TelegramError};
