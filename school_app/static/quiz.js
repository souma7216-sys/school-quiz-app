let questions = [];
let i = 0;
let score = 0;

// 間違えた問題の記録
let wrongList = [];

// フォルダ選択用
let selectedCategoryPrefix = "";   // 例: "電気電子計測工学II > 中間"
let selectedUnclassified = false;  // 「未分類」かどうか
let categoryTree = {};             // { lv1: { lv2: Set(lv3,...) } }

const secTitle = document.getElementById("title");
const secQuiz  = document.getElementById("quiz-sec");
const quizBox  = document.getElementById("quiz");
const nextBtn  = document.getElementById("next");
const scoreBox = document.getElementById("score");
const titleBtn = document.getElementById("to-title");
const startBtn = document.getElementById("start");
const catBox   = document.getElementById("category-box");

// LaTeX区間($...$や$$...$$)の外側だけ、^ を <sup> に変換
function convertCaretsOutsideMath(src) {
  const parts = src.split(/(\$\$[^$]*\$\$|\$[^$]*\$)/g);
  return parts.map(p => {
    if (/^\$/.test(p)) return p; // 数式はそのまま
    return p
      .replace(/(\S)\^\{([^}]+)\}/g, '$1<sup>$2</sup>')
      .replace(/(\S)\^([0-9A-Za-z+\-]+)/g, '$1<sup>$2</sup>');
  }).join('');
}

function show(section) {
  secTitle.classList.toggle("hidden", section !== "title");
  secQuiz.classList.toggle("hidden", section !== "quiz");
}

function toast(msg, type="success", ms=4000) {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById("toast").appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0"; t.style.transform = "translateY(8px)";
    setTimeout(() => t.remove(), 400);
  }, ms);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let j = a.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [a[j], a[k]] = [a[k], a[j]];
  }
  return a;
}

// 選択肢をシャッフル（択一式・複数選択式のみ）
function withShuffledChoices(q) {
  if (!q.choices || !Array.isArray(q.choices)) return q;

  const idxs = q.choices.map((_, k) => k);
  const perm = shuffle(idxs);
  const choices = perm.map(p => q.choices[p]);

  const type = q.qtype || "single";

  if (type === "multi") {
    const oldAnsArr = Array.isArray(q.answers) ? q.answers : [];
    const newAnswers = oldAnsArr
      .map(oldIdx => perm.indexOf(oldIdx))
      .filter(i => i >= 0);
    return { ...q, choices, answers: newAnswers };
  } else {
    const answer = perm.indexOf(q.answer);
    return { ...q, choices, answer };
  }
}

// Markdown + DOMPurify + MathJax でレンダリング
function renderRichText(container, mdText) {
  const pre = convertCaretsOutsideMath(mdText ?? "");
  const html = DOMPurify.sanitize(marked.parse(pre));
  container.innerHTML = html;
  if (window.MathJax?.typesetPromise) {
    return MathJax.typesetPromise([container]);
  }
  return Promise.resolve();
}

/* ========= カテゴリ（フォルダ）UI構築 ========= */

function updateFolderLabel() {
  const label = document.getElementById("folder-label");
  if (!label) return;

  if (selectedUnclassified) {
    label.textContent = "未分類 のすべて";
    return;
  }
  if (!selectedCategoryPrefix) {
    label.textContent = "すべて の問題";
    return;
  }
  label.textContent = `${selectedCategoryPrefix} のすべて`;
}

async function loadCategories() {
  const res = await fetch("/api/categories");
  const data = await res.json();
  const allCats = data.categories || [];

  const hasUnclassified = allCats.includes("未分類");
  const usable = allCats.filter(c => c !== "すべて" && c !== "未分類");

  // ツリー構造にする {lv1: { lv2: Set(lv3) }}
  categoryTree = {};
  usable.forEach(c => {
    const parts = c.split(">").map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const lv1 = parts[0];
    categoryTree[lv1] = categoryTree[lv1] || {};
    if (parts.length >= 2) {
      const lv2 = parts[1];
      categoryTree[lv1][lv2] = categoryTree[lv1][lv2] || new Set();
      if (parts.length >= 3) {
        categoryTree[lv1][lv2].add(parts[2]);
      }
    }
  });

  // フォルダ風セレクタを生成
  catBox.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px; font-size:14px;">
      <div>フォルダを選択して出題範囲を決めてください。</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
        <div>
          <div style="font-size:12px; color:#6b7280;">第1階層</div>
          <select id="cat-lv1" style="min-width:180px; padding:4px 6px; border-radius:999px; border:1px solid #d1d5db;"></select>
        </div>
        <div>
          <div style="font-size:12px; color:#6b7280;">第2階層</div>
          <select id="cat-lv2" style="min-width:180px; padding:4px 6px; border-radius:999px; border:1px solid #d1d5db;"></select>
        </div>
        <div>
          <div style="font-size:12px; color:#6b7280;">第3階層</div>
          <select id="cat-lv3" style="min-width:180px; padding:4px 6px; border-radius:999px; border:1px solid #d1d5db;"></select>
        </div>
      </div>
      <div style="font-size:13px; color:#374151; margin-top:4px;">
        現在の出題範囲: <span id="folder-label"></span>
      </div>
      <div style="font-size:12px; color:#6b7280;">
        ※ 各階層で「すべて」を選ぶと、その階層以下の全問題が出題されます。<br>
        例：<code>電気電子計測工学II > 中間</code> を選ぶと、その配下（第一回・第二回…）がすべて出題されます。
      </div>
    </div>
  `;

  const lv1Sel = document.getElementById("cat-lv1");
  const lv2Sel = document.getElementById("cat-lv2");
  const lv3Sel = document.getElementById("cat-lv3");

  function fillLv1() {
    const lv1Keys = Object.keys(categoryTree).sort();
    let html = `<option value="">（すべて）</option>`;
    lv1Keys.forEach(k => {
      html += `<option value="${k}">${k}</option>`;
    });
    if (hasUnclassified) {
      html += `<option value="__UNCLASSIFIED__">未分類</option>`;
    }
    lv1Sel.innerHTML = html;
  }

  function fillLv2(parent) {
    if (!parent || !categoryTree[parent]) {
      lv2Sel.innerHTML = `<option value="">（すべて）</option>`;
      lv2Sel.disabled = !parent || parent === "__UNCLASSIFIED__";
      return;
    }
    const lv2Keys = Object.keys(categoryTree[parent]).sort();
    let html = `<option value="">（すべて）</option>`;
    lv2Keys.forEach(k => {
      html += `<option value="${k}">${k}</option>`;
    });
    lv2Sel.innerHTML = html;
    lv2Sel.disabled = false;
  }

  function fillLv3(parent1, parent2) {
    if (!parent1 || !parent2 || !categoryTree[parent1] || !categoryTree[parent1][parent2]) {
      lv3Sel.innerHTML = `<option value="">（すべて）</option>`;
      lv3Sel.disabled = !parent1 || parent1 === "__UNCLASSIFIED__";
      return;
    }
    const lv3Set = categoryTree[parent1][parent2];
    const lv3Keys = Array.from(lv3Set).sort();
    let html = `<option value="">（すべて）</option>`;
    lv3Keys.forEach(k => {
      html += `<option value="${k}">${k}</option>`;
    });
    lv3Sel.innerHTML = html;
    lv3Sel.disabled = false;
  }

  function recomputeSelection() {
    const v1 = lv1Sel.value;
    const v2 = lv2Sel.value;
    const v3 = lv3Sel.value;

    if (v1 === "__UNCLASSIFIED__") {
      selectedUnclassified = true;
      selectedCategoryPrefix = "";
      lv2Sel.disabled = true;
      lv3Sel.disabled = true;
    } else {
      selectedUnclassified = false;
      const parts = [];
      if (v1) parts.push(v1);
      if (v2) parts.push(v2);
      if (v3) parts.push(v3);
      selectedCategoryPrefix = parts.join(" > ");
    }
    updateFolderLabel();
  }

  fillLv1();
  fillLv2(null);
  fillLv3(null, null);

  lv1Sel.addEventListener("change", () => {
    const v1 = lv1Sel.value;
    if (v1 === "__UNCLASSIFIED__") {
      lv2Sel.value = "";
      lv3Sel.value = "";
      lv2Sel.disabled = true;
      lv3Sel.disabled = true;
    } else {
      fillLv2(v1);
      fillLv3(v1, "");
    }
    recomputeSelection();
  });

  lv2Sel.addEventListener("change", () => {
    const v1 = lv1Sel.value;
    const v2 = lv2Sel.value;
    fillLv3(v1, v2);
    recomputeSelection();
  });

  lv3Sel.addEventListener("change", () => {
    recomputeSelection();
  });

  // 初期状態：すべて
  lv1Sel.value = "";
  lv2Sel.value = "";
  lv3Sel.value = "";
  selectedCategoryPrefix = "";
  selectedUnclassified = false;
  updateFolderLabel();
}

/* ========= 出題開始 ========= */

async function startQuiz() {
  const res = await fetch("/api/questions");
  const data = await res.json();
  let base = data.questions || [];

  if (selectedUnclassified) {
    base = base.filter(q => !q.category);
  } else if (selectedCategoryPrefix) {
    base = base.filter(q => {
      const cat = q.category || "";
      return cat === selectedCategoryPrefix ||
             cat.startsWith(selectedCategoryPrefix + " > ");
    });
  }

  if (!base.length) {
    toast("選んだフォルダに問題がありません", "error", 4500);
    return;
  }

  // qtype 付きで準備
  questions = base.map(q => {
    const type = q.qtype || "single";
    const enriched = { ...q, qtype: type };
    if (type === "single" || type === "multi") {
      return withShuffledChoices(enriched);
    }
    return enriched;
  });

  i = 0;
  score = 0;
  wrongList = [];
  scoreBox.textContent = "";

  const label = selectedUnclassified
    ? "未分類"
    : (selectedCategoryPrefix || "すべて");

  document.getElementById("quiz-title").textContent = `出題中（${label}）`;

  show("quiz");
  render();
}

/* ========= 共通：文字列正規化 ========= */

function normalizeText(s) {
  return (s ?? "").toString().trim().replace(/\s+/g, "").toLowerCase();
}

/* ========= 出題画面の描画 ========= */

function render() {
  nextBtn.disabled = true;

  // 全問終了時
  if (i >= questions.length) {
    const total = questions.length;
    const resultText = `終了！スコア: ${score}/${total}`;

    toast(resultText, "success", 4500);

    quizBox.innerHTML = "";

    let html = `<p style="font-size:16px; margin-bottom:8px;">${resultText}</p>`;

    if (wrongList.length > 0) {
      html += `<h3 style="margin-top:12px; font-size:16px;">間違えた問題</h3>`;
      html += `<ol style="padding-left:20px; font-size:14px;">`;
      wrongList.forEach((w, idx) => {
        html += `
          <li style="margin-bottom:8px;">
            <div><strong>問題${idx + 1}:</strong> ${w.question}</div>
            <div>あなたの答え: ${w.yourAnswer || "（未入力）"}</div>
            <div>正解: ${w.correctAnswer}</div>
          </li>
        `;
      });
      html += `</ol>`;
    } else {
      html += `<p style="margin-top:8px; font-size:14px;">全問正解です！🎉</p>`;
    }

    html += `
      <div style="margin-top:16px;">
        <button id="retry-btn" class="btn btn-primary">同じ範囲でもう一度解く</button>
      </div>
    `;

    scoreBox.innerHTML = html;
    nextBtn.disabled = true;

    const retryBtn = document.getElementById("retry-btn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        i = 0;
        score = 0;
        wrongList = [];
        scoreBox.textContent = "";
        toast("同じ範囲で再スタートします", "success", 3000);
        render();
      });
    }
    return;
  }

  const q = questions[i];
  const type = q.qtype || "single";

  quizBox.innerHTML = `
    <div class="q" id="qtext"></div>
    <div id="choices"></div>
  `;

  const qtext = document.getElementById("qtext");
  const choicesDiv = document.getElementById("choices");

  renderRichText(qtext, q.text).then(() => {
    if (type === "single") {
      // 択一式：ラジオボタン
      choicesDiv.innerHTML = q.choices.map((c, idx) => `
        <label class="choice">
          <input type="radio" name="c" value="${idx}">
          <span id="choice_${idx}"></span>
        </label>
      `).join("");

      q.choices.forEach((c, idx) => {
        const span = document.getElementById(`choice_${idx}`);
        renderRichText(span, c);
      });

      choicesDiv.querySelectorAll('input[name="c"]').forEach(r => {
        r.addEventListener('change', () => { nextBtn.disabled = false; });
      });

      nextBtn.onclick = () => {
        const sel = document.querySelector('input[name="c"]:checked');
        if (!sel) return;
        const ans = parseInt(sel.value, 10);
        const correctIndex = q.answer;
        const correctText = q.choices[correctIndex];
        const yourText = q.choices[ans];

        if (ans === correctIndex) {
          score++;
          toast("正解！", "success", 4200);
        } else {
          const correct = DOMPurify.sanitize(correctText);
          wrongList.push({
            question: DOMPurify.sanitize(q.text || ""),
            yourAnswer: DOMPurify.sanitize(yourText || ""),
            correctAnswer: correct
          });
          toast(`不正解！ 正解は「${correct}」`, "error", 5000);
        }
        i++;
        render();
      };

    } else if (type === "multi") {
      // 複数選択式：チェックボックス
      choicesDiv.innerHTML = q.choices.map((c, idx) => `
        <label class="choice">
          <input type="checkbox" name="c" value="${idx}">
          <span id="choice_${idx}"></span>
        </label>
      `).join("");

      q.choices.forEach((c, idx) => {
        const span = document.getElementById(`choice_${idx}`);
        renderRichText(span, c);
      });

      const updateNextButton = () => {
        const anyChecked = choicesDiv.querySelectorAll('input[name="c"]:checked').length > 0;
        nextBtn.disabled = !anyChecked;
      };

      choicesDiv.querySelectorAll('input[name="c"]').forEach(r => {
        r.addEventListener('change', updateNextButton);
      });

      nextBtn.onclick = () => {
        const selected = Array.from(document.querySelectorAll('input[name="c"]:checked'))
          .map(el => parseInt(el.value, 10));
        const correctArr = Array.isArray(q.answers) ? q.answers : [];

        const selSorted = [...selected].sort((a, b) => a - b);
        const corSorted = [...correctArr].sort((a, b) => a - b);

        const isCorrect = JSON.stringify(selSorted) === JSON.stringify(corSorted);

        const yourText = selected.map(idx => q.choices[idx]).join(" / ");
        const correctText = correctArr.map(idx => q.choices[idx]).join(" / ");

        if (isCorrect) {
          score++;
          toast("正解！", "success", 4200);
        } else {
          const correct = DOMPurify.sanitize(correctText);
          wrongList.push({
            question: DOMPurify.sanitize(q.text || ""),
            yourAnswer: DOMPurify.sanitize(yourText || ""),
            correctAnswer: correct
          });
          toast(`不正解！ 正解は「${correct}」`, "error", 5000);
        }
        i++;
        render();
      };

    } else if (type === "text") {
      // 記述式（1つの解答）
      choicesDiv.innerHTML = `
        <input id="ans-text" type="text" class="text-answer-input"
               style="width:100%; padding:8px 10px; border-radius:10px; border:1px solid #d1d5db;"
               placeholder="解答を入力してください">
      `;
      const input = document.getElementById("ans-text");
      input.addEventListener("input", () => {
        nextBtn.disabled = !input.value.trim();
      });

      nextBtn.onclick = () => {
        const val = input.value.trim();
        const norm = normalizeText(val);
        const correctList = Array.isArray(q.answers) ? q.answers : [];
        const isCorrect = correctList.some(a => normalizeText(a) === norm);

        const correctText = correctList.join(" / ");

        if (isCorrect) {
          score++;
          toast("正解！", "success", 4200);
        } else {
          const correct = DOMPurify.sanitize(correctText);
          wrongList.push({
            question: DOMPurify.sanitize(q.text || ""),
            yourAnswer: DOMPurify.sanitize(val || ""),
            correctAnswer: correct
          });
          toast(`不正解！ 正解は「${correct}」`, "error", 5000);
        }
        i++;
        render();
      };

    } else if (type === "multi-text") {
      // 複数記述式（順不同で複数解答）
      const correctList = Array.isArray(q.answers) ? q.answers : [];
      const n = Math.max(correctList.length, 2);

      const inputsHtml = Array.from({ length: n }).map((_, idx) => `
        <div style="margin-bottom:6px;">
          <input type="text" class="multi-text-input"
                 placeholder="解答${idx + 1}"
                 style="width:100%; padding:8px 10px; border-radius:10px; border:1px solid #d1d5db;">
        </div>
      `).join("");

      choicesDiv.innerHTML = inputsHtml;

      const inputs = Array.from(document.querySelectorAll(".multi-text-input"));
      const updateNextButton = () => {
        const anyFilled = inputs.some(el => el.value.trim());
        nextBtn.disabled = !anyFilled;
      };
      inputs.forEach(el => el.addEventListener("input", updateNextButton));

      nextBtn.onclick = () => {
        const userValsRaw = inputs.map(el => el.value.trim()).filter(v => v);
        const userNorm = userValsRaw.map(normalizeText);

        const correctNorm = correctList.map(normalizeText);

        let isCorrect = false;
        if (userNorm.length === correctNorm.length) {
          const sortedUser = [...userNorm].sort();
          const sortedCorrect = [...correctNorm].sort();
          isCorrect = JSON.stringify(sortedUser) === JSON.stringify(sortedCorrect);
        }

        const yourText = userValsRaw.join(" / ");
        const correctText = correctList.join(" / ");

        if (isCorrect) {
          score++;
          toast("正解！", "success", 4200);
        } else {
          const correct = DOMPurify.sanitize(correctText);
          wrongList.push({
            question: DOMPurify.sanitize(q.text || ""),
            yourAnswer: DOMPurify.sanitize(yourText || ""),
            correctAnswer: correct
          });
          toast(`不正解！ 正解は「${correct}」`, "error", 5000);
        }
        i++;
        render();
      };
    }
  });
}

/* ========= イベント登録 ========= */

if (titleBtn) {
  titleBtn.onclick = () => {
    show("title");
    scoreBox.textContent = "";
  };
}
if (startBtn) {
  startBtn.onclick = startQuiz;
}

(async () => {
  await loadCategories();  // フォルダ選択UIを構築
  show("title");
})();
