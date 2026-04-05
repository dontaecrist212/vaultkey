from flask import Flask, request, jsonify, send_from_directory, session
import sqlite3
import hashlib
import secrets
import os
from functools import wraps

app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('SECRET_KEY', 'vaultkey2026secure')
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'passwords.db')

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = sqlite3.connect(DB)
    conn.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS passwords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        site TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        notes TEXT DEFAULT '',
        category TEXT DEFAULT 'General',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    conn.commit()
    conn.close()

init_db()

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Not logged in'}), 401
        return f(*args, **kwargs)
    return decorated

def hash_password(password, salt):
    return hashlib.sha256((password + salt).encode()).hexdigest()

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/me', methods=['GET'])
def me():
    if 'user_id' in session:
        return jsonify({'username': session['username'], 'logged_in': True})
    return jsonify({'logged_in': False})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    salt = secrets.token_hex(16)
    pw_hash = hash_password(password, salt)
    try:
        conn = sqlite3.connect(DB)
        conn.execute("INSERT INTO users (username, password_hash, salt) VALUES (?,?,?)",
                    (username, pw_hash, salt))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Account created!'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already taken'}), 400

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    user = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    conn.close()
    if not user:
        return jsonify({'error': 'Invalid username or password'}), 401
    pw_hash = hash_password(password, user['salt'])
    if pw_hash != user['password_hash']:
        return jsonify({'error': 'Invalid username or password'}), 401
    session['user_id'] = user['id']
    session['username'] = user['username']
    return jsonify({'message': 'Logged in!', 'username': user['username']})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out!'})

@app.route('/api/passwords', methods=['GET'])
@login_required
def get_passwords():
    search = request.args.get('search', '').lower()
    category = request.args.get('category', '')
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    query = "SELECT id, site, username, notes, category, created_at FROM passwords WHERE user_id=?"
    params = [session['user_id']]
    if search:
        query += " AND (LOWER(site) LIKE ? OR LOWER(username) LIKE ?)"
        params += [f'%{search}%', f'%{search}%']
    if category and category != 'All':
        query += " AND category=?"
        params.append(category)
    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/passwords/<int:pid>', methods=['GET'])
@login_required
def get_password(pid):
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM passwords WHERE id=? AND user_id=?",
                      (pid, session['user_id'])).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(dict(row))

@app.route('/api/passwords', methods=['POST'])
@login_required
def add_password():
    data = request.json
    if not data.get('site') or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Site, username, and password are required'}), 400
    conn = sqlite3.connect(DB)
    conn.execute(
        "INSERT INTO passwords (user_id, site, username, password, notes, category) VALUES (?,?,?,?,?,?)",
        (session['user_id'], data['site'], data['username'], data['password'],
         data.get('notes', ''), data.get('category', 'General'))
    )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Password saved!'}), 201

@app.route('/api/passwords/<int:pid>', methods=['PUT'])
@login_required
def update_password(pid):
    data = request.json
    conn = sqlite3.connect(DB)
    conn.execute(
        "UPDATE passwords SET site=?, username=?, password=?, notes=?, category=? WHERE id=? AND user_id=?",
        (data['site'], data['username'], data['password'],
         data.get('notes', ''), data.get('category', 'General'), pid, session['user_id'])
    )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Updated!'})

@app.route('/api/passwords/<int:pid>', methods=['DELETE'])
@login_required
def delete_password(pid):
    conn = sqlite3.connect(DB)
    conn.execute("DELETE FROM passwords WHERE id=? AND user_id=?", (pid, session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Deleted!'})

if __name__ == '__main__':
    print("\n✅ Password Manager running at http://localhost:5000\n")
    app.run(debug=True, port=5000)