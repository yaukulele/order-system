// PChome 廠商後台 — 診斷模式 (v2)
// 不點任何按鈕，只回報「看電話」元素長什麼樣
(async () => {
  const all = [...document.querySelectorAll("a, button, span, div, td")];
  const candidates = all.filter((e) => (e.textContent || "").trim() === "看電話");

  if (!candidates.length) {
    alert("找不到「看電話」元素 (textContent 完全等於\"看電話\")");
    return;
  }

  // 取前 3 個樣本詳細 dump
  const samples = candidates.slice(0, 3).map((e, i) => {
    const a = e.closest("a");
    return {
      idx: i,
      tagName: e.tagName,
      classes: e.className,
      hasHref: !!a,
      href: a ? a.getAttribute("href") : null,
      onclick: e.onclick ? "yes" : "no",
      outerHTML: e.outerHTML.slice(0, 400),
      parent: e.parentElement?.tagName,
      parentClasses: e.parentElement?.className,
    };
  });

  console.log("[PC-DIAG] 找到", candidates.length, "個「看電話」");
  console.log("[PC-DIAG] 前 3 個樣本:", samples);

  // 也找 popup 候選
  const popupCandidates = [...document.querySelectorAll('[class*="dialog"], [class*="modal"], [class*="popup"], [role="dialog"]')];
  console.log("[PC-DIAG] popup 容器候選:", popupCandidates.map(p => ({tag: p.tagName, cls: p.className, hidden: p.hidden})));

  const summary = `🔍 診斷結果

找到 ${candidates.length} 個「看電話」元素

第 1 個樣本：
- tagName: ${samples[0].tagName}
- 是 <a> 嗎: ${samples[0].hasHref}
- href: ${samples[0].href || "(無)"}
- onclick: ${samples[0].onclick}
- parent: ${samples[0].parent} (${samples[0].parentClasses?.slice(0, 50) || ""})

popup 容器候選: ${popupCandidates.length} 個

詳細在 Console 看 [PC-DIAG] 那行展開`;

  alert(summary);
})();
