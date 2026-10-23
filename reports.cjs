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
function reportSvg(day,all,page=0){
 const rows=all.slice(page*24,page*24+24),pages=Math.max(1,Math.ceil(all.length/24)),t=totals(all),height=370+Math.max(1,rows.length)*48+Object.keys(t.byAdmin).length*28;
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="'+height+'"><rect width="1160" height="'+height+'" fill="#0b1020"/><rect x="28" y="24" width="1104" height="124" rx="22" fill="#172036"/><g font-family="DejaVu Sans,Arial,sans-serif">';
 svg+='<text x="52" y="66" font-size="25" font-weight="700" fill="#e7c879">MIZZE · BÁO CÁO KEY ADMIN</text><text x="52" y="100" font-size="17" fill="#aebed5">Ngày '+xml(day)+' · Giờ Việt Nam (UTC+7) · Trang '+(page+1)+'/'+pages+'</text>';
 svg+='<text x="52" y="128" font-size="15" fill="#aebed5">1 ngày: 5.000đ   ·   7 ngày: 20.000đ   ·   30 ngày: 40.000đ</text>';
 svg+='<text x="48" y="192" font-size="15" fill="#91a3c3">KEY</text><text x="590" y="192" font-size="15" fill="#91a3c3">ADMIN</text><text x="775" y="192" font-size="15" fill="#91a3c3">GÓI</text><text x="880" y="192" font-size="15" fill="#91a3c3">GIỜ TẠO</text><text x="1110" y="192" text-anchor="end" font-size="15" fill="#91a3c3">THÀNH TIỀN</text>';
 for(const [i,row] of rows.entries()){
  const y=212+i*48,time=new Date(row.createdAt+OFFSET).toISOString().slice(11,16);
  svg+='<rect x="30" y="'+y+'" width="1100" height="44" rx="9" fill="'+(i%2?'#111a2d':'#162139')+'"/><text x="47" y="'+(y+28)+'" font-size="16" fill="#e6edf7">'+xml(row.key)+'</text><text x="590" y="'+(y+28)+'" font-size="15" fill="#c5d1e5">'+row.createdBy+'</text><text x="775" y="'+(y+28)+'" font-size="15" fill="#c5d1e5">'+row.days+' ngày</text><text x="888" y="'+(y+28)+'" font-size="15" fill="#c5d1e5">'+time+'</text><text x="1110" y="'+(y+28)+'" text-anchor="end" font-size="16" fill="#88efbc">'+xml(Number.isSafeInteger(row.priceVnd)&&row.priceVnd>=0?money(row.priceVnd):'Chưa đặt giá')+'</text>';
 }
 if(!rows.length)svg+='<text x="50" y="243" font-size="19" fill="#aebed5">Không có key admin tạo trong ngày.</text>';
 const footer=230+Math.max(1,rows.length)*48;
 svg+='<text x="48" y="'+footer+'" font-size="21" font-weight="700" fill="#f1d083">TỔNG OWNER PHẢI THU: '+xml(money(t.total))+' · '+t.keys+' key</text>';
 let n=0;for(const [id,group] of Object.entries(t.byAdmin))svg+='<text x="48" y="'+(footer+32+(n++)*28)+'" font-size="16" fill="#bdcce3">Admin '+id+': '+group.keys+' key · '+xml(money(group.total))+'</text>';
 svg+='<text x="48" y="'+(height-44)+'" font-size="14" fill="#7f92b0">Tính theo key đã tạo, không theo lượt kích hoạt; chưa xác nhận thanh toán.</text><text x="48" y="'+(height-20)+'" font-size="13" fill="#7f92b0">Key bị xóa vẫn được lưu trong lịch sử báo cáo.'+(t.unpriced?' Có '+t.unpriced+' key cũ chưa có giá.':'')+'</text></g></svg>';
 return Buffer.from(svg);
}
async function renderReport(day,rows,page=0){return require('sharp')(reportSvg(day,rows,page)).png({compressionLevel:9}).toBuffer();}
module.exports={PRICES,vnDay,bounds,previousDay,nextDay,totals,money,reportSvg,renderReport};
