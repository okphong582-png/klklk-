'use strict';
// Animated custom emoji verified with Telegram's getForumTopicIconStickers.
// Public sticker IDs, not credentials. Startup revalidates animation metadata.
const ICONS={
 crown:{emoji:'👑',id:'5357107601584693888'},
 star:{emoji:'⭐️',id:'5235579393115438657'},
 gem:{emoji:'💎',id:'5309958691854754293'},
 bolt:{emoji:'⚡️',id:'5312016608254762256'},
 folder:{emoji:'📁',id:'5357315181649076022'},
 search:{emoji:'🔎',id:'5309965701241379366'},
 chart:{emoji:'📈',id:'5350305691942788490'},
 calendar:{emoji:'📆',id:'5433614043006903194'},
 phone:{emoji:'📱',id:'5409357944619802453'},
 ticket:{emoji:'🎟',id:'5377624166436445368'},
 check:{emoji:'✅',id:'5237699328843200968'},
 alert:{emoji:'❗️',id:'5379748062124056162'},
 home:{emoji:'🏠',id:'5312486108309757006'},
 eye:{emoji:'👀',id:'5357121491508928442'},
 edit:{emoji:'✍️',id:'5238156910363950406'},
 clean:{emoji:'🧼',id:'5377468357907849200'},
 party:{emoji:'🎉',id:'5310228579009699834'},
 announce:{emoji:'📣',id:'5309984423003823246'}
};
const ACTION={new:'bolt',list:'folder',view:'star',search:'search',stats:'chart',help:'gem',days:'calendar',devices:'phone',count:'ticket',ask:'edit',issue:'check',home:'home',secret:'eye',cap:'phone',dev:'phone',act:'alert',confirm:'alert',do:'check',rmdev:'clean'};
function buttonIcon(data){return ICONS[ACTION[String(data).split(':')[0]]||'star'];}
function titleIcon(text){
 if(text.startsWith('<b>MIZZE'))return ICONS.crown;
 if(text.startsWith('<b>ADMIN VỪA'))return ICONS.announce;
 if(text.startsWith('<b>KEY ĐÃ TẠO'))return ICONS.party;
 if(text.startsWith('<b>XÁC NHẬN'))return ICONS.check;
 if(text.startsWith('<b>THỐNG KÊ'))return ICONS.chart;
 if(text.startsWith('<b>HƯỚNG DẪN'))return ICONS.gem;
 if(text.startsWith('<b>01'))return ICONS.calendar;
 if(text.startsWith('<b>02')||text.startsWith('<b>THIẾT BỊ'))return ICONS.phone;
 if(text.startsWith('<b>03'))return ICONS.ticket;
 if(text.startsWith('<b>THÔNG TIN GIAO'))return ICONS.eye;
 return ICONS.folder;
}
module.exports={ICONS,buttonIcon,titleIcon};
