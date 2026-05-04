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

  // Header → 欄位 mapping（hint 用 includes 比對，多備一些 variant）
  const FIELD_HINTS = {
    product:  ['商品名稱', '品名'],
    specs:    ['商品規格', '規格'],
    skuCode:  ['商品編號', '料號'],
    qty:      ['印貨數量', '出貨數量', '訂購數量', '數量'],
    amount:   ['商品價格', '商品總價', '單價', '售價', '金額'],
    orderNo:  ['訂單編號', '出貨單編號', '收貨單編號', '訂單號'],
    name:     ['收貨人姓名', '收貨人', '收件人'],
    zip:      ['Zip', 'ZIP', 'zip', '郵遞', '郵區'],
    address:  ['收貨人地址', '收貨地址', '送貨地址', '配送地址', '收件地址', '收貨人住址'],
  };
  const idx = {};
  for (const [k, hints] of Object.entries(FIELD_HINTS)) {
    // 為避免 '規格'(含商品規格的子字串) 重複命中前面的欄位，header 比對用「最長 hint 優先」
    let best = -1, bestLen = 0;
    headers.forEach((h, i) => {
      for (const hint of hints) {
        if (h.includes(hint) && hint.length > bestLen) { best = i; bestLen = hint.length; }
      }
    });
    idx[k] = best;
  }
  console.log(TAG, '欄位 idx:', idx);

  // Regex fallback：找不到 orderNo / address header 時，掃整行 cell 撈
  function fallbackOrderNoFrom(cells){
    for (let i = 0; i < cells.length; i++) {
      if (/^20\d{6,12}-\d{2}$/.test(cells[i].trim())) return i;
    }
    return -1;
  }
  function fallbackAddressFrom(cells){
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if ((c.includes('市') || c.includes('縣')) && /\d+號|\d+巷|\d+弄|\d+段|\d+路|\d+街/.test(c)) return i;
    }
    return -1;
  }

  // 找 data row：PChome 後台常常一筆訂單一個 nested <table>，光在 picked table 內找會漏。
  // 改成全文掃 <tr>，篩出「td 數 ≥ headers.length 一半」且至少一個 cell 命中 orderNo regex 的 row。
  const ORDER_RE = /^20\d{6,12}-\d{2}$/;
  const minCells = Math.max(8, Math.floor(headers.length / 2));
  const allTrDoc = [...document.querySelectorAll('tr')];
  const dataRows = allTrDoc.filter(tr => {
    if (tr === allTr[headerRowIdx]) return false;
    const tds = tr.querySelectorAll('td');
    if (tds.length < minCells) return false;
    for (const td of tds) {
      if (ORDER_RE.test(norm(td.textContent || ''))) return true;
    }
    return false;
  });
  console.log(TAG, 'data row 候選（全文掃）:', dataRows.length, '個（minCells=' + minCells + '）');

  // ⚠️ 重要：data row 在 nested per-order <table> 內，column 順序跟外層 header 不一致。
  // → 不再吃 idx，純粹用「每個 cell 的內容 pattern」分配欄位
  const SPEC_RE = /^(?:[黑白紅藍綠紫橙黃粉灰金銀棕]|消光|啞光|奶油|原木|霧面|亮面|無|淺|深)[一-龥]{0,8}(色|款|套|組)?$/;
  // 弦 / 鼓棒 / 線材等規格 keyword：輕中重量、規格詞、gauge 數字 (010-046)
  const SPEC_KW_RE = /(輕量|中量|重量|極輕|超輕|加重|標準量|單顆|對裝|組裝|套裝|全套|半套|加大|加長|加厚|電吉他用|木吉他用|民謠用|古典用|碳纖|碳鋼|尼龍|羊腸|鋼弦|尼弦|普弦|滾繞|平繞)/;
  const GAUGE_RE = /^[\d]{2,3}-[\d]{2,3}(?:\s|$)|(?:^|\s)[\d]{2,3}-[\d]{2,3}(?:\s|$)/;
  const NAME_RE = /^[一-龥]{2,5}$/;
  const ADDRESS_PIECE_RE = /\d+號|\d+巷|\d+弄|\d+段|\d+路|\d+街/;
  // 黑名單：2-5 中文但不是客戶名 — 出貨狀態 / UI 標籤 / 配送 / 顏色 / 款式
  const NAME_BLACKLIST = new Set([
    '未出貨','已出貨','未確認','已確認','未付款','已付款','新訂單','處理中','已取消','配送中','已完成','未配達','已配達','已撿貨','撿貨中','已揀貨','揀貨中',
    '看電話','回填','請選擇','不出貨','清除','同上','全同','取貨','退貨','換貨','缺貨','加購','贈品',
    '宅配','黑貓','新竹','順豐','店配','超商','郵寄','到貨','到付','轉帳','匯款','現金','信用卡','超取','超商取貨',
    '白色','黑色','紅色','藍色','綠色','紫色','橙色','黃色','粉色','灰色','金色','銀色','棕色','咖啡','咖啡色','奶油色','原木色',
    '消光','啞光','霧面','亮面','防水','男生','女生','男款','女款','大號','中號','小號','標準','基本','豪華','旗艦',
    '已下單','未下單','備貨中','預購','現貨','缺色','選購','加購區','原廠',
  ]);
  // product 黑名單 — prefix match（涵蓋 PChome 各種 dropdown placeholder + 出貨狀態文字）
  const PRODUCT_BLACKLIST_RE = /^(同上|全同|看電話|回填|未出貨|已出貨|請選擇|不出貨|清除|已確認|未確認|配送中|已完成|已取消|已撿貨|撿貨中|已揀貨|揀貨中|宅配|黑貓|新竹|順豐|店配|超商|郵寄|到付|貨到|備貨|預購|現貨|商品自行|自行出貨|預設|保留|敬請|無|尚未|統編|抬頭|請款)/;
  const orders = [];
  for (const tr of dataRows) {
    const cells = [...tr.querySelectorAll('td')].map(c => norm(c.textContent || ''));
    if (cells.length < 3) continue;

    let orderNo = '', product = '', specs = '', skuCode = '', zip = '', address = '';
    const numericCells = [];
    const nameCandidates = [];

    for (const raw of cells) {
      const c = raw.trim();
      if (!c) continue;
      // orderNo
      if (!orderNo) {
        const m = c.match(/(20\d{6,12}-\d{2})/);
        if (m && m[1] === c) { orderNo = m[1]; continue; }
        if (m) { orderNo = m[1]; /* 不 continue — cell 可能還含其他資訊（地址合併） */ }
      }
      // skuCode (DEBJ 料號)
      if (!skuCode && /^DEBJ[A-Z0-9-]+/i.test(c)) { skuCode = c; continue; }
      // address: 有「市/縣」+ 路/巷/段/弄/號 → 地址。砍訂單號 + (XXX寄)
      if (!address && (c.includes('市') || c.includes('縣')) && ADDRESS_PIECE_RE.test(c)) {
        address = c.replace(/\s*20\d{6,12}-\d{2}\s*/g, ' ')
                   .replace(/\s*\([^)]*寄\)\s*/g, '')
                   .replace(/\s+/g, ' ').trim();
        continue;
      }
      // zip: 3-5 純數字
      if (!zip && /^\d{3,5}$/.test(c)) { zip = c; continue; }
      // 純數字 cell → 進 numeric pool（之後挑 qty / amount）
      if (/^[\d,]+$/.test(c)) { const n = parseInt(c.replace(/,/g, '')); if (!isNaN(n)) numericCells.push(n); continue; }
      // specs: 顏色/款式 (可能尾巴有 3 位數編號 "白色 002")
      // 也認 gauge 數字 (010-046) 跟弦/鼓棒等規格 keyword
      if (!specs) {
        const stripped = c.replace(/\s+\d{3}\s*$/, '').trim();
        if (stripped && stripped.length <= 24 && (SPEC_RE.test(stripped) || GAUGE_RE.test(stripped) || SPEC_KW_RE.test(stripped))) { specs = stripped; continue; }
      }
      // name candidate: 2-5 純中文 + 不在黑名單（出貨狀態/顏色/配送方式/UI 標籤）
      if (NAME_RE.test(c) && !NAME_BLACKLIST.has(c)) { nameCandidates.push(c); continue; }
      // product: 含中文/英文 + 長度合理 + 不是 UI 黑名單（120 chars 上限保留長品名）
      if (!product && c.length >= 3 && c.length < 120 && /[一-龥A-Za-z]/.test(c) && !PRODUCT_BLACKLIST_RE.test(c)) {
        product = c.replace(/\s*DEBJ[A-Z0-9-]+/gi, '').replace(/\s+/g, ' ').trim();
        continue;
      }
    }
    // 客戶名 = 最後一個 candidate（PChome 表 收貨人 在後段 col，過濾完狀態/顏色後最後一個最可能是客人）
    const name = nameCandidates.length ? nameCandidates[nameCandidates.length - 1] : '';

    if (!orderNo) continue;

    // qty / amount 從 numericCells 推
    // amount cap: 6 位數 (≤999999)，排除商品ID（PChome 商品ID 都是 7-10 位數，e.g. 30049456）
    let qty = 1, amount = 0;
    const small = numericCells.filter(n => n >= 1 && n <= 99);
    const big = numericCells.filter(n => n >= 100 && n <= 999999).sort((a, b) => b - a);
    if (small.length) qty = small[0];
    if (big.length) amount = big[0];

    orders.push({ orderNo, product, specs, skuCode, qty, amount, name, zip, address });
  }

  console.log(TAG, '抽出', orders.length, '筆');
  if (orders.length === 0) {
    // Diagnostic dump — 把前 5 個 data row 的 cell 內容全印出來
    console.log(TAG, '=== Diagnostic: 前 5 個 data row cells ===');
    dataRows.slice(0, 5).forEach((tr, i) => {
      const tds = [...tr.querySelectorAll('td')];
      const ths = [...tr.querySelectorAll('th')];
      console.log(TAG, `row[${i}] td數=${tds.length} th數=${ths.length} children=${tr.children.length}`);
      console.log(TAG, `row[${i}] cells:`, tds.map(c => norm(c.textContent || '')));
      console.log(TAG, `row[${i}] outerHTML[:300]:`, tr.outerHTML.slice(0, 300));
    });
    console.log(TAG, '=== headers found ===', headers);
    console.log(TAG, '=== idx mapping ===', idx);
    alert(
      '⚠️ 找到表但 0 筆訂單 — row 結構跟假設不符。\n\n' +
      '已在 F12 Console 印出診斷訊息，請：\n' +
      '1. F12 → Console 分頁\n' +
      '2. 找 [PC-SCRAPE] 開頭的訊息，從 "Diagnostic: 前 5 個 data row cells" 那段往下\n' +
      '3. 整段截圖傳給我\n\n' +
      'headers: ' + headers.join(' | ').slice(0, 200)
    );
    return;
  }
  console.table(orders.slice(0, 5));

  const payload = JSON.stringify({ source: 'pchome-f12', version: 1, ts: Date.now(), orders }, null, 2);

  // 三段式 copy：modern API → execCommand → 直接彈 textarea overlay 讓使用者 Ctrl+C
  let copyMethod = '';
  try {
    await navigator.clipboard.writeText(payload);
    copyMethod = 'clipboard API';
  } catch (e) {
    console.log(TAG, 'clipboard API 失敗，改試 execCommand：', e.message);
    const ta = document.createElement('textarea');
    ta.value = payload;
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) copyMethod = 'execCommand';
    } catch (e2) {}
    document.body.removeChild(ta);
  }

  if (copyMethod) {
    alert(
      `✅ 已複製 ${orders.length} 筆訂單 JSON 到剪貼簿（${copyMethod}）\n\n` +
      `下一步：\n` +
      `1. 切到訂單管理系統（yaukulele.github.io/order-system/）\n` +
      `2. 進「📋 匯入」分頁\n` +
      `3. 在大框 Ctrl+V 貼上 → 按「匯入雲端」`
    );
  } else {
    // 3rd fallback：在 PChome 頁面上彈一個 overlay textarea，強制 user Ctrl+A Ctrl+C
    console.log(TAG, '兩種 copy 都失敗，把 payload 印出來 + 顯示 overlay：');
    console.log(payload);
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999999;display:flex;align-items:center;justify-content:center;padding:30px';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:20px;max-width:90vw;max-height:90vh;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:16px;font-weight:700">⚠️ 剪貼簿權限被擋 — 請手動 copy（${orders.length} 筆訂單）</div>
        <div style="font-size:13px">在下面框內 Ctrl+A 全選 → Ctrl+C 複製，然後關掉這個 overlay。</div>
        <textarea readonly style="flex:1;width:80vw;height:60vh;font-family:monospace;font-size:11px"></textarea>
        <button id="__pcs_close" style="padding:8px 16px;font-size:14px;background:#2d7a4f;color:#fff;border:0;border-radius:6px;cursor:pointer">已複製，關閉</button>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('textarea').value = payload;
    ov.querySelector('textarea').select();
    ov.querySelector('#__pcs_close').onclick = () => ov.remove();
  }

  return orders;
})();
