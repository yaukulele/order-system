// PChome 廠商後台 — 一鍵抓所有訂單 + 解密電話
// 使用：書籤 javascript:fetch('https://yaukulele.github.io/order-system/pchome-helper.js').then(r=>r.text()).then(eval)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1. 找所有 看電話 按鈕
  const all = [...document.querySelectorAll("a, button, span")];
  const btns = all.filter((e) => (e.textContent || "").trim() === "看電話");
  if (!btns.length) {
    alert("找不到「看電話」按鈕，可能：\n- 不在 PChome 訂單頁\n- PChome 改 UI 了");
    return;
  }

  if (!confirm(`找到 ${btns.length} 筆訂單。\n\n自動點完所有「看電話」抓電話？\n\n預計 ${btns.length} 秒。`)) return;

  // 2. 抓每一行的 row 文字（含訂單編號 / 商品 / 收貨人 / 地址）
  const rows = [...document.querySelectorAll("tr.vxe-body--row, tr")];
  const rowTexts = rows.map((r) => (r.textContent || "").replace(/\s+/g, " ").trim()).filter((t) => t.length > 30);

  // 3. 依序點開每個 看電話，抓 popup 電話
  const phones = [];
  for (let i = 0; i < btns.length; i++) {
    btns[i].click();
    await sleep(900);

    // 找最近顯示的 popup（含 09 開頭電話的浮動元素）
    const popup = [...document.querySelectorAll("div")].reverse().find((d) => {
      const cs = getComputedStyle(d);
      if (cs.position !== "fixed" && cs.position !== "absolute") return false;
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      return /09\d{8}/.test(d.textContent || "");
    });

    let phone = "(失敗)";
    if (popup) {
      const t = popup.textContent || "";
      const m = t.match(/09\d{8}[\d,#\-]*/);
      phone = m ? m[0] : "(找不到 09 電話)";
    }
    phones.push(phone);

    // 關 popup — 找出剛剛 popup 內的 close X 按鈕，不用 Esc 避免觸發頁面導航
    if (popup) {
      const closeBtn = popup.querySelector('[class*="close"], [aria-label*="關閉"], [aria-label*="close"], button.close, .el-dialog__close, .ant-modal-close');
      if (closeBtn) {
        try { closeBtn.click(); } catch (e) {}
      }
    }
    await sleep(200);
  }

  // 4. 合併輸出
  console.log("[PChome] 抓到的電話:", phones);

  const out = phones.map((p, i) => {
    const row = rowTexts[i] || "(找不到 row 文字)";
    return `=== ${i + 1} ===\n${row}\n電話: ${p}`;
  }).join("\n\n---\n\n");

  // 5. 寫到剪貼簿
  try {
    await navigator.clipboard.writeText(out);
    alert(`✅ 抓到 ${phones.length} 筆\n\n預覽（前 500 字）:\n\n${out.slice(0, 500)}\n\n貼到撈單系統「匯入」分頁`);
  } catch (e) {
    prompt("剪貼簿失敗，手動複製:", out);
  }
})();
