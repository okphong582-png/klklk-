'use strict';
const {integer}=require('./config.cjs');
function plan(value){
 const {days,hours}=value;
 if(hours!==undefined&&hours!==0){integer(hours,1,8760);if(days!==undefined&&days!==0)throw Error('invalid_number');return {days:0,hours,durationMs:hours*3600000};}
 integer(days,1,3650);return {days,hours:0,durationMs:days*86400000};
}
function durationLabel(ms){if(Number.isSafeInteger(ms)&&ms>0&&ms<86400000&&ms%3600000===0)return ms/3600000+' giờ';if(Number.isSafeInteger(ms)&&ms%86400000===0)return ms/86400000+' ngày';return Math.floor(ms/60000)+' phút';}
const planLabel=value=>{const p=plan(value);return p.hours?p.hours+' giờ':durationLabel(p.durationMs);};
module.exports={plan,planLabel,durationLabel};
