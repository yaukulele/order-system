// 「商品」鈕開商品頁的測試（不連網、不開瀏覽器）
// 跑法：node scripts/test-open-product-page.js
//
// 🔴 這支存在的原因：原本用 window.open(url,'_blank','noopener')，
//    帶第三個參數瀏覽器會當成「彈出視窗」，被擋掉就靜靜什麼都不發生
//    （杰哥 2026-09-21：「我按了商品 網頁沒出來」），
//    而且帶 noopener 時回傳值永遠是 null，連「是不是被擋了」都測不出來。
//    改成 <a target="_blank"> 觸發。這支盯著別再改回去。
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

let bad = 0;
const ck = (n, c, x) => { if (!c) { bad++; console.log("FAIL  " + n, x ?? ""); } else console.log("PASS  " + n); };

// ---- 靜態檢查：不可以再出現帶 noopener 的 window.open ----
const code = src.replace(/\/\*[\s\S]*?\*\//g, "");   // 把註解拿掉，不然註解裡提到的也會被抓
ck("程式碼裡沒有 window.open(...,'noopener')", !/window\.open\([^)]*['"]noopener['"]\)/.test(code));

// ---- 行為檢查 ----
const a = src.indexOf("function openTab(url)");
const pend = src.indexOf("function openProdPage(oid)");
const b = src.indexOf("\n}", pend) + 2;        // 切到 openProdPage 的結尾
const chunk = src.slice(a, b);

let CLICKED = null, APPENDED = 0, REMOVED = 0;
const el = { href: "", target: "", rel: "", click() { CLICKED = { href: this.href, target: this.target, rel: this.rel }; }, remove() { REMOVED++; } };
global.document = { createElement: () => el, body: { appendChild() { APPENDED++; } } };
global.alert = m => { global._ALERT = m; };

let ORDER = null;
global.findO = () => ORDER;
// prodSearchUrl 從原始碼裡切出來一起 eval，確保測的是真的那一支
const pa = src.indexOf("function prodIsExact(o)");
const pb = src.indexOf("function openProdPage(oid)");
eval(src.slice(pa, pb) + chunk + "\nglobalThis.OPEN=openProdPage;globalThis.URLOF=prodSearchUrl;globalThis.TAB=openTab;");

ORDER = { platform: "MO", goodsCode: "13703901", product: "【BOSS】Katana-50 MK3 吉他音箱" };
OPEN("x");
ck("用 <a> 觸發，不是 window.open", !!CLICKED);
ck("target=_blank", CLICKED.target === "_blank");
ck("帶 rel=noopener", /noopener/.test(CLICKED.rel));
ck("MOMO 走 /product/<編號>", CLICKED.href === "https://www.momoshop.com.tw/product/13703901", CLICKED.href);
ck("用完把節點移除", REMOVED === APPENDED && REMOVED > 0);

ORDER = { platform: "PC", prodId: "DEBJ3A-A900JB3VL-003", product: "TRBX174" };
OPEN("x");
ck("PChome 走 /prod/<編號>", CLICKED.href === "https://24h.pchome.com.tw/prod/DEBJ3A-A900JB3VL-003", CLICKED.href);

ORDER = { platform: "ST", product: "店內賣的琴" };
OPEN("x");
ck("沒有編號就退回用名稱搜尋", /google\.com\/search/.test(CLICKED.href), CLICKED.href);

ORDER = { platform: "ST", product: "" };
CLICKED = null; global._ALERT = "";
OPEN("x");
ck("什麼都沒有就講一句話，不要靜靜不動", CLICKED === null && String(global._ALERT).length > 0, global._ALERT);


// ---- 2026-09-29：列表上的「商品」必須是「畫面上真的 <a href>」 ----
// 杰哥又回報「點了商品網址又看不到了」。JS 造 <a> 再 click() 仍然是程式點的，
// Safari / PWA 獨立視窗 / 擋彈窗照樣可以默默吃掉。真的 <a> 才不會被當彈窗，
// 而且能長按右鍵「在新分頁開啟 / 複製連結」。這幾條盯著別再改回純按鈕。
const pl = src.slice(src.indexOf("const _prodUrl=prodSearchUrl(o);"), src.indexOf("const _smsDone"));
ck("列表「商品」是真的 <a href>", /<a class="act[^"]*" href="\$\{esc\(_prodUrl\)\}" target="_blank" rel="noopener"/.test(pl));
ck("桌機版＋手機版都是 <a>", (pl.match(/<a class=/g) || []).length === 2, (pl.match(/<a class=/g) || []).length);
ck("「商品」上沒有殘留 onclick=openProdPage", !/onclick="openProdPage/.test(pl));

process.exit(bad ? 1 : 0);
