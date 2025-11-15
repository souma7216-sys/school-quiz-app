// ===============================
// 管理者：ユーザー別問題一覧ページ
// ===============================

// HTML が読み込まれたら実行
window.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("admin-user-select")) {
    loadUsers();
  }
});

// ---------------------------------
// ユーザー一覧を取得
// ---------------------------------
async function loadUsers() {
  const sel = document.getElementById("admin-user-select");
  const list = document.getElementById("admin-user-question-list");

  sel.innerHTML = `<option value="">選択してください</option>`;
  list.innerHTML = `<tr><td colspan="4">ユーザーを選択してください</td></tr>`;

  try {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    const users = data.users || [];

    users.forEach(u => {
      sel.innerHTML += `<option value="${u.username}">${u.username}</option>`;
    });

    sel.addEventListener("change", () => {
      const u = sel.value;
      if (u) {
        loadQuestionsByUser(u);
      } else {
        list.innerHTML = `<tr><td colspan="4">ユーザーを選択してください</td></tr>`;
      }
    });

  } catch (e) {
    console.error(e);
    list.innerHTML = `<tr><td colspan="4">読み込みエラー</td></tr>`;
  }
}

// ---------------------------------
// 指定ユーザーの問題一覧取得
// ---------------------------------
async function loadQuestionsByUser(username) {
  const list = document.getElementById("admin-user-question-list");
  list.innerHTML = `<tr><td colspan="4">読み込み中...</td></tr>`;

  try {
    const res = await fetch(`/api/admin/questions?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    const qs = data.questions || [];

    if (!qs.length) {
      list.innerHTML = `<tr><td colspan="4">問題はありません</td></tr>`;
      return;
    }

    list.innerHTML = qs.map(q => `
      <tr>
        <td>${q.id}</td>
        <td>${q.text.slice(0, 40)}${q.text.length > 40 ? "…" : ""}</td>
        <td>${q.category || "未分類"}</td>
        <td>${q.owner}</td>
      </tr>
    `).join("");

  } catch (e) {
    console.error(e);
    list.innerHTML = `<tr><td colspan="4">取得エラー</td></tr>`;
  }
}
