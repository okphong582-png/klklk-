// Pair credential framing shared by browser, Node tests and native menu R14.10.
(function(root){
 'use strict';
 function normalize(key,password){
  if(typeof key!=='string'||typeof password!=='string')throw Error('Cần Key và mật khẩu');key=key.trim().toUpperCase();
  const valid=(s,min,max)=>s.length>=min&&s.length<=max&&/^[!-~]+$/.test(s);
  if(!valid(key,8,128)||!valid(password,16,128)||key===password)throw Error('Key hoặc mật khẩu không hợp lệ');return {key,password};
 }
 function frame(key,password){const c=normalize(key,password);return 'mizze-pair-v1\n'+c.key.length+':'+c.key+'\n'+c.password.length+':'+c.password;}
 const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 async function hash(key,password,cryptoApi=root.crypto){return hex(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(frame(key,password)))));}
 function generate(cryptoApi=root.crypto){const random=n=>{const a=new Uint8Array(n);cryptoApi.getRandomValues(a);return hex(a).toUpperCase();};return {key:'MZ10-'+random(16),password:random(24)};}
 function record(expiresAt,createdAt=Date.now(),maxDevices=1){
  if(!Number.isSafeInteger(expiresAt)||!Number.isSafeInteger(createdAt)||createdAt<=0||expiresAt<=createdAt)throw Error('Thời hạn không hợp lệ');
  if(!Number.isInteger(maxDevices)||maxDevices<1||maxDevices>50)throw Error('Số thiết bị phải từ 1 đến 50');
  return {protocol:9,credentialMode:2,enabled:true,expiresAt,createdAt,maxDevices};
 }
 function pendingRecord(durationMs,createdAt=Date.now(),maxDevices=1){
  if(!Number.isSafeInteger(durationMs)||durationMs<1000||durationMs>3650*86400000)throw Error('Thời lượng không hợp lệ');
  const value=record(createdAt+durationMs,createdAt,maxDevices);
  return {...value,timeMode:'firstUse',durationMs,activatedAt:0,expiresAt:0};
 }
 const api={normalize,frame,hash,generate,record,pendingRecord};if(typeof module==='object'&&module.exports)module.exports=api;else root.MizzeTriple=api;
})(globalThis);
