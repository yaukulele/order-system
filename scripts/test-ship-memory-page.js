// 才數／備註 記憶管理頁的邏輯測試（不連網、不開瀏覽器）
// 跑法：node scripts/test-ship-memory-page.js
//
// 重點：
//  - 一個商品有兩把鑰匙（平台編號＋品名），畫面上一定要用品名收斂成一列，
//    不然改了一行另一行還是舊的
//  - 「還沒填」要依出過幾次由多到少排（先填常出的最划算）
//  - 本來沒填、現在也沒填的不可以寫一筆空的進資料庫
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const a = src.indexOf("function _fbKey(s)");
const b = src.indexOf("let _shipExportGroups=null;");
if (a < 0 || b < 0 || b < a) { console.log("FAIL 找不到區段"); process.exit(1); }

let MEM = {};
let SAVED = null;
global.db = { ref: () => ({ once: async () => ({ val: () => MEM }), update: async (u) => { SAVED = u; } }) };
global.authReady = Promise.resolve(true);
global.currentUser = "測試員";
global.esc = s => String(s == null ? "" : s);
const els = {};
global.document = {
  getElementById: id => els[id] || null,
  querySelectorAll: () => [],
};
global.orders = [];
global.confirm = () => true;

eval(src.slice(a, b) +
  "\nglobalThis.OPEN=openShipMemory;globalThis.ROWS=memRows;globalThis.SAVE=saveShipMemory;" +
  "\nglobalThis.setTab=t=>{_memTab=t};globalThis.getGroups=()=>_memGroups;");

let bad = 0;
const ck = (n, c, x) => { if (!c) { bad++; console.log("FAIL  " + n, x ?? ""); } else console.log("PASS  " + n); };

// renderShipMemory 需要 modal-body，給它一個假的
els["modal-body"] = { innerHTML: "" };
els["modal-overlay"] = { classList: { remove() {}, add() {} } };
global.document.body = { style: {} };

(async () => {
  // 出過貨的商品：吉他 3 次、烏克 1 次；其中吉他已經填過才數
  global.orders = [
    { id: "1", platform: "MO", goodsCode: "13081408", product: "【Veelah】V1-OMC 面單吉他", qty: 1, date: "2026-09-01" },
    { id: "2", platform: "MO", goodsCode: "13081408", product: "【Veelah】V1-OMC 面單吉他", qty: 1, date: "2026-09-10" },
    { id: "3", platform: "MO", goodsCode: "13081408", product: "【Veelah】V1-OMC 面單吉他", qty: 1, date: "2026-09-21" },
    { id: "4", platform: "PC", prodId: "DEBJ-U2-000", product: "aNueNue U2 23吋 烏克麗麗", qty: 1, date: "2026-09-19" },
    { id: "5", platform: "ST", product: "店內補寄 AG10 弦", qty: 1, date: "2026-09-21" },
  ];
  MEM = {
    "MO:13081408": { cai: 3, qty: 1, name: "【Veelah】V1-OMC 面單吉他", note: "V1OMC", at: "2026-09-21T00:00:00.000Z", by: "回填" },
    "N:【Veelah】V1-OMC 面單吉他": { cai: 3, qty: 1, name: "【Veelah】V1-OMC 面單吉他", note: "V1OMC", at: "2026-09-21T00:00:00.000Z", by: "回填" },
  };

  await OPEN();
  const g = getGroups();
  ck("兩把鑰匙收斂成一列", g.filter(r => r.name.includes("V1-OMC")).length === 1);
  const guitar = g.find(r => r.name.includes("V1-OMC"));
  ck("已填的帶得出才數與備註", guitar.cai === 3 && guitar.note === "V1OMC");
  ck("已填的標成 saved", guitar.saved === true);
  ck("出貨次數算得對", guitar.cnt === 3, guitar.cnt);
  ck("最近出貨日對", guitar.last === "2026-09-21", guitar.last);
  ck("兩把鑰匙都留著", guitar.keys.length === 2, guitar.keys);

  const uku = g.find(r => r.name.includes("U2"));
  ck("沒填過的也列進來", !!uku && uku.saved === false);
  ck("沒填過的才數是空的", uku.cai == null && uku.note === "");
  ck("店內單也列得出來", !!g.find(r => r.name.includes("AG10")));

  els["mem-q"] = { value: "" };
  setTab("todo");
  let rows = ROWS();
  ck("還沒填那疊不含已填的", !rows.some(r => r.saved));
  setTab("done");
  ck("已填那疊只有已填的", ROWS().every(r => r.saved) && ROWS().length === 1);
  setTab("all");
  ck("全部＝三種商品", ROWS().length === 3, ROWS().length);

  // 排序：出過次數多的要在前面
  global.orders.push({ id: "6", platform: "PC", prodId: "DEBJ-U2-000", product: "aNueNue U2 23吋 烏克麗麗", qty: 1, date: "2026-09-20" });
  global.orders.push({ id: "7", platform: "PC", prodId: "DEBJ-U2-000", product: "aNueNue U2 23吋 烏克麗麗", qty: 1, date: "2026-09-20" });
  await OPEN();
  setTab("todo");
  rows = ROWS();
  ck("還沒填的照出貨次數由多到少排", rows[0].name.includes("U2") && rows[0].cnt === 3, rows.map(r => r.name + ":" + r.cnt));

  // 存檔：沒動的不寫、空白的不寫
  SAVED = null;
  els["mem-q"] = { value: "" };
  setTab("all");
  const gg = getGroups();
  gg.forEach((r, i) => { els["mcai_" + i] = { value: r.cai == null ? "" : String(r.cai), focus() {} };
                         els["mnote_" + i] = { value: r.note || "" }; });
  els["mem-msg"] = { textContent: "", style: {} };
  await SAVE();
  ck("什麼都沒改就不寫資料庫", SAVED === null);

  // 只填烏克的才數
  const ui = gg.findIndex(r => r.name.includes("U2"));
  els["mcai_" + ui].value = "1"; els["mnote_" + ui].value = "U2";
  await SAVE();
  ck("只寫有改的那一筆", SAVED && Object.keys(SAVED).length === 2, SAVED && Object.keys(SAVED));
  ck("兩把鑰匙一起寫", SAVED && Object.keys(SAVED).some(k => k.startsWith("PC:")) && Object.keys(SAVED).some(k => k.startsWith("N:")));
  const one = SAVED[Object.keys(SAVED)[0]];
  ck("寫進去的值對", one.cai === 1 && one.note === "U2");
  ck("備註不含平台抬頭", !String(one.note).startsWith("PC_") && !String(one.note).startsWith("MO_"));
  ck("存完變成已填", gg[ui].saved === true);

  // 🔴 型號建議鈕：型號絕對不可以直接寫進 onclick 屬性
  //    之前用 JSON.stringify 嵌進去，它吐出來的雙引號把屬性切斷 → 按下去 SyntaxError
  const html = els["modal-body"].innerHTML;
  const onclicks = [...html.matchAll(/onclick="([^"]*)"/g)].map(m => m[1]);
  ck("沒有 onclick 被引號切斷", !/onclick="[^"]*"[^ >]/.test(html));
  ck("建議鈕走 helper 不帶字串", onclicks.some(x => /^useMemGuess\(\d+\)$/.test(x)), onclicks.slice(0, 6));
  ck("onclick 裡沒有裸的雙引號", onclicks.every(x => !x.includes('"')));

  process.exit(bad ? 1 : 0);
})();
