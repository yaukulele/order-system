// 「平台還沒結單就留著 SP／出貨鈕」的測試（不連網、不開瀏覽器）
// 跑法：node scripts/test-ship-button-when-platform-open.js
//
// 🔴 這支存在的原因：杰哥 2026-09-22 截圖「有一個出貨按鈕不見」。
//    那筆 PChome 單本機被標「已完成」，平台卻還掛「未結單」，
//    而按鈕的條件只看 isPending(o.status) → 收尾狀態一律把 SP／出貨鈕收起來，
//    結果還要壓單的單沒鈕可壓，只能先把狀態改回去再改回來。
//    改法：多一條 platformNeedsShip(o) —— 平台確定還沒壓成功就留著鈕。
//    連帶的坑：壓單成功後原本無條件 o.status='已出貨'，
//    已完成的單按下去會被往回拉成已出貨 → 加 applyShipStatus() 擋住。
//    這支盯著這兩件事別再走回頭路。
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

let bad = 0;
const ck = (n, c, x) => { if (!c) { bad++; console.log("FAIL  " + n, x ?? ""); } else console.log("PASS  " + n); };

// ---- 靜態檢查：按鈕條件不可以只剩 isPending ----
ck("出貨鈕條件有帶 platformNeedsShip", /const ship=\(isPending\(o\.status\)\|\|_shipByPlat\)/.test(src));
ck("壓單成功走 applyShipStatus，不是直接指派",
  !/o\.status='已出貨';o\.shippedAt/.test(src) && /applyShipStatus\(o\);o\.shippedAt/.test(src));

// ---- platformNeedsShip 行為 ----
{
  const fn = src.match(/function platformNeedsShip\(o\)\{[\s\S]*?\n\}/)[0];
  let PCSTALE = false, MOSTALE = false, PCENT = null, MOENT = null;
  const stub = {
    _pcStaleFor: () => PCSTALE,
    _pcState: L => L ? (L.kind === "sp" ? (L.st === "Shipped" ? "spDone" : "sp") : L.kind) : "",
    pcLiveOf: () => PCENT,
    momoLiveStale: () => MOSTALE,
    momoLiveOf: () => MOENT,
  };
  const f = new Function(...Object.keys(stub), fn + ";return platformNeedsShip")(...Object.values(stub));

  const pc = (desc, ent, stale, exp) => { PCENT = ent; PCSTALE = stale; ck(desc, f({ platform: "PC" }) === exp); };
  pc("PC 未結單(open) → 留鈕", { kind: "open" }, false, true);
  pc("PC 壓單失敗(error) → 留鈕", { kind: "error" }, false, true);
  pc("PC 已結單(shipped) → 不留", { kind: "shipped" }, false, false);
  pc("PC 自行配送中(sp) → 不留", { kind: "sp", st: "" }, false, false);
  pc("PC 已取消 → 不留", { kind: "cancelled" }, false, false);
  pc("PC 查詢窗外查不到 → 不留", null, false, false);
  pc("PC 快照過期 → 不留（寧可沒鈕也不要用舊資料長鈕）", { kind: "open" }, true, false);
  PCENT = null; PCSTALE = false;

  const mo = (desc, ent, stale, exp) => { MOENT = ent; MOSTALE = stale; ck(desc, f({ platform: "MO" }) === exp); };
  mo("MO 還在未出貨清單 → 留鈕", { st: "請回覆" }, false, true);
  mo("MO 已配送 → 不留", { st: "已配送" }, false, false);
  mo("MO 已結案(gone) → 不留", { gone: true }, false, false);
  mo("MO 沒同步過 → 不留", null, false, false);
  mo("MO 快照過期 → 不留", { st: "請回覆" }, true, false);
  MOENT = null; MOSTALE = false;

  ck("調貨單(TR) → 不留（沒有平台可以壓單）", f({ platform: "TR" }) === false);
  ck("null 訂單 → 不留", f(null) === false);
}

// ---- applyShipStatus 不可以把收尾狀態往回拉 ----
{
  const cSrc = src.match(/const _SHIP_NO_DOWNGRADE=\[[^\]]*\];/)[0];
  const fn = src.match(/function applyShipStatus\(o\)\{.*/)[0];
  const f = new Function(cSrc + "\n" + fn + "\nreturn applyShipStatus")();
  const t = (st, exp) => { const o = { status: st }; f(o); ck(`壓單後 ${st} → ${exp}`, o.status === exp, o.status); };
  ["未確認", "已確認", "直接出", "已包裝"].forEach(s => t(s, "已出貨"));
  ["已完成", "線下完", "已取消", "轉線下"].forEach(s => t(s, s));
  t("已出貨", "已出貨");
}

console.log(bad ? `\n❌ ${bad} 項沒過` : "\n✅ 全過");
process.exit(bad ? 1 : 0);
