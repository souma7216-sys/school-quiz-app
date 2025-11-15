from flask import (
    Flask, render_template, request, jsonify,
    redirect, url_for, session, flash, make_response
)
import json
import os
from functools import wraps

app = Flask(__name__)

# 🔐 セッション用キー
app.secret_key = "your_super_secret_key_92389293"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_QUESTIONS = os.path.join(BASE_DIR, "questions.json")
DATA_USERS = os.path.join(BASE_DIR, "users.json")

# 🔑 招待コード
INVITE_CODE = "RYUKYU2025"


# =========================================
#  ユーザー管理
# =========================================
def load_users():
    if not os.path.exists(DATA_USERS):
        users = {
            "users": [
                {
                    "username": "e235332G",
                    "password": "1213",
                    "is_admin": False
                },
                {
                    "username": "souma",
                    "password": "Ksou1213",
                    "is_admin": True
                }
            ]
        }
        with open(DATA_USERS, "w", encoding="utf-8") as f:
            json.dump(users, f, ensure_ascii=False, indent=2)
        return users["users"]

    with open(DATA_USERS, "r", encoding="utf-8") as f:
        raw = json.load(f)

    if isinstance(raw, dict) and "users" in raw:
        return raw["users"]

    return []


def save_users(users):
    with open(DATA_USERS, "w", encoding="utf-8") as f:
        json.dump({"users": users}, f, ensure_ascii=False, indent=2)


def find_user(username):
    for u in load_users():
        if u["username"] == username:
            return u
    return None


def get_current_username():
    return session.get("username")


def get_current_user():
    user = get_current_username()
    if not user:
        return None
    return find_user(user)


# =========================================
#  問題データ管理
# =========================================
def load_questions_raw():
    if not os.path.exists(DATA_QUESTIONS):
        return {"questions": []}
    with open(DATA_QUESTIONS, "r", encoding="utf-8") as f:
        raw = json.load(f)
    if isinstance(raw, dict):
        return raw
    return {"questions": raw}


def save_questions_raw(obj):
    with open(DATA_QUESTIONS, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


# =========================================
#  デコレータ
# =========================================
def require_invited(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        # Cookie or セッションチェック
        if request.cookies.get("invited_ok") == "1":
            return f(*args, **kwargs)

        if session.get("invited"):
            return f(*args, **kwargs)

        return redirect(url_for("gate"))
    return wrapper


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "username" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user or not user.get("is_admin"):
            flash("管理者のみアクセスできます", "error")
            return redirect(url_for("quiz"))
        return f(*args, **kwargs)
    return wrapper


# =========================================
#  紹介コードゲート
# =========================================
@app.route("/gate", methods=["GET", "POST"])
def gate():
    error = None
    if request.method == "POST":
        code = (request.form.get("code") or "").strip()
        if code == INVITE_CODE:
            session["invited"] = True

            resp = make_response(redirect(url_for("login")))
            resp.set_cookie("invited_ok", "1",
                            max_age=60 * 60 * 24 * 365)  # 有効 1年
            return resp
        else:
            error = "紹介コードが違います。"

    return render_template("gate.html", error=error)


# =========================================
#  ログイン / ログアウト / 新規登録
# =========================================
@app.route("/login", methods=["GET", "POST"])
@require_invited
def login():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = (request.form.get("password") or "").strip()

        user = find_user(username)

        if not user or user["password"] != password:
            flash("ユーザー名またはパスワードが違います。", "error")
            return render_template("login.html")

        session["username"] = username
        flash("ログインしました。", "success")
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
            flash("すべて入力してください", "error")
            return render_template("register.html")

        users = load_users()

        if any(u["username"] == username for u in users):
            flash("そのユーザー名は既に使われています", "error")
            return render_template("register.html")

        users.append({
            "username": username,
            "password": password,
            "is_admin": False
        })
        save_users(users)
        flash("登録完了。ログインしてください", "success")
        return redirect(url_for("login"))

    return render_template("register.html")


# =========================================
#  画面
# =========================================
@app.route("/")
def root():
    if request.cookies.get("invited_ok") == "1":
        if "username" in session:
            return redirect(url_for("quiz"))
        return redirect(url_for("login"))

    return redirect(url_for("gate"))


@app.route("/quiz")
@require_invited
@login_required
def quiz():
    return render_template("index.html")


@app.route("/admin")
@require_invited
@login_required
@admin_required
def admin():
    return render_template("admin.html")


# =========================================
#  管理者: ユーザー別問題一覧画面
# =========================================
@app.route("/admin/user_questions")
@require_invited
@login_required
@admin_required
def admin_user_questions():
    return render_template("admin_user_questions.html")


# =========================================
#  API（ユーザー別）
# =========================================
@app.get("/api/questions")
@require_invited
@login_required
def api_list():
    current = get_current_username()
    raw = load_questions_raw()["questions"]

    qs = [q for q in raw if q.get("owner") == current]

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
        if q.get("owner") == current and q.get("id") == id:
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

    new_data = [q for q in data if not (q.get("id") == id and q.get("owner") == current)]

    save_questions_raw({"questions": new_data})
    return jsonify({"ok": True})


# =========================================
#  管理者 API（ユーザー別）
# =========================================
@app.get("/api/admin/users")
@require_invited
@login_required
@admin_required
def api_admin_users():
    users = load_users()
    user_list = [{"username": u["username"], "is_admin": u["is_admin"]} for u in users]
    return jsonify({"users": user_list})


@app.get("/api/admin/questions")
@require_invited
@login_required
@admin_required
def api_admin_questions():
    username = request.args.get("username")
    raw = load_questions_raw()["questions"]

    qs = [q for q in raw if q.get("owner") == username]

    return jsonify({"questions": qs})


if __name__ == "__main__":
    app.run(debug=True)
