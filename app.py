from flask import Flask, request, jsonify, send_from_directory, session
import hashlib
import secrets
import os
from functools import wraps
import psycopg2
from psycopg2.extras import RealDictCursor
from cryptography.fernet import Fernet
import base64
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('SECRET_KEY', 'vaultkey2026secure')
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'

DATABASE_URL = os.environ.get('DATABASE_URL')

def get_fernet():
    key = os.environ.get('SECRET_KEY', 'vaultkey2026secure')
    key_bytes = hashlib.sha256(key.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)

def encrypt_password(password):
    f = get_fernet()
    return f.encrypt(password.encode()).decode()

def decrypt_password(encrypted):
    try:
        f = get_fernet()
        return f.decrypt(encrypted.encode()).decode()
    except:
        return encrypted

def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        failed_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP")
    cur.execute('''CREATE TABLE IF NOT EXISTS passwords (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        site TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        notes TEXT DEFAULT '',
        category TEXT DEFAULT 'General',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    conn.commit()
    cur.close()
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
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT INTO users (username, password_hash, salt) VALUES (%s,%s,%s)",
                   (username, pw_hash, salt))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'message': 'Account created!'}), 201
    except Exception as e:
        return jsonify({'error': 'Username already taken'}), 400

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username=%s", (username,))
    user = cur.fetchone()

    if not user:
        cur.close()
        conn.close()
        return jsonify({'error': 'Invalid username or password'}), 401

    locked_until = user.get('locked_until')
    if locked_until and locked_until > datetime.utcnow():
        cur.close()
        conn.close()
        return jsonify({'error': 'Account locked due to too many failed attempts. Try again in 15 minutes.'}), 429

    pw_hash = hash_password(password, user['salt'])
    if pw_hash != user['password_hash']:
        new_attempts = (user.get('failed_attempts') or 0) + 1
        if new_attempts >= 5:
            lock_until = datetime.utcnow() + timedelta(minutes=15)
            cur.execute("UPDATE users SET failed_attempts=%s, locked_until=%s WHERE id=%s",
                       (new_attempts, lock_until, user['id']))
            conn.commit()
            cur.close()
            conn.close()
            return jsonify({'error': 'Too many failed attempts. Account locked for 15 minutes.'}), 429
        else:
            cur.execute("UPDATE users SET failed_attempts=%s WHERE id=%s", (new_attempts, user['id']))
            conn.commit()
            cur.close()
            conn.close()
            remaining = 5 - new_attempts
            return jsonify({'error': f'Invalid password. {remaining} attempts remaining.'}), 401

    cur.execute("UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=%s", (user['id'],))
    conn.commit()
    cur.close()
    conn.close()
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
    conn = get_db()
    cur = conn.cursor()
    query = "SELECT id, site, username, notes, category, created_at FROM passwords WHERE user_id=%s"
    params = [session['user_id']]
    if search:
        query += " AND (LOWER(site) LIKE %s OR LOWER(username) LIKE %s)"
        params += [f'%{search}%', f'%{search}%']
    if category and category != 'All':
        query += " AND category=%s"
        params.append(category)
    query += " ORDER BY created_at DESC"
    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/passwords/<int:pid>', methods=['GET'])
@login_required
def get_password(pid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM passwords WHERE id=%s AND user_id=%s", (pid, session['user_id']))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    row = dict(row)
    row['password'] = decrypt_password(row['password'])
    return jsonify(row)

@app.route('/api/passwords', methods=['POST'])
@login_required
def add_password():
    data = request.json
    if not data.get('site') or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Site, username, and password are required'}), 400
    encrypted = encrypt_password(data['password'])
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO passwords (user_id, site, username, password, notes, category) VALUES (%s,%s,%s,%s,%s,%s)",
        (session['user_id'], data['site'], data['username'], encrypted,
         data.get('notes', ''), data.get('category', 'General'))
    )
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': 'Password saved!'}), 201

@app.route('/api/passwords/<int:pid>', methods=['PUT'])
@login_required
def update_password(pid):
    data = request.json
    encrypted = encrypt_password(data['password'])
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE passwords SET site=%s, username=%s, password=%s, notes=%s, category=%s WHERE id=%s AND user_id=%s",
        (data['site'], data['username'], encrypted,
         data.get('notes', ''), data.get('category', 'General'), pid, session['user_id'])
    )
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': 'Updated!'})

@app.route('/api/passwords/<int:pid>', methods=['DELETE'])
@login_required
def delete_password(pid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM passwords WHERE id=%s AND user_id=%s", (pid, session['user_id']))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': 'Deleted!'})

if __name__ == '__main__':
    print("\n✅ Password Manager running at http://localhost:5000\n")
    app.run(debug=True, port=5000)
