// 店到店轉換的測試（不連網、不碰 MOMO，fetch 是假的）
// 跑法：node scripts/test-s2s-convert.js
//
// 🔴 最重要的一條是「送的是原門市類型 21/27」：
//    送 21/27 = 直配轉店到店；送 28/29 = **店到店轉回直配**。這支 API 是開關不是冪等操作，
//    送錯方向會把剛轉好的單轉回去（2026-09-02 真的發生過，白轉兩張）。
const fs=require("fs");
const src=fs.readFileSync(require("path").join(__dirname,"..","index.html"),"utf8");
const a=src.indexOf("const S2S_NAME =");
const b=src.indexOf("// 手動按「轉店到店」");
if(a<0||b<0||b<a){console.log("FAIL 找不到區段");process.exit(1)}
let FETCH=null;
global.stApi=()=>"http://api"; global.stTok=()=>"tok";
global.fetch=async(u,o)=>{FETCH={u,body:JSON.parse(o.body)};return RESP};
let RESP;
eval(src.slice(a,b)+"\nglobalThis.RUN=stConvertRun;globalThis.NAME=S2S_NAME;");
let bad=0;const ck=(n,c,x)=>{if(!c){bad++;console.log("FAIL  "+n,x??"")}else console.log("PASS  "+n)};

const rows=[{completeOrderNo:"26090221735633",delyGb:"21",s2sTarget:"28",delyGbName:"7-11"},
            {completeOrderNo:"26090221735634",delyGb:"27",s2sTarget:"29",delyGbName:"全家"}];

(async()=>{
RESP={json:async()=>({ok:true,success:2,failed:0}),status:200};
let r=await RUN(rows,false);
ck("成功回 ok", r.ok&&r.success===2);
ck("送的是原門市類型(21/27) 不是 28/29",
   FETCH.body.items.map(x=>x.delyGb).join()==="21,27", JSON.stringify(FETCH.body.items));
ck("targetMode 送 false", FETCH.body.targetMode===false);
ck("有帶 confirm:YES", FETCH.body.confirm==="YES");

RESP={json:async()=>({ok:false,error:"MOMO 說不行"}),status:200};
r=await RUN(rows,false);
ck("失敗回 ok:false 且帶原因", r.ok===false && r.msg.includes("MOMO 說不行"), JSON.stringify(r));

RESP={json:async()=>{throw new Error("bad json")},status:500};
r=await RUN(rows,false);
ck("後端 500 沒帶原因也要講話", r.ok===false && r.msg.includes("500"), JSON.stringify(r));

global.fetch=async()=>{throw new Error("ECONNREFUSED")};
r=await RUN(rows,false);
ck("連不上要回 ok:false 不是丟例外", r.ok===false && r.msg.includes("連不上"));

ck("代碼對應到店到店名稱", NAME["28"]==="7-11店到店" && NAME["29"]==="全家店到店");
process.exit(bad?1:0);
})();
