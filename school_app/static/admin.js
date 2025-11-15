// ------- トースト -------
function toast(msg, type = "success", ms = 3500) {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById("toast").appendChild(t);
  setTimeout(() => {
    t.style.opacity = 0;
    t.style.transform = "translateY(8px)";
    setTimeout(() => t.remove(), 300);
  }, ms);
}

// --------- カテゴリビルダー用 ----------
let catSegments = [];
let catSegmentSet = new Set();  // 既存カテゴリから集めた「階層名」の候補

function updateCategoryDisplay() {
  const disp = document.getElementById("cat-path-display");
  const hidden = document.getElementById("category");
  if (!catSegments.length) {
    disp.textContent = "（未設定 → 未分類として保存されます）";
    hidden.value = "";
  } else {
    const path = catSegments.join(" > ");
    disp.textContent = path;
    hidden.value = path;
  }
}

// 既存のカテゴリから階層名の候補と、一覧フィルター用セレクトを作る
async function loadCategorySegments() {
  try {
    const res = await fetch("/api/categories");
    if (!res.ok) return;
    const data = await res.json();
    const cats = data.categories || [];

    // --- datalist 用（「基礎流体力学」「中間」「第一回」など） ---
    catSegmentSet = new Set();
    cats.forEach(c => {
      if (!c || c === "すべて" || c === "未分類") return;
      const parts = c.split(">").map(s => s.trim()).filter(Boolean);
      parts.forEach(p => catSegmentSet.add(p));
    });

    const dl = document.getElementById("cat-segment-list");
    if (dl) {
      dl.innerHTML = Array.from(catSegmentSet)
        .sort()
        .map(name => `<option value="${name}"></option>`)
        .join("");
    }

    // --- 一覧のカテゴリ絞り込み用セレクト ---
    const sel = document.getElementById("list-filter-category");
    if (sel) {
      const current = sel.value; // いま選んでいる値
      sel.innerHTML = cats.map(c => {
        const val = (c === "すべて") ? "" : c;
        return `<option value="${val}">${c}</option>`;
      }).join("");
      const exists = Array.from(sel.options).some(o => o.value === current);
      sel.value = exists ? current : "";
    }
  } catch (e) {
    console.error("カテゴリ候補読み込みエラー:", e);
  }
}

// --------- 一覧取得 ----------
async function loadList(filterCategory = "") {
  try {
    let url = "/api/questions";
    if (filterCategory) {
      url += "?category=" + encodeURIComponent(filterCategory);
    }
    const res = await fetch(url);
    const data = await res.json();
    const list = data.questions || [];

    const tbody = document.querySelector("#list tbody");
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="5">該当する問題がありません。</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(q => `
      <tr>
        <td>${q.id}</td>
        <td>${(q.text || "").slice(0, 40)}${(q.text || "").length > 40 ? "…" : ""}</td>
        <td>${formatTypeLabel(q.qtype || "single")}</td>
        <td>${q.category || "未分類"}</td>
        <td>
          <span class="op-link" onclick="editItem(${q.id})">編集</span>
          <span class="op-link-danger" onclick="deleteItem(${q.id})">削除</span>
        </td>
      </tr>
    `).join("");
  } catch (e) {
    console.error(e);
    toast("一覧の取得に失敗しました", "error");
  }
}

function formatTypeLabel(t) {
  switch (t) {
    case "single": return "択一式";
    case "text": return "記述式";
    case "multi": return "複数選択式";
    case "multi-text": return "複数記述式";
    default: return t;
  }
}

// 現在選択中の絞り込みカテゴリを取得
function getCurrentFilterCategory() {
  const sel = document.getElementById("list-filter-category");
  return sel ? sel.value : "";
}

// --------- 共通 util ---------
function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, s => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[s]));
}

function getQType() {
  const sel = document.getElementById("qtype");
  return sel ? sel.value : "single";
}

// --------- 選択肢UI（択一 / 複数選択） ---------

// 現在の選択肢状態を取得（再描画のため）
function collectChoiceState() {
  const type = getQType();
  const inputs = Array.from(document.querySelectorAll(".choice-input"));
  const choices = inputs.map(i => i.value);

  let correctSingle = 0;
  let correctMulti = [];
  if (type === "single") {
    const r = document.querySelector('input[name="answer-single"]:checked');
    if (r) correctSingle = parseInt(r.value, 10) || 0;
  } else {
    correctMulti = Array.from(document.querySelectorAll(".answer-multi:checked"))
      .map(el => parseInt(el.value, 10))
      .filter(n => !Number.isNaN(n));
  }
  return { choices, correctSingle, correctMulti };
}

// 選択肢を描画
function renderChoices(choices = [], correctSingle = 0, correctMulti = []) {
  const type = getQType();
  const list = document.getElementById("choice-list");
  if (!list) return;

  const n = Math.max(choices.length, 2); // 最低2つ
  const correctSet = new Set(correctMulti || []);
  let html = "";

  for (let i = 0; i < n; i++) {
    const val = choices[i] ?? "";
    html += `
      <div class="choice-edit-row">
        <input type="text" class="choice-input" data-index="${i}"
               placeholder="選択肢${i + 1}" value="${escapeHtml(val)}">
        <label class="ans-radio">
    `;
    if (type === "single") {
      html += `<input type="radio" name="answer-single" value="${i}" ${i === correctSingle ? "checked" : ""}> 正解`;
    } else {
      html += `<input type="checkbox" class="answer-multi" value="${i}" ${correctSet.has(i) ? "checked" : ""}> 正解`;
    }
    html += `
        </label>
      </div>
    `;
  }
  list.innerHTML = html;
}

// --------- 複数記述式の答え枠UI ---------

function renderMultiTextAnswers(answers = []) {
  const list = document.getElementById("multi-text-answer-list");
  if (!list) return;
  const n = Math.max(answers.length, 2); // 最低2枠
  let html = "";
  for (let i = 0; i < n; i++) {
    const v = answers[i] ?? "";
    html += `
      <div style="margin-bottom:6px;">
        <input type="text"
               class="multi-text-answer-input"
               data-index="${i}"
               placeholder="答え${i + 1}"
               value="${escapeHtml(v)}">
      </div>
    `;
  }
  list.innerHTML = html;
}

function collectMultiTextAnswers() {
  return Array.from(document.querySelectorAll(".multi-text-answer-input"))
    .map(el => el.value.trim());
}

// 問題形式に応じてブロックの表示を切り替え
function updateTypeVisibility() {
  const type = getQType();
  const choiceBlock = document.getElementById("choice-block");
  const textBlock = document.getElementById("text-answer-block");
  const multiTextBlock = document.getElementById("multi-text-answer-block");

  if (type === "single" || type === "multi") {
    choiceBlock.style.display = "";
    textBlock.style.display = "none";
    multiTextBlock.style.display = "none";
  } else if (type === "text") {
    choiceBlock.style.display = "none";
    textBlock.style.display = "";
    multiTextBlock.style.display = "none";
  } else {
    choiceBlock.style.display = "none";
    textBlock.style.display = "none";
    multiTextBlock.style.display = "";
  }
}

// --------- 削除 ----------
async function deleteItem(id) {
  if (!confirm("削除しますか？")) return;
  try {
    const res = await fetch(`/api/questions/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("削除しました");
      const filterCategory = getCurrentFilterCategory();
      await loadList(filterCategory);
      await loadCategorySegments();  // カテゴリ候補も更新
    } else {
      toast("削除に失敗しました", "error");
    }
  } catch (e) {
    console.error(e);
    toast("通信エラーが発生しました", "error");
  }
}
window.deleteItem = deleteItem;

// --------- 編集 ----------
async function editItem(id) {
  try {
    const res = await fetch(`/api/questions/${id}`);
    if (!res.ok) {
      toast("問題の取得に失敗しました", "error");
      return;
    }
    const q = await res.json();

    document.getElementById("edit-id").value = q.id;
    document.getElementById("text").value = q.text || "";
    document.getElementById("explain").value = q.explain || "";

    // カテゴリ
    const cat = q.category || "";
    if (cat) {
      catSegments = cat.split(">").map(s => s.trim()).filter(Boolean);
    } else {
      catSegments = [];
    }
    updateCategoryDisplay();
    document.getElementById("cat-input").value = "";

    // 問題形式
    const type = q.qtype || "single";
    const qtypeSelect = document.getElementById("qtype");
    qtypeSelect.value = type;
    updateTypeVisibility();

    if (type === "single") {
      const ch = q.choices || [];
      const ans = typeof q.answer === "number" ? q.answer : parseInt(q.answer, 10) || 0;
      renderChoices(ch, ans, []);
    } else if (type === "multi") {
      const ch = q.choices || [];
      const answers = Array.isArray(q.answers) ? q.answers : [];
      renderChoices(ch, 0, answers);
    } else if (type === "text") {
      document.getElementById("text-answers").value = (q.answers || []).join("\n");
    } else if (type === "multi-text") {
      renderMultiTextAnswers(q.answers || []);
    }

    document.getElementById("edit-status").textContent = `ID ${id} を編集中です。`;
    document.getElementById("cancel-edit").style.display = "inline-flex";

    window.scrollTo({ top: 0, behavior: "smooth" });

    toast("編集モードに切り替えました", "success");
  } catch (e) {
    console.error(e);
    toast("編集データの取得に失敗しました", "error");
  }
}
window.editItem = editItem;

// --------- 保存（新規 or 更新） ----------
async function onSave() {
  const id = document.getElementById("edit-id").value;
  const text = document.getElementById("text").value.trim();
  const explain = document.getElementById("explain").value.trim();
  const type = getQType();

  if (!text) {
    toast("問題文を入力してください", "error");
    return;
  }

  let choices = [];
  let answer = 0;
  let answers = [];
  const category = catSegments.join(" > ");  // 未設定なら空文字

  if (type === "single" || type === "multi") {
    const state = collectChoiceState();
    const rawChoices = state.choices.map((t, idx) => ({ text: t.trim(), idx }));
    const filled = rawChoices.filter(ch => ch.text);

    if (filled.length < 2) {
      toast("有効な選択肢は2つ以上必要です", "error");
      return;
    }

    choices = filled.map(ch => ch.text);

    if (type === "single") {
      let selectedIdx = 0;
      const r = document.querySelector('input[name="answer-single"]:checked');
      if (r) {
        const raw = parseInt(r.value, 10) || 0;
        const found = filled.findIndex(ch => ch.idx === raw);
        if (found === -1) {
          toast("正解に選んだ選択肢が空欄になっています", "error");
          return;
        }
        selectedIdx = found;
      }
      answer = selectedIdx;
    } else {
      const checked = Array.from(document.querySelectorAll(".answer-multi:checked"))
        .map(el => parseInt(el.value, 10))
        .filter(n => !Number.isNaN(n));

      const idxSet = new Set(checked);
      const mapped = filled
        .map((ch, newIndex) => ({ newIndex, rawIdx: ch.idx }))
        .filter(obj => idxSet.has(obj.rawIdx))
        .map(obj => obj.newIndex);

      if (!mapped.length) {
        toast("少なくとも1つは正解にしてください", "error");
        return;
      }
      answers = mapped;
    }
  } else if (type === "text") {
    const raw = document.getElementById("text-answers").value || "";
    answers = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!answers.length) {
      toast("記述式の正解を1つ以上入力してください", "error");
      return;
    }
  } else if (type === "multi-text") {
    const rawList = collectMultiTextAnswers();
    answers = rawList.map(s => s.trim()).filter(Boolean);
    if (answers.length < 2) {
      toast("複数記述式の正解は2つ以上入力してください", "error");
      return;
    }
  }

  const payload = {
    text,
    explain,
    category,
    qtype: type,
    choices,
    answer,
    answers
  };

  try {
    let res;
    if (id) {
      res = await fetch(`/api/questions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      toast("保存に失敗しました", "error");
      return;
    }

    toast("保存しました");
    resetForm();

    const filterCategory = getCurrentFilterCategory();
    await loadList(filterCategory);
    await loadCategorySegments();  // 新しいカテゴリも候補に反映
  } catch (e) {
    console.error(e);
    toast("通信エラーが発生しました", "error");
  }
}

function resetForm() {
  document.getElementById("question-form").reset();
  document.getElementById("edit-id").value = "";
  document.getElementById("edit-status").textContent = "新規作成モードです。";
  document.getElementById("cancel-edit").style.display = "none";

  document.querySelectorAll('input[name="answer-single"]').forEach(r => r.checked = false);
  document.querySelectorAll('.answer-multi').forEach(c => c.checked = false);

  catSegments = [];
  updateCategoryDisplay();
  document.getElementById("cat-input").value = "";

  const sel = document.getElementById("qtype");
  sel.value = "single";
  updateTypeVisibility();
  renderChoices(["", ""], 0, []);
  renderMultiTextAnswers([]); // 初期状態をリセット
}

// --------- イベント登録 ----------
document.addEventListener("DOMContentLoaded", () => {
  updateCategoryDisplay();

  // 問題形式変更
  const qtypeSelect = document.getElementById("qtype");
  qtypeSelect.addEventListener("change", () => {
    updateTypeVisibility();
    const type = getQType();
    if (type === "single" || type === "multi") {
      renderChoices(["", ""], 0, []);
    } else if (type === "multi-text") {
      renderMultiTextAnswers([]);
    }
  });

  // 初期の選択肢・複数記述答案
  updateTypeVisibility();
  renderChoices(["", ""], 0, []);
  renderMultiTextAnswers([]);

  // カテゴリビルダー
  document.getElementById("cat-add").addEventListener("click", () => {
    const val = document.getElementById("cat-input").value.trim();
    if (!val) return;
    catSegments.push(val);
    document.getElementById("cat-input").value = "";
    updateCategoryDisplay();
  });

  document.getElementById("cat-clear").addEventListener("click", () => {
    catSegments = [];
    updateCategoryDisplay();
    document.getElementById("cat-input").value = "";
  });

  // 選択肢追加
  document.getElementById("choice-add-btn").addEventListener("click", () => {
    const state = collectChoiceState();
    state.choices.push("");
    renderChoices(state.choices, state.correctSingle, state.correctMulti);
  });

  // 複数記述式：答え枠追加
  const mtBtn = document.getElementById("multi-text-add-btn");
  if (mtBtn) {
    mtBtn.addEventListener("click", () => {
      const now = collectMultiTextAnswers();
      now.push("");
      renderMultiTextAnswers(now);
    });
  }

  // 保存 & 編集キャンセル
  document.getElementById("save").addEventListener("click", onSave);
  document.getElementById("cancel-edit").addEventListener("click", () => {
    resetForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // 一覧のカテゴリ絞り込み
  const sel = document.getElementById("list-filter-category");
  const btnClear = document.getElementById("list-filter-clear");

  if (sel) {
    sel.addEventListener("change", () => {
      const val = sel.value; // "" ならすべて
      loadList(val);
    });
  }
  if (btnClear) {
    btnClear.addEventListener("click", () => {
      if (sel) sel.value = "";
      loadList("");
    });
  }

  // 初期ロード
  loadList("");
  loadCategorySegments();
});
