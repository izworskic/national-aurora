"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const html=fs.readFileSync("public/national-tools/aurora/index.html","utf8");
const fn=html.match(/function auroraPacketCurrent\(d,now=Date\.now\(\)\)\{[\s\S]*?\n \}/);
assert.ok(fn);
const current=vm.runInNewContext("("+fn[0]+")");
const now=Date.parse("2026-11-28T02:00:00Z"),at=(ms)=>new Date(now+ms).toISOString();
test("only bounded retrieved packets and dated OVATION signals are admissible",()=>{
 const d={retrieved_at:at(-300000),local_signal:{ovation_value:0,ovation_forecast_at:at(600000)}};
 assert.equal(current(d,now),true);
 for(const retrieved_at of [null,"bad",at(-1200001),at(60001)])assert.equal(current({...d,retrieved_at},now),false);
 for(const ovation_forecast_at of [null,"bad",at(-7200001),at(7200001)])assert.equal(current({...d,local_signal:{ovation_value:99,ovation_forecast_at}},now),false);
 assert.equal(current({...d,local_signal:{ovation_value:null,ovation_forecast_at:null}},now),true);
 assert.ok(html.indexOf("if(!auroraPacketCurrent(d))throw")<html.indexOf('document.getElementById("result").hidden=false'));
});
