// PChome 廠商後台 F12 撈單 v1
// 用法：在 PChome 24h 廠商後台「印貨資料 / 商品明細」頁面（含 商品名稱 / 收貨地址 / 訂單編號 欄位的那個 view）
//      → F12 → Console → 貼整段執行 → 自動複製 JSON 到剪貼簿
//      → 回到訂單管理系統「📋 匯入」分頁 → 貼到大框 → 按「匯入雲端」
//
// 設計重點：
// - 表格用 heuristic 找：含「訂單編號 / 商品名稱 / 收貨人」其中之一 + tr 數最多的 <table> 勝出
// - 欄位對應 by header keyword（中文關鍵字模糊比對），對 PChome 改 layout 較有韌性
// - 失敗會 alert + console.log [PC-SCRAPE] 詳細診斷，貼回給開發者就能調
(async () => {
  const TAG = '[PC-SCRAPE]';
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();

  const tables = [...document.querySelectorAll('table')];
  if (!tables.length) {
    alert('❌ 找不到任何 <table> — 確定在 PChome 廠商後台訂單頁？');
    return;
  }

  // Score each table — 越像訂單表分越高
  const scored = tables.map(t => {
    const txt = norm(t.textContent || '').slice(0, 2000);
    const trCnt = t.querySelectorAll('tr').length;
    const score =
      (txt.includes('訂單編號') ? 30 : 0) +
      (txt.includes('商品名稱') ? 20 : 0) +
      (txt.includes('收貨人') ? 20 : 0) +
      (txt.includes('收貨地址') ? 15 : 0) +
      (txt.includes('DEBJ') ? 10 : 0) +
      (/20\d{12}-\d{2}/.test(txt) ? 10 : 0) +
      Math.min(trCnt, 100);
    return { table: t, trCnt, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  console.log(TAG, 'table 候選分數：', scored.map(x => ({ tr: x.trCnt, score: x.score })));

  if (!best || best.score < 30) {
    alert(
      '❌ 找不到訂單表 — 檢查事項：\n' +
      '1. 是否在「印貨資料 / 商品明細」view（要看得到 商品名稱、收貨人、訂單編號 等欄位）\n' +
      '2. 表格資料是否已經載入完成？\n' +
      'F12 → Console 看 [PC-SCRAPE] 訊息可再診斷。'
    );
    return;
  }

  const table = best.table;
  console.log(TAG, '選中 table，rows:', best.trCnt);

  // 解析 header — 找第一個含 ≥3 個 th/td 且文字像 header 的 row
  let headers = [];
  let headerRowIdx = -1;
  const allTr = [...table.querySelectorAll('tr')];
  for (let i = 0; i < Math.min(allTr.length, 5); i++) {
    const cells = [...allTr[i].querySelectorAll('th, td')].map(c => norm(c.textContent || ''));
    const hits = cells.filter(c => /訂單編號|商品名稱|商品規格|收貨人|收貨地址|商品價格|印貨數量|商品編號|Zip|郵遞|數量/.test(c));
    if (hits.length >= 3) {
      headers = cells;
      headerRowIdx = i;
      break;
    }
  }
  if (!headers.length) {
    console.log(TAG, '所有 tr 前幾行：', allTr.slice(0, 5).map(tr => [...tr.querySelectorAll('th,td')].map(c => norm(c.textContent || ''))));
    alert('❌ 找不到 header row — 把 F12 console 的 [PC-SCRAPE] 訊息整段截圖給我');
    return;
  }
  console.log(TAG, 'headers:', headers);

  // Header → 欄位 mapping（包含可能的多個關鍵字）
  const FIELD_HINTS = {
    product:  ['商品名稱'],
    specs:    ['商品規格', '規格'],
    skuCode:  ['商品編號', '料號'],
    qty:      ['印貨數量', '出貨數量', '數量'],
    amount:   ['商品價格', '商品總價', '單價', '售價'],
    orderNo:  ['訂單編號', '出貨單編號'],
    name:     ['收貨人'],
    zip:      ['Zip', 'ZIP', '郵遞'],
    address:  ['收貨地址', '送貨地址'],
  };
  const idx = {};
  for (const [k, hints] of Object.entries(FIELD_HINTS)) {
    idx[k] = headers.findIndex(h => hints.some(x => h.includes(x)));
  }
  console.log(TAG, '欄位 idx:', idx);

  // 必要欄位檢查
  const required = ['orderNo', 'product', 'name', 'address'];
  const missing = required.filter(k => idx[k] < 0);
  if (missing.length) {
    alert('❌ 缺少必要欄位：' + missing.join(', ') + '\n\n表 header：\n' + headers.join(' | ') + '\n\n把這段 alert 截圖給我');
    return;
  }

  // 抽資料 row（跳過 header row 之前 + header row 本身）
  const dataRows = allTr.slice(headerRowIdx + 1);
  const orders = [];
  for (const tr of dataRows) {
    const cells = [...tr.querySelectorAll('td')].map(c => norm(c.textContent || ''));
    if (cells.length < headers.length / 2) continue; // 排除分隔/小計/空 row
    const orderNo = idx.orderNo >= 0 ? cells[idx.orderNo] : '';
    if (!/20\d{6,12}-\d{2}/.test(orderNo)) continue; // 不像訂單編號就跳過

    // address 砍掉「(XXX寄)」尾巴
    let address = idx.address >= 0 ? cells[idx.address] : '';
    address = address.replace(/\s*\([^)]*寄\)\s*/g, '').trim();

    // specs 可能是「白色 002」或「黑色全套 001」— 砍掉尾巴 3 位數編號
    let specs = idx.specs >= 0 ? cells[idx.specs] : '';
    specs = specs.replace(/\s*\d{3}\s*$/, '').trim();

    // 數量 / 金額 抽純數字
    const qty = idx.qty >= 0 ? (parseInt(cells[idx.qty].replace(/[^\d]/g, '')) || 1) : 1;
    const amount = idx.amount >= 0 ? (parseInt(cells[idx.amount].replace(/[^\d]/g, '')) || 0) : 0;

    orders.push({
      orderNo,
      product: idx.product >= 0 ? cells[idx.product] : '',
      specs,
      skuCode: idx.skuCode >= 0 ? cells[idx.skuCode] : '',
      qty,
      amount,
      name: idx.name >= 0 ? cells[idx.name] : '',
      zip: idx.zip >= 0 ? cells[idx.zip] : '',
      address,
    });
  }

  console.log(TAG, '抽出', orders.length, '筆');
  if (orders.length === 0) {
    alert('⚠️ 找到表但 0 筆訂單 — 可能 row 結構不一致。F12 console 看 [PC-SCRAPE] 訊息');
    return;
  }
  console.table(orders.slice(0, 5));

  const payload = JSON.stringify({ source: 'pchome-f12', version: 1, ts: Date.now(), orders }, null, 2);

  try {
    await navigator.clipboard.writeText(payload);
    alert(
      `✅ 已複製 ${orders.length} 筆訂單 JSON 到剪貼簿\n\n` +
      `下一步：\n` +
      `1. 切到訂單管理系統（yaukulele.github.io/order-system/）\n` +
      `2. 進「📋 匯入」分頁\n` +
      `3. 在大框 Ctrl+V 貼上 → 按「匯入雲端」`
    );
  } catch (e) {
    console.log(TAG, '剪貼簿被擋，payload 印在下面：');
    console.log(payload);
    alert(`⚠️ 找到 ${orders.length} 筆但剪貼簿權限被擋\nF12 → Console 找 [PC-SCRAPE] payload，自己手動 copy`);
  }

  return orders;
})();
