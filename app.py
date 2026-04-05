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
import pyotp
import qrcode
import io

app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('SECRET_KEY', 'vaultkey2026secure')
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_HTTPONLY'] = True

DATABASE_URL = os.environ.get('DATABASE_URL')

def get_fernet():
    key = os.environ.get('SECRET_KEY', 'vaultkey2026secure')
    key_bytes = hashlib.sha256(key.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)

def encrypt_password(password):
    return get_fernet().encrypt(password.encode()).decode()

def decrypt_password(encrypted):
    try:
        return get_fernet().decrypt(encrypted.encode()).decode()
    except:
        return encrypted

def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        security_question TEXT,
        security_answer TEXT,
        failed_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        mfa_secret TEXT,
        mfa_enabled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question TEXT")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer TEXT")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE")
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

# ── Security headers applied to every response ───────────────────────────────
@app.after_request
def add_security_headers(response):
    # CSP — fixes the -25 point penalty; allows fonts, inline styles, HIBP API
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self' https://api.pwnedpasswords.com; "
        "frame-ancestors 'none';"
    )
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response
# ─────────────────────────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Not logged in'}), 401
        return f(*args, **kwargs)
    return decorated

def hash_password(password, salt):
    return hashlib.sha256((password + salt).encode()).hexdigest()

def hash_answer(answer):
    return hashlib.sha256(answer.lower().strip().encode()).hexdigest()

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
    security_question = data.get('security_question', '').strip()
    security_answer = data.get('security_answer', '').strip()
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    if not security_question or not security_answer:
        return jsonify({'error': 'Security question and answer required'}), 400
    salt = secrets.token_hex(16)
    pw_hash = hash_password(password, salt)
    answer_hash = hash_answer(security_answer)
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT INTO users (username, password_hash, salt, security_question, security_answer) VALUES (%s,%s,%s,%s,%s)",
                   (username, pw_hash, salt, security_question, answer_hash))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'message': 'Account created!'}), 201
    except:
        return jsonify({'error': 'Username already taken'}), 400

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE LOWER(username)=LOWER(%s)", (username,))
    user = cur.fetchone()
    if not user:
        cur.close(); conn.close()
        return jsonify({'error': 'Invalid username or password'}), 401
    locked_until = user.get('locked_until')
    if locked_until and locked_until > datetime.utcnow():
        cur.close(); conn.close()
        return jsonify({'error': 'Account locked. Try again in 15 minutes.'}), 429
    pw_hash = hash_password(password, user['salt'])
    if pw_hash != user['password_hash']:
        new_attempts = (user.get('failed_attempts') or 0) + 1
        if new_attempts >= 5:
            lock_until = datetime.utcnow() + timedelta(minutes=15)
            cur.execute("UPDATE users SET failed_attempts=%s, locked_until=%s WHERE id=%s", (new_attempts, lock_until, user['id']))
        else:
            cur.execute("UPDATE users SET failed_attempts=%s WHERE id=%s", (new_attempts, user['id']))
        conn.commit(); cur.close(); conn.close()
        remaining = max(0, 5 - new_attempts)
        return jsonify({'error': f'Invalid password. {remaining} attempts remaining.'}), 401
    cur.execute("UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=%s", (user['id'],))
    conn.commit(); cur.close(); conn.close()
    if user.get('mfa_enabled'):
        session['mfa_pending_user_id'] = user['id']
        session['mfa_pending_username'] = user['username']
        return jsonify({'mfa_required': True})
    session['user_id'] = user['id']
    session['username'] = user['username']
    return jsonify({'message': 'Logged in!', 'username': user['username']})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out'})

@app.route('/api/verify-mfa', methods=['POST'])
def verify_mfa():
    data = request.json
    code = data.get('code', '').strip()
    if 'mfa_pending_user_id' not in session:
        return jsonify({'error': 'No MFA pending'}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT mfa_secret, username FROM users WHERE id=%s", (session['mfa_pending_user_id'],))
    user = cur.fetchone()
    cur.close(); conn.close()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    totp = pyotp.TOTP(user['mfa_secret'])
    if not totp.verify(code, valid_window=1):
        return jsonify({'error': 'Invalid MFA code'}), 401
    session['user_id'] = session.pop('mfa_pending_user_id')
    session['username'] = session.pop('mfa_pending_username')
    return jsonify({'message': 'Logged in!', 'username': session['username']})

@app.route('/api/setup-mfa', methods=['POST'])
@login_required
def setup_mfa():
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    username = session['username']
    provisioning_uri = totp.provisioning_uri(name=username, issuer_name='VaultKey')
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    qr_b64 = base64.b64encode(buf.read()).decode()
    session['mfa_setup_secret'] = secret
    return jsonify({'qr_code': qr_b64, 'secret': secret})

@app.route('/api/confirm-mfa', methods=['POST'])
@login_required
def confirm_mfa():
    data = request.json
    code = data.get('code', '').strip()
    secret = session.get('mfa_setup_secret')
    if not secret:
        return jsonify({'error': 'No MFA setup in progress'}), 400
    totp = pyotp.TOTP(secret)
    if not totp.verify(code, valid_window=1):
        return jsonify({'error': 'Invalid code. Try again.'}), 401
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET mfa_secret=%s, mfa_enabled=TRUE WHERE id=%s", (secret, session['user_id']))
    conn.commit(); cur.close(); conn.close()
    session.pop('mfa_setup_secret', None)
    return jsonify({'message': 'MFA enabled successfully!'})

@app.route('/api/disable-mfa', methods=['POST'])
@login_required
def disable_mfa():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET mfa_secret=NULL, mfa_enabled=FALSE WHERE id=%s", (session['user_id'],))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'MFA disabled'})

@app.route('/api/get-security-question', methods=['POST'])
def get_security_question():
    data = request.json
    username = data.get('username', '').strip()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT security_question FROM users WHERE LOWER(username)=LOWER(%s)", (username,))
    user = cur.fetchone()
    cur.close(); conn.close()
    if not user or not user['security_question']:
        return jsonify({'error': 'Username not found'}), 404
    return jsonify({'security_question': user['security_question']})

@app.route('/api/reset-password', methods=['POST'])
def reset_password():
    data = request.json
    username = data.get('username', '').strip()
    security_answer = data.get('security_answer', '').strip()
    new_password = data.get('new_password', '')
    if not username or not security_answer or not new_password:
        return jsonify({'error': 'All fields required'}), 400
    if len(new_password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE LOWER(username)=LOWER(%s)", (username,))
    user = cur.fetchone()
    if not user:
        cur.close(); conn.close()
        return jsonify({'error': 'Username not found'}), 404
    if hash_answer(security_answer) != user['security_answer']:
        cur.close(); conn.close()
        return jsonify({'error': 'Incorrect security answer'}), 401
    new_salt = secrets.token_hex(16)
    new_hash = hash_password(new_password, new_salt)
    cur.execute("UPDATE users SET password_hash=%s, salt=%s, failed_attempts=0, locked_until=NULL WHERE id=%s",
               (new_hash, new_salt, user['id']))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'Password reset successfully!'})

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
    cur.close(); conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/passwords/<int:pid>', methods=['GET'])
@login_required
def get_password(pid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM passwords WHERE id=%s AND user_id=%s", (pid, session['user_id']))
    row = cur.fetchone()
    cur.close(); conn.close()
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
        return jsonify({'error': 'All fields required'}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO passwords (user_id, site, username, password, notes, category) VALUES (%s,%s,%s,%s,%s,%s)",
        (session['user_id'], data['site'], data['username'], encrypt_password(data['password']),
         data.get('notes', ''), data.get('category', 'General')))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'Password saved!'}), 201

@app.route('/api/passwords/<int:pid>', methods=['PUT'])
@login_required
def update_password(pid):
    data = request.json
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE passwords SET site=%s, username=%s, password=%s, notes=%s, category=%s WHERE id=%s AND user_id=%s",
        (data['site'], data['username'], encrypt_password(data['password']),
         data.get('notes', ''), data.get('category', 'General'), pid, session['user_id']))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'Updated!'})

@app.route('/api/passwords/<int:pid>', methods=['DELETE'])
@login_required
def delete_password(pid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM passwords WHERE id=%s AND user_id=%s", (pid, session['user_id']))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'message': 'Deleted!'})

if __name__ == '__main__':
    print("\n✅ VaultKey running at http://localhost:5000\n")
    app.run(debug=True, port=5000)