// 有貨／缺貨標籤的邏輯測試（不連網、不開瀏覽器）
// 跑法：node scripts/test-stock-badge.js
//
// 重點：
//  - 同一台被好幾張單搶：照下單先後分，先下的有貨、後下的缺貨
//  - 已出貨但還沒按已完成（還沒扣）的單先佔庫存
//  - 已扣過庫存、廠商出、選過「不用扣」的不算
//  - 同型號店內／倉庫兩筆合起來算
//  - 補貨中的單有貨了要變「到貨了」並出現在缺貨篩選裡
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const a = src.indexOf("/* ===== 有貨／缺貨標籤");
const b = src.indexOf("/* 補貨中提示（杰哥 2026-09-09）");
const k = src.indexOf("const invNorm=");
if (a < 0 || b < 0 || k < 0 || b < a) { console.log("FAIL 找不到區段"); process.exit(1); }
const invPart = src.slice(k, src.indexOf("function invItemLabel", k));

global.INV_LIVE_DATE = "2026-10-11";
global.esc = s => String(s == null ? "" : s);
global.cSpecial = null;
global.authReady = Promise.resolve(true);
global.orders = [];
eval(invPart + src.slice(a, b) +
  "\nglobalThis.SET=(items,map)=>{_stkItems=items;_stkById={};_stkSib={};for(const it of items){_stkById[it.id]=it;const k=(it.b||'')+'|'+(it.n||'');(_stkSib[k]=_stkSib[k]||[]).push(it.id)}_stkIdx=stkBuildIndex(items);_stkMap=map;_stkSig=''};" +
  "\nglobalThis.stkOf=stkOf;globalThis.stockBadge=stockBadge;globalThis.isStockAction=isStockAction;globalThis.invKey=invKey;globalThis.invKeyText=invKeyText;");

let bad = 0;
const ck = (n, c, x) => { if (!c) { bad++; console.log("FAIL  " + n, x ?? ""); } else console.log("PASS  " + n); };
const kind = o => (stkOf(o) || {}).k;

const items = [
  { id: "s1", b: "Yamaha", n: "YDP-S56 WH", q: 1, z: "倉庫" },
  { id: "s2", b: "Yamaha", n: "YDP-S56 BK", q: 0, z: "倉庫" },
  { id: "p1", b: "Yamaha", n: "P-225 BK", q: 0, z: "店內" },
  { id: "p2", b: "Yamaha", n: "P-225 BK", q: 2, z: "倉庫" },
  { id: "y1", b: "Yamaha", n: "YDP-105", q: 3, z: "倉庫" },
  { id: "t1", b: "Yamaha", n: "THR10 II", q: 0, z: "店內" },
  { id: "x1", b: "Elixir", n: "Nano 10-47", q: 5, z: "店內" },
];
const O = (id, date, status, product, specs = "", extra = {}) => ({ id, date, status, product, specs, qty: 1, platform: "MO", ...extra });
global.orders = [
  O("a", "2026-11-05", "未確認", "【Yamaha】YDP-S56 88鍵 白色", "白色"),
  O("b", "2026-11-03", "已確認", "【Yamaha】YDP-S56 88鍵", "白色"),
  O("c", "2026-11-06", "交涉中", "Yamaha P-225 單主機 黑"),          // 店內 0 + 倉庫 2 → 有貨
  O("d", "2026-11-09", "要安裝", "Arius YDP105R 深玫瑰木"),           // 型號尾巴黏 R
  O("e", "2026-11-10", "未確認", "NUX DM-210 電子鼓"),                // 庫存沒建
  O("f", "2026-11-01", "店補貨", "THR10II"),                         // 庫存 0 → 缺貨
  O("g", "2026-11-10", "已出貨", "YDP-S56 白", "白色"),               // 已出貨沒扣 → 先佔 S56 WH
  O("h", "2026-11-10", "已完成", "YDP-S56 白", "白色"),               // 已完成不算
  O("i", "2026-11-10", "廠商出", "YDP-S56 白", "白色"),               // 廠商出不算
  O("j", "2026-11-10", "未確認", "隨便的服務費 ABC123"),
  O("k", "2026-11-10", "已確認", "Elixir 弦 兩包優惠", "", { goodsCode: "999" }),
];
// 記住的對照：k 單一張扣 2 包；j 選過不用扣
const map = {};
map[invKey(orders.find(o => o.id === "k"))] = { txt: invKeyText(orders.find(o => o.id === "k")), lines: [{ iid: "x1", per: 2 }] };
map[invKey(orders.find(o => o.id === "j"))] = { txt: invKeyText(orders.find(o => o.id === "j")), skip: true };
SET(items, map);

ck("已出貨沒扣的先佔掉唯一一台 → 先下單的 b 也缺貨", kind(orders[1]) === "short", kind(orders[1]));
ck("後下單的 a 缺貨", kind(orders[0]) === "short");
ck("已出貨的單本身不掛標籤", stkOf(orders[6]) === null);
ck("店內 0＋倉庫 2 合起來算有貨", kind(orders[2]) === "ok", stockBadge(orders[2]));
ck("YDP105R 對得到 YDP-105", kind(orders[3]) === "ok", stockBadge(orders[3]));
ck("庫存沒建的顯示灰標", kind(orders[4]) === "none" && stockBadge(orders[4]).includes("庫存沒建"));
ck("店補貨又沒貨 → 缺貨", kind(orders[5]) === "short");
ck("選過不用扣的不掛標籤", stockBadge(orders[9]) === "");
ck("記住的對照照每單扣數算（5 包、要 2）", kind(orders[10]) === "ok" && stockBadge(orders[10]).includes("再剩3"), stockBadge(orders[10]));
ck("缺貨篩選只含缺貨的", ["a", "b", "f"].every(id => isStockAction(orders.find(o => o.id === id))) && orders.filter(isStockAction).length === 3);

// 進貨：S56 WH 變 3 台 → g 佔 1、b 拿 1、a 拿 1，全部有貨；THR10 II 進 1 台 → 補貨中的 f 變「到貨了」
items[0].q = 3; items[5].q = 1; SET(items, map);
ck("進貨後先下單的有貨", kind(orders[1]) === "ok");
ck("進貨後後下單的也有貨", kind(orders[0]) === "ok");
ck("補貨中的單有貨了 → 到貨了", kind(orders[5]) === "ok" && stockBadge(orders[5]).includes("到貨了"));
ck("到貨了的補貨單出現在缺貨篩選", isStockAction(orders[5]) && orders.filter(isStockAction).length === 1);

// 只剩 2 台、3 張單搶（g 已出貨佔 1）→ 最晚下的 a 缺貨，而且寫「被前面單佔走」
items[0].q = 2; SET(items, map);
ck("2 台 3 張單：最早的 b 有貨", kind(orders[1]) === "ok");
ck("2 台 3 張單：最晚的 a 缺貨，寫被前面單佔走", kind(orders[0]) === "short" && stockBadge(orders[0]).includes("被前面單佔走"), stockBadge(orders[0]));

// 扣過庫存的已出貨單不再佔（g 扣過了）
orders[6].invDeducted = true; SET(items, map);
ck("扣過的已出貨單不再佔庫存 → a 也有貨", kind(orders[0]) === "ok");

console.log(bad ? `\n${bad} 個失敗` : "\n全部通過");
process.exit(bad ? 1 : 0);
