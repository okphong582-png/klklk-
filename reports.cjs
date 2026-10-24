'use strict';
const {role}=require('./config.cjs');
const OFFSET=7*3600000,PRICES=Object.freeze({1:5000,7:20000,30:40000});
const vnDay=(now=Date.now())=>new Date(now+OFFSET).toISOString().slice(0,10);
function bounds(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('invalid_day');const start=Date.parse(day+'T00:00:00+07:00');if(!Number.isFinite(start)||vnDay(start)!==day)throw Error('invalid_day');return {start,end:start+86400000};}
const previousDay=day=>vnDay(bounds(day).start-1);
const nextDay=day=>vnDay(bounds(day).end);
const money=n=>Number(n||0).toLocaleString('vi-VN')+' đ';
const xml=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[x]));
function totals(rows){let total=0,unpriced=0;const byAdmin={};for(const row of rows){if(role(row.createdBy)!=='admin')continue;const group=byAdmin[row.createdBy]||(byAdmin[row.createdBy]={keys:0,total:0});group.keys++;if(Number.isSafeInteger(row.priceVnd)&&row.priceVnd>=0){total+=row.priceVnd;group.total+=row.priceVnd;}else unpriced++;}return {keys:rows.filter(r=>role(r.createdBy)==='admin').length,total,unpriced,byAdmin};}
const priced=row=>Number.isSafeInteger(row.priceVnd)&&row.priceVnd>=0;
const dateLabel=day=>{bounds(day);return day.slice(8)+' / '+day.slice(5,7)+' / '+day.slice(0,4);};
function planTotals(rows){return [1,7,30].map(days=>{const entries=rows.filter(row=>role(row.createdBy)==='admin'&&row.days===days);return {days,keys:entries.length,total:entries.reduce((sum,row)=>sum+(priced(row)?row.priceVnd:0),0)};});}
function reportCaption(day,rows,page=0,pages=Math.max(1,Math.ceil(rows.length/24))){
 const t=totals(rows);
 return '<b>📊 MIZZE · TỔNG KẾT CUỐI NGÀY</b>\n'+
  '📅 '+dateLabel(day)+' · UTC+7\n\n'+
  '💰 Owner phải thu: <b>'+money(t.total)+'</b>\n'+
  '🎟 '+t.keys+' key admin · '+Object.keys(t.byAdmin).length+' admin phát sinh\n'+
  planTotals(rows).map(group=>'• '+group.days+' ngày: '+group.keys+' key · '+money(group.total)).join('\n')+
  (t.unpriced?'\n⚠️ '+t.unpriced+' key chưa có giá, chưa cộng vào tiền.':'')+
  '\n\nTrang '+(page+1)+'/'+pages+' · Tính theo key đã tạo\n<i>Chưa xác nhận thanh toán.</i>';
}
function reportSvg(day,all,page=0){
 bounds(day);const pages=Math.max(1,Math.ceil(all.length/24));
 if(!Number.isInteger(page)||page<0||page>=pages)throw Error('invalid_page');
 const rows=all.slice(page*24,page*24+24),t=totals(all),plans=planTotals(all);
 const admins=Object.entries(t.byAdmin).sort((a,b)=>b[1].total-a[1].total||a[0].localeCompare(b[0]));
 const keyLines=row=>String(row.key??'').match(/.{1,48}/gu)||['—'];
 const heights=rows.map(row=>Math.max(58,22+keyLines(row).length*21));
 const adminY=432,adminEnd=adminY+42+Math.max(1,Math.ceil(admins.length/2))*82;
 const tableY=adminEnd+46,bodyY=tableY+74,bodyHeight=rows.length?heights.reduce((a,b)=>a+b,0):106;
 const footer=bodyY+bodyHeight+34,height=footer+138;
 const rect=(x,y,w,h,fill,rx=16,stroke='')=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+'" fill="'+fill+'"'+(stroke?' stroke="'+stroke+'"':'')+'/>';
 const text=(x,y,value,size=18,color='#ebf3f8',weight=400,anchor='start',font='DejaVu Sans,Arial,sans-serif')=>'<text x="'+x+'" y="'+y+'" font-family="'+font+'" font-size="'+size+'" font-weight="'+weight+'" fill="'+color+'" text-anchor="'+anchor+'">'+xml(value)+'</text>';
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="'+height+'" viewBox="0 0 1160 '+height+'"><defs><linearGradient id="hero" x2="1" y2="1"><stop stop-color="#152d36"/><stop offset="1" stop-color="#111b27"/></linearGradient></defs>'+rect(0,0,1160,height,'#0b121b',0);
 svg+=rect(28,24,1104,112,'url(#hero)',22)+rect(48,47,4,62,'#85e8cc',2);
 svg+=text(70,55,'MIZZE  /  KEY OPERATIONS',13,'#88b5b2',700)+text(68,98,'TỔNG KẾT CUỐI NGÀY',32,'#f2f8fa',700);
 svg+=text(1104,65,dateLabel(day),22,'#d4e7e8',700,'end')+text(1104,97,'GIỜ VIỆT NAM · TRANG '+(page+1)+' / '+pages,12,'#8ca7b2',500,'end');
 svg+=rect(28,156,528,132,'#15312f',18,'#285149')+text(52,187,'OWNER PHẢI THU',13,'#9fc8bd',700)+text(52,235,money(t.total),38,'#a2f3ce',700)+text(52,266,'Công nợ theo số key admin đã tạo',14,'#91b7ac');
 svg+=rect(576,156,268,132,'#141f2c')+text(600,187,'KEY ADMIN',13,'#8fa5bb',700)+text(600,235,t.keys,38,'#f0f5fb',700)+text(600,266,'Không gồm key owner tạo',13,'#8398ae');
 svg+=rect(864,156,268,132,'#141f2c')+text(888,187,'ADMIN PHÁT SINH',13,'#8fa5bb',700)+text(888,235,admins.length,38,'#f0f5fb',700)+text(888,266,t.unpriced?t.unpriced+' key chưa có giá':'Đã tổng hợp theo admin',13,t.unpriced?'#eac58b':'#8398ae');
 svg+=text(28,328,'CƠ CẤU GÓI KEY',14,'#a7bdcb',700);
 plans.forEach((group,index)=>{const x=28+index*374;svg+=rect(x,346,356,62,'#111f2a',12)+rect(x+14,359,71,34,'#20333b',9)+text(x+49,382,group.days+' NGÀY',12,'#b5ddd3',700,'middle')+text(x+100,372,group.keys+' key',16,'#e3eef4',700)+text(x+100,394,money(group.total),14,'#8fa8b9');});
 svg+=text(28,adminY+17,'TỔNG HỢP THEO ADMIN',14,'#a7bdcb',700)+text(1132,adminY+17,'Số liệu của cả ngày',12,'#6d879c',400,'end');
 admins.forEach(([id,group],index)=>{const x=28+(index%2)*562,y=adminY+36+Math.floor(index/2)*82;svg+=rect(x,y,542,68,'#131f2c',13)+rect(x+15,y+15,38,38,'#27313e',11)+text(x+34,y+40,String(index+1).padStart(2,'0'),14,'#d9c18f',700,'middle')+text(x+67,y+28,'ADMIN · '+id,15,'#d9e6ef',700)+text(x+67,y+50,group.keys+' key đã tạo',13,'#819aaf')+text(x+522,y+41,money(group.total),21,'#b6e6cf',700,'end');});
 if(!admins.length)svg+=rect(28,adminY+36,1104,68,'#131f2c',13)+text(52,adminY+77,'Chưa có phát sinh từ admin trong ngày này.',17,'#8ea9ba');
 svg+=text(28,tableY+17,'CHI TIẾT KEY',14,'#a7bdcb',700)+text(1132,tableY+17,rows.length+' / '+all.length+' key · Trang '+(page+1)+'/'+pages,12,'#6d879c',400,'end');
 svg+=rect(28,tableY+35,1104,38,'#1c2938',8)+text(48,tableY+60,'KEY',12,'#95acbc',700)+text(590,tableY+60,'ADMIN',12,'#95acbc',700)+text(780,tableY+60,'GÓI',12,'#95acbc',700)+text(895,tableY+60,'GIỜ TẠO',12,'#95acbc',700)+text(1110,tableY+60,'THÀNH TIỀN',12,'#95acbc',700,'end');
 let y=bodyY;
 rows.forEach((row,index)=>{const h=heights[index],stamp=new Date(Number(row.createdAt)+OFFSET),time=Number.isFinite(stamp.getTime())?stamp.toISOString().slice(11,16):'--:--';
  svg+=rect(28,y,1104,h-2,index%2?'#0f1a26':'#14212f',7);
  keyLines(row).forEach((line,lineIndex)=>{svg+=text(48,y+26+lineIndex*21,line,16,'#d9e8f0',400,'start','DejaVu Sans Mono,monospace');});
  svg+=text(590,y+33,row.createdBy,14,'#91a9bc')+text(780,y+33,row.days+' ngày',14,'#aac2ce')+text(907,y+33,time,14,'#91a9bc')+text(1110,y+33,priced(row)?money(row.priceVnd):'Chưa đặt giá',16,priced(row)?'#a0dfc2':'#edc186',600,'end');y+=h;
 });
 if(!rows.length)svg+=rect(28,bodyY,1104,106,'#121f2c',12)+text(580,bodyY+43,'CHƯA CÓ KEY ADMIN',20,'#b8ced9',700,'middle')+text(580,bodyY+75,'Không có key admin tạo trong ngày.',15,'#7c99ad',400,'middle');
 svg+=rect(28,footer,1104,56,'#172b2c',12)+text(48,footer+35,'TỔNG OWNER PHẢI THU',14,'#b5d8c7',700)+text(1110,footer+37,money(t.total),26,'#b4f0cf',700,'end');
 svg+=text(28,footer+88,'Tính theo key đã tạo, không theo lượt kích hoạt · Chưa xác nhận thanh toán.',13,'#7e96a9');
 svg+=text(28,footer+112,'Key bị xóa vẫn giữ trong lịch sử.'+(t.unpriced?' '+t.unpriced+' key chưa có giá chưa được cộng vào tổng tiền.':''),13,t.unpriced?'#d4b78c':'#7e96a9')+text(1132,footer+112,'MIZZE · PRIVATE REPORT',11,'#577588',600,'end');
 return Buffer.from(svg+'</svg>');
}
async function renderReport(day,rows,page=0){return require('sharp')(reportSvg(day,rows,page)).png({compressionLevel:9}).toBuffer();}
module.exports={PRICES,vnDay,bounds,previousDay,nextDay,totals,money,planTotals,reportCaption,reportSvg,renderReport};
