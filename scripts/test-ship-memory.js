// 託運單匯出的「才數＋備註記憶」測試（純函式，不連網、不碰 Firebase）
// 跑法：node scripts/test-ship-memory.js
const fs=require("fs"),path=require("path");
const src=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const a=src.indexOf("function _fbKey(s)");
const b=src.indexOf("async function batchExportShipping()");
if(a<0||b<0||b<a){console.log("FAIL 找不到區段");process.exit(1)}
let MEM={};
global.db={ref:()=>({once:async()=>({val:()=>MEM})})};
eval(src.slice(a,b)+"\nglobalThis.K=sizeKeysFor;globalThis.G=groupForShipping;globalThis.L=lookupSize;globalThis.GM=guessModel;globalThis.FK=_fbKey;");
let bad=0;const ck=(n,c,x)=>{if(!c){bad++;console.log("FAIL  "+n,x??"")}else console.log("PASS  "+n)};

// ---- 鑰匙 ----
ck("MOMO 用商品編號", K({platform:"MO",goodsCode:"11432125",product:"弦"})[0]==="MO:11432125");
ck("PChome 用 prodId", K({platform:"PC",prodId:"DEBJ-AAA-000",product:"琴"})[0]==="PC:DEBJ-AAA-000");
ck("沒編號退回品名", K({platform:"ST",product:"店內琴"})[0]==="N:店內琴");
ck("Firebase 非法字元換掉", FK("A/B.C#D$E[F]G")==="A~B~C~D~E~F~G");

// ---- 型號建議：猜得到的 ----
ck("MG-300 猜得到", GM("【NUX】MG-300 MKII 電吉他綜合效果器 贈導線")==="MG-300");
ck("FG830 猜得到", GM("【YAMAHA】FG830 民謠吉他")==="FG830");
ck("分開寫的 FG 830 也行", GM("YAMAHA FG 830 民謠吉他")==="FG 830");
ck("保留原本大小寫", GM("NUX Mighty 40 音箱")==="Mighty 40");
ck("FP-30X 猜得到", GM("【Roland】FP-30X 電鋼琴 黑色")==="FP-30X");

// ---- 型號建議：猜不到就要誠實回空字串，不可以亂猜 ----
ck("純英文型號不猜（ELIXIR Optiweb）", GM("【ELIXIR】Optiweb NICKEL PLATED STEEL 鍍鎳鋼電吉他包膜弦(原廠公司貨)")==="");
ck("太短的 M1 不猜", GM("aNueNue M1 旅行吉他")==="");
ck("純中文不猜", GM("吉他架 折疊式")==="");
ck("MKII 這種規格字不會被當型號", GM("電吉他 MKII 版")==="");

// ---- 記憶帶出 ----
MEM={"MO:11432125":{cai:3,qty:1,name:"弦",note:"Optiweb 10-46"}};
ck("備註帶得出來", L({platform:"MO",goodsCode:"11432125",product:"弦"},MEM).note==="Optiweb 10-46");
const g=G([{id:"a",platform:"MO",goodsCode:"11432125",product:"【ELIXIR】Optiweb 電吉他弦",qty:2},
           {id:"b",platform:"MO",goodsCode:"11432125",product:"【ELIXIR】Optiweb 電吉他弦",qty:1},
           {id:"c",platform:"ST",product:"【Roland】FP-30X 電鋼琴",qty:1}],MEM);
ck("同商品收斂成一列", g.length===2);
ck("件數加總", g.find(r=>r.key==="MO:11432125").qty===3);
ck("有備註記憶的帶出來", g.find(r=>r.key==="MO:11432125").mem.note==="Optiweb 10-46");
const fp=g.find(r=>r.key.indexOf("FP-30X")>=0||r.name.indexOf("FP-30X")>=0);
ck("沒記憶的給型號建議", fp && fp.guess==="FP-30X", fp&&fp.guess);
ck("沒記憶的 mem 是 null", fp && fp.mem===null);
process.exit(bad?1:0);
