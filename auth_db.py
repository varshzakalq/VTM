import os
import psycopg2

try:
    from werkzeug.security import generate_password_hash, check_password_hash
except ImportError:
    import hashlib, secrets
    def generate_password_hash(password: str) -> str:
        salt = secrets.token_hex(16)
        h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
        return f"pbkdf2:sha256:100000${salt}${h.hex()}"

    def check_password_hash(pwhash: str, password: str) -> bool:
        try:
            parts = pwhash.split("$")
            iterations = int(parts[0].split(":")[-1]) if len(parts) == 3 else 100000
            salt, stored_hex = parts[-2], parts[-1]
            computed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
            return secrets.compare_digest(computed.hex(), stored_hex)
        except Exception:
            return False

# Your Neon Database URL
NEON_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_cSE57DNiqPvz@ep-odd-sun-b4yfpz1q-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)

def get_db():
    """Connects directly to Neon PostgreSQL."""
    url = NEON_URL.replace("&channel_binding=require", "").replace("?channel_binding=require", "?")
    if url.endswith("?"):
        url = url[:-1]
    return psycopg2.connect(url)

def init_db():
    """Initializes the users table in Neon."""
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
            """)
        conn.commit()
    except Exception as e:
        print(f"[INIT DB ERROR] {e}", flush=True)
    finally:
        if conn is not None and hasattr(conn, "close"):
            conn.close()

def register_user(username, email, password):
    username = (username or "").strip()
    email = (email or "").strip().lower()
    password = (password or "")

    if not username or not password:
        return None, "Username and password are required"
    if not email or "@" not in email:
        return None, "A valid email address is required"

    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            pwd_hash = generate_password_hash(password)
            cur.execute(
                "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s) RETURNING id;",
                (username, email, pwd_hash)
            )
            user_id = cur.fetchone()[0]
        conn.commit()
        return user_id, None
    except Exception as e:
        err = str(e).lower()
        if "username" in err and ("unique" in err or "duplicate" in err):
            return None, "Username is already taken"
        if "email" in err and ("unique" in err or "duplicate" in err):
            return None, "Email is already registered"
        return None, f"Database error: {e}"
    finally:
        if conn is not None and hasattr(conn, "close"):
            conn.close()

def authenticate_user(login_identifier, password):
    login_identifier = (login_identifier or "").strip()
    password = (password or "")

    if not login_identifier or not password:
        return None, None, "Credentials required"

    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, password_hash FROM users WHERE username = %s OR LOWER(email) = LOWER(%s);",
                (login_identifier, login_identifier)
            )
            row = cur.fetchone()

        if not row:
            return None, None, "Invalid username or password"

        user_id, actual_username, stored_hash = row[0], row[1], row[2]
        if check_password_hash(stored_hash, password):
            return user_id, actual_username, None
        return None, None, "Invalid username or password"
    except Exception as e:
        return None, None, f"Database error: {e}"
    finally:
        if conn is not None and hasattr(conn, "close"):
            conn.close()

def get_user_by_id(user_id):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT username FROM users WHERE id = %s;", (user_id,))
            row = cur.fetchone()
        return row[0] if row else None
    except Exception:
        return None
    finally:
        if conn is not None and hasattr(conn, "close"):
            conn.close()