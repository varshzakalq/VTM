import os
import sqlite3

try:
    from werkzeug.security import generate_password_hash, check_password_hash
except ImportError:
    import hashlib
    import secrets

    def generate_password_hash(password: str) -> str:
        salt = secrets.token_hex(16)
        h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
        return f"pbkdf2:sha256:100000${salt}${h.hex()}"

    def check_password_hash(pwhash: str, password: str) -> bool:
        try:
            parts = pwhash.split("$")
            if len(parts) == 3:
                method_meta, salt, stored_hex = parts
                iterations = int(method_meta.split(":")[-1])
            elif len(parts) == 2:
                salt, stored_hex = parts
                iterations = 100000
            else:
                return False
            computed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
            return secrets.compare_digest(computed.hex(), stored_hex)
        except Exception:
            return False

DATABASE_URL = "postgresql://neondb_owner:npg_cSE57DNiqPvz@ep-odd-sun-b4yfpz1q-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
LOCAL_DB_FILE = os.path.join(os.path.dirname(__file__), "vtm.db")


def get_db():
    """Returns a database connection: uses Neon PostgreSQL if configured, else local SQLite."""
    if DATABASE_URL and (DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")):
        try:
            import psycopg2
            db_url = DATABASE_URL
            if "channel_binding=" in db_url:
                db_url = db_url.replace("&channel_binding=require", "").replace("?channel_binding=require", "?")
                if db_url.endswith("?"):
                    db_url = db_url[:-1]
            conn = psycopg2.connect(db_url)
            return conn, "postgres"
        except Exception as e:
            print(f"[DB WARN] Neon connection error ({e}). Falling back to SQLite.", flush=True)

    conn = sqlite3.connect(LOCAL_DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn, "sqlite"


def init_db():
    """Creates the users table if not exists."""
    conn, db_type = get_db()
    try:
        cur = conn.cursor()
        if db_type == "postgres":
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
        else:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
        conn.commit()
    finally:
        conn.close()


def register_user(username, password):
    username = (username or "").strip()
    password = (password or "")
    if not username or not password:
        return None, "Username and password are required"

    conn, db_type = get_db()
    try:
        cur = conn.cursor()
        pwd_hash = generate_password_hash(password)
        placeholder = "%s" if db_type == "postgres" else "?"

        if db_type == "postgres":
            cur.execute(
                f"INSERT INTO users (username, password_hash) VALUES ({placeholder}, {placeholder}) RETURNING id;",
                (username, pwd_hash)
            )
            user_id = cur.fetchone()[0]
        else:
            cur.execute(
                f"INSERT INTO users (username, password_hash) VALUES ({placeholder}, {placeholder});",
                (username, pwd_hash)
            )
            user_id = cur.lastrowid
        conn.commit()
        return user_id, None
    except Exception as e:
        err_msg = str(e).lower()
        if "unique" in err_msg or "duplicate" in err_msg:
            return None, "Username is already taken"
        return None, f"Registration failed: {e}"
    finally:
        conn.close()


def authenticate_user(username, password):
    username = (username or "").strip()
    password = (password or "")
    if not username or not password:
        return None, "Username and password are required"

    conn, db_type = get_db()
    try:
        cur = conn.cursor()
        placeholder = "%s" if db_type == "postgres" else "?"
        cur.execute(f"SELECT id, password_hash FROM users WHERE username = {placeholder};", (username,))
        row = cur.fetchone()

        if not row:
            return None, "Invalid username or password"

        user_id = row[0]
        stored_hash = row[1]

        if check_password_hash(stored_hash, password):
            return user_id, None
        return None, "Invalid username or password"
    except Exception as e:
        return None, f"Authentication error: {e}"
    finally:
        conn.close()

def get_user_by_id(user_id):
    """Fetches user details from the database by ID."""
    conn, db_type = get_db()
    try:
        cur = conn.cursor()
        placeholder = "%s" if db_type == "postgres" else "?"
        cur.execute(f"SELECT username FROM users WHERE id = {placeholder};", (user_id,))
        row = cur.fetchone()
        return row[0] if row else None
    except Exception as e:
        print(f"[DB ERROR] Failed to fetch user: {e}", flush=True)
        return None
    finally:
        conn.close()