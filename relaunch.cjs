'use strict';
const {relaunch}=require('./runner.cjs');
relaunch({token:process.env.GITHUB_TOKEN,repository:process.env.GITHUB_REPOSITORY}).then(()=>console.log('Next bot workflow dispatched.')).catch(()=>{console.error('Could not dispatch next worker; scheduled watchdog will retry. No credentials logged.');process.exitCode=1;});
