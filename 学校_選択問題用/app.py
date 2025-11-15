from flask import (
    Flask, render_template, request, jsonify,
    redirect, url_for, session, flash, make_response
)
import json
import os
from functools import wraps

app = Flask(__name__)

# セッションキー（好きに変えてOK）
app.secret_key = "your_super_secret_key_92389293"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_QUESTIONS = os.path.join(BASE_DIR, "questions.json")
DATA_USERS = os.path.join(BASE_DIR, "users.json")
DATA_INVITE = os.path.join(BASE_DIR, "invite_codes.json")

# デフォルトの紹介コード（管理者が後で変更可能）
DEFAULT_INVITE_CODE = "RYUKYU2025"


# =======================================================
# util: ファイル読み込み・保存
# =======================================================

def load_json(path, default):
    if not os.path.exists(path):
        save_json(path, default)
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# =======================================================
# ユーザー管理
# =======================================================

def load_users():
    data = load_json(DATA_USERS, {
        "users": [
            {"username": "e235332G", "password": "1213", "is_admin": False},
            {"username": "souma", "password": "Ksou1213", "is_admin": True}
        ]
    })
    return data["users"]


def save_users(users):
    save_json(DATA_USERS, {"users": users})


def find_user(username):
    for u in load_users():
        if u["username"] == username:
            return u
    return None


def get_current_username():
    return session.get("username")


def get_current_user():
    name = get_current_username()
    if not name:
        return None
    return find_user(name)


# =======================================================
# 紹介コード管理
# =======================================================

def load_invite_code():
    data = load_json(DATA_INVITE, {"invite_code": DEFAULT_INVITE_CODE})
    return data.get("invite_code", DEFAULT_INVITE_CODE)


def save_invite_code(code):
    save_json(DATA_INVITE, {"invite_code": code})


# =======================================================
# コンテキストプロセッサ（テンプレートに current_user を渡す）
# =======================================================

@app.context_processor
def inject_current_user():
    user = get_current_user() or {}
    return {
        "current_user": {
            "username": user.get("username"),
            "is_admin": user.get("is_admin", False)
        }
    }


# =======================================================
# デコレータ
# =======================================================

def require_invited(f):
    """紹介コード通過済みか確認"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        # Cookie に保存されている
        if request.cookies.get("invited_ok") == "1":
            return f(*args, **kwargs)
        # セッションに保存されている
        if session.get("invited"):
            return f(*args, **kwargs)
        return redirect(url_for("gate"))
    return wrapper


def login_required(f):
    """ログインしていなければ /login へ"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "username" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    """管理者専用"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user or not user.get("is_admin"):
            flash("管理者のみアクセスできます", "error")
            return redirect(url_for("quiz"))
        return f(*args, **kwargs)
    return wrapper


# =======================================================
# 招待コードゲート
# =======================================================

@app.route("/gate", methods=["GET", "POST"])
def gate():
    error = None
    invite_code = load_invite_code()

    if request.method == "POST":
        code = (request.form.get("code") or "").strip()

        if code == invite_code:
            session["invited"] = True

            resp = make_response(redirect(url_for("login")))
            resp.set_cookie(
                "invited_ok", "1",
                max_age=60 * 60 * 24 * 365  # 1年
            )
            return resp
        else:
            error = "紹介コードが違います。"

    return render_template("gate.html", error=error)


# =======================================================
# ログイン / ログアウト / 新規登録
# =======================================================

@app.route("/login", methods=["GET", "POST"])
@require_invited
def login():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = (request.form.get("password") or "").strip()

        user = find_user(username)

        if not user or user["password"] != password:
            flash("ユーザー名またはパスワードが間違っています。", "error")
            return render_template("login.html")

        # ログイン成功
        session["username"] = username
        flash("ログインしました。", "success")

        # 管理者なら管理メニューへ
        if user.get("is_admin"):
            return redirect(url_for("admin_menu"))

        # 一般ユーザーはクイズ画面へ
        return redirect(url_for("quiz"))

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.pop("username", None)
    flash("ログアウトしました。", "success")
    return redirect(url_for("login"))


@app.route("/register", methods=["GET", "POST"])
@require_invited
def register():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = (request.form.get("password") or "").strip()

        if not username or not password:
            flash("すべての項目を入力してください。", "error")
            return render_template("register.html")

        users = load_users()

        if any(u["username"] == username for u in users):
            flash("そのユーザー名は既に使われています。", "error")
            return render_template("register.html")

        users.append({
            "username": username,
            "password": password,
            "is_admin": False
        })
        save_users(users)

        flash("登録完了！ ログインしてください。", "success")
        return redirect(url_for("login"))

    return render_template("register.html")


# =======================================================
#  画面遷移（トップ / クイズ / 管理者メニュー）
# =======================================================

@app.route("/")
def root():
    # 紹介コード通過していない
    if request.cookies.get("invited_ok") != "1" and not session.get("invited"):
        return redirect(url_for("gate"))

    # ログインしていない
    if "username" not in session:
        return redirect(url_for("login"))

    # 管理者ならメニューへ
    user = get_current_user()
    if user and user.get("is_admin"):
        return redirect(url_for("admin_menu"))

    return redirect(url_for("quiz"))


@app.route("/quiz")
@require_invited
@login_required
def quiz():
  return render_template("index.html")


# ★★★ ここが変更ポイント ★★★
# 以前は @admin_required が付いていたが、外している
@app.route("/admin")
@require_invited
@login_required
def admin():
    return render_template("admin.html")


# 管理者トップメニュー
@app.route("/admin/menu")
@require_invited
@login_required
@admin_required
def admin_menu():
    return render_template("menu.html")


# 管理者ページ（ユーザー一覧・カテゴリ一覧・紹介コード）表示用
@app.route("/admin/users")
@require_invited
@login_required
@admin_required
def admin_users_page():
    return render_template("admin_users.html")


@app.route("/admin/user_categories")
@require_invited
@login_required
@admin_required
def admin_categories_page():
    return render_template("admin_user_categories.html")


@app.route("/admin/invite")
@require_invited
@login_required
@admin_required
def admin_invite_page():
    return render_template("admin_invite.html")


# =======================================================
#  問題データ管理
# =======================================================

def load_questions_raw():
    return load_json(DATA_QUESTIONS, {"questions": []})


def save_questions_raw(obj):
    save_json(DATA_QUESTIONS, obj)


# =======================================================
# API：一般ユーザー用（自分の問題だけ）
# =======================================================

@app.get("/api/questions")
@require_invited
@login_required
def api_list():
    current = get_current_username()
    raw = load_questions_raw()["questions"]

    # owner が自分のもののみ
    qs = [q for q in raw if q.get("owner") == current]

    # カテゴリ絞り込み
    category = request.args.get("category")
    if category:
        if category == "未分類":
            qs = [q for q in qs if not q.get("category")]
        elif category != "すべて":
            qs = [q for q in qs if q.get("category") == category]

    return jsonify({"questions": qs})


@app.get("/api/questions/<int:id>")
@require_invited
@login_required
def api_get(id):
    current = get_current_username()
    for q in load_questions_raw()["questions"]:
        if q.get("id") == id and q.get("owner") == current:
            return jsonify(q)
    return "", 404


@app.post("/api/questions")
@require_invited
@login_required
def api_add():
    current = get_current_username()
    raw = load_questions_raw()
    data = raw["questions"]

    body = request.json
    new_id = max([q.get("id", 0) for q in data], default=0) + 1

    # 新規問題作成
    body["id"] = new_id
    body["owner"] = current

    data.append(body)
    save_questions_raw({"questions": data})

    return jsonify({"ok": True, "id": new_id})


@app.put("/api/questions/<int:id>")
@require_invited
@login_required
def api_update(id):
    current = get_current_username()
    raw = load_questions_raw()
    data = raw["questions"]
    body = request.json

    updated = False
    for i, q in enumerate(data):
        if q.get("id") == id and q.get("owner") == current:
            body["id"] = id
            body["owner"] = current
            data[i] = body
            updated = True
            break

    if not updated:
        return "", 404

    save_questions_raw({"questions": data})
    return jsonify({"ok": True})


@app.delete("/api/questions/<int:id>")
@require_invited
@login_required
def api_delete(id):
    current = get_current_username()
    data = load_questions_raw()["questions"]

    new_data = [
        q for q in data
        if not (q.get("id") == id and q.get("owner") == current)
    ]

    save_questions_raw({"questions": new_data})
    return jsonify({"ok": True})


# =======================================================
# API：カテゴリ一覧（ユーザー別）
# =======================================================

@app.get("/api/categories")
@require_invited
@login_required
def api_categories():
    current = get_current_username()
    qs = load_questions_raw()["questions"]

    my_qs = [q for q in qs if q.get("owner") == current]

    cats = {"すべて"}
    has_un = False

    for q in my_qs:
        cat = q.get("category")
        if cat:
            cats.add(cat)
        else:
            has_un = True

    if has_un:
        cats.add("未分類")

    return jsonify({"categories": sorted(cats)})


# =======================================================
# 管理者用 API（1. 全ユーザー管理 / 2. 全問題管理）
# =======================================================

# 1️⃣ 全ユーザー一覧
@app.get("/api/admin/users")
@require_invited
@login_required
@admin_required
def admin_get_users():
    return jsonify({"users": load_users()})


# 2️⃣ 特定ユーザーの問題一覧
@app.get("/api/admin/user_questions/<username>")
@require_invited
@login_required
@admin_required
def admin_get_user_questions(username):
    qs = load_questions_raw()["questions"]
    user_qs = [q for q in qs if q.get("owner") == username]
    return jsonify({"questions": user_qs})


# 3️⃣ ユーザー削除
@app.delete("/api/admin/users/<username>")
@require_invited
@login_required
@admin_required
def admin_delete_user(username):
    users = load_users()
    users = [u for u in users if u["username"] != username]
    save_users(users)

    # ついでに問題も削除
    qs = load_questions_raw()["questions"]
    qs = [q for q in qs if q.get("owner") != username]
    save_questions_raw({"questions": qs})

    return jsonify({"ok": True})


# 4️⃣ 管理者付与 / 削除
@app.post("/api/admin/toggle_admin/<username>")
@require_invited
@login_required
@admin_required
def admin_toggle_admin(username):
    users = load_users()
    for u in users:
        if u["username"] == username:
            u["is_admin"] = not u.get("is_admin", False)
    save_users(users)

    return jsonify({"ok": True})


# =======================================================
# 管理者：カテゴリ全体の統合管理
# =======================================================

@app.get("/api/admin/categories")
@require_invited
@login_required
@admin_required
def admin_categories():
    qs = load_questions_raw()["questions"]

    cats = set()
    for q in qs:
        if q.get("category"):
            cats.add(q["category"])

    return jsonify({"categories": sorted(cats)})


@app.post("/api/admin/categories/rename")
@require_invited
@login_required
@admin_required
def admin_category_rename():
    old = request.json.get("old")
    new = request.json.get("new")

    qs = load_questions_raw()["questions"]
    for q in qs:
        if q.get("category") == old:
            q["category"] = new

    save_questions_raw({"questions": qs})
    return jsonify({"ok": True})


@app.post("/api/admin/categories/delete")
@require_invited
@login_required
@admin_required
def admin_category_delete():
    target = request.json.get("category")

    qs = load_questions_raw()["questions"]
    for q in qs:
        if q.get("category") == target:
            q["category"] = ""  # 未分類へ

    save_questions_raw({"questions": qs})
    return jsonify({"ok": True})


# =======================================================
# 管理者：紹介コード管理
# =======================================================

@app.get("/api/admin/invite")
@require_invited
@login_required
@admin_required
def admin_invite_get():
    return jsonify({"invite_code": load_invite_code()})


@app.post("/api/admin/invite")
@require_invited
@login_required
@admin_required
def admin_invite_set():
    code = request.json.get("invite_code")
    save_invite_code(code)
    return jsonify({"ok": True})


# =======================================================
# エラーハンドラ & 起動
# =======================================================

@app.errorhandler(404)
def not_found(e):
    return "<h1>404 - ページがありません</h1>", 404


@app.errorhandler(500)
def server_error(e):
    return "<h1>500 - サーバーエラー</h1>", 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
