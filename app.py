from flask import Flask, request, jsonify, send_from_directory
import sqlite3
import os

app = Flask(__name__, static_folder='static')
DB = 'passwords.db'

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS passwords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site TEXT NOT NULL,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            notes TEXT DEFAULT '',
            category TEXT DEFAULT 'General',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )''')
        # Add category column if it doesn't exist (for existing databases)
        try:
            conn.execute("ALTER TABLE passwords ADD COLUMN category TEXT DEFAULT 'General'")
        except:
            pass
        conn.commit()

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/passwords', methods=['GET'])
def get_passwords():
    search = request.args.get('search', '').lower()
    category = request.args.get('category', '')
    with get_db() as conn:
        query = "SELECT id, site, username, notes, category, created_at FROM passwords WHERE 1=1"
        params = []
        if search:
            query += " AND (LOWER(site) LIKE ? OR LOWER(username) LIKE ?)"
            params += [f'%{search}%', f'%{search}%']
        if category and category != 'All':
            query += " AND category = ?"
            params.append(category)
        query += " ORDER BY created_at DESC"
        rows = conn.execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/passwords/<int:pid>', methods=['GET'])
def get_password(pid):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM passwords WHERE id=?", (pid,)).fetchone()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(dict(row))

@app.route('/api/passwords', methods=['POST'])
def add_password():
    data = request.json
    if not data.get('site') or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Site, username, and password are required'}), 400
    with get_db() as conn:
        conn.execute(
            "INSERT INTO passwords (site, username, password, notes, category) VALUES (?,?,?,?,?)",
            (data['site'], data['username'], data['password'], data.get('notes', ''), data.get('category', 'General'))
        )
        conn.commit()
    return jsonify({'message': 'Password saved!'}), 201

@app.route('/api/passwords/<int:pid>', methods=['PUT'])
def update_password(pid):
    data = request.json
    with get_db() as conn:
        conn.execute(
            "UPDATE passwords SET site=?, username=?, password=?, notes=?, category=? WHERE id=?",
            (data['site'], data['username'], data['password'], data.get('notes', ''), data.get('category', 'General'), pid)
        )
        conn.commit()
    return jsonify({'message': 'Updated!'})

@app.route('/api/passwords/<int:pid>', methods=['DELETE'])
def delete_password(pid):
    with get_db() as conn:
        conn.execute("DELETE FROM passwords WHERE id=?", (pid,))
        conn.commit()
    return jsonify({'message': 'Deleted!'})

@app.route('/api/categories', methods=['GET'])
def get_categories():
    with get_db() as conn:
        rows = conn.execute("SELECT DISTINCT category FROM passwords ORDER BY category").fetchall()
    cats = [r['category'] for r in rows if r['category']]
    return jsonify(cats)

if __name__ == '__main__':
    init_db()
    print("\n✅ Password Manager running at http://localhost:5000\n")
    app.run(debug=True, port=5000)