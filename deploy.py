"""
E-Passport System — Modal deployment
Deploy:  modal deploy deploy.py
URL:     https://kyawzin-ccna--e-passport-serve.modal.run
"""

import modal

# ── App ───────────────────────────────────────────────────────────────────────
app = modal.App("e-passport")

# ── Persistent volume (SQLite DB + uploads) ───────────────────────────────────
data_volume = modal.Volume.from_name("e-passport-data", create_if_missing=True)

# ── Secrets (read from backend/.env) ─────────────────────────────────────────
env_secret = modal.Secret.from_dotenv("backend/.env")

# ── Container image ───────────────────────────────────────────────────────────
MODAL_APP_URL = "https://kyawzin-ccna--e-passport-serve.modal.run"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("curl", "build-essential")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
        "node --version && npm --version",
    )
    # copy=True bakes files into the image so run_commands can follow
    .add_local_dir(
        "frontend", "/app/frontend",
        copy=True,
        ignore=["node_modules", "dist", ".env*"],
    )
    .run_commands(
        "cd /app/frontend && npm install --legacy-peer-deps",
        "cd /app/frontend && npm run build",   # → /app/frontend/dist
    )
    .add_local_dir(
        "backend", "/app/backend",
        copy=True,
        ignore=["node_modules", "dist", "src/database/*.db", "src/uploads", ".env*"],
    )
    .run_commands(
        "cd /app/backend && npm install --legacy-peer-deps",
        "cd /app/backend && npm run build",    # → /app/backend/dist
        # Bundle built frontend into backend so it's served as static files
        "cp -r /app/frontend/dist /app/backend/dist/public",
        "mkdir -p /app/backend/dist/uploads",
    )
)

# ── Web server ────────────────────────────────────────────────────────────────
@app.function(
    image=image,
    volumes={"/data": data_volume},
    secrets=[env_secret],
    min_containers=1,   # keep warm — needed for cron jobs + SSE
    timeout=0,          # no request timeout (SSE connections are long-lived)
)
@modal.concurrent(max_inputs=100)
@modal.web_server(5001, startup_timeout=60)
def serve():
    import subprocess
    import os
    import shutil

    # Ensure Volume directories exist
    os.makedirs("/data/uploads", exist_ok=True)

    # Symlink uploads dir → Volume so files persist across restarts
    uploads_link = "/app/backend/dist/uploads"
    if os.path.islink(uploads_link):
        os.unlink(uploads_link)
    elif os.path.isdir(uploads_link):
        shutil.rmtree(uploads_link)
    os.symlink("/data/uploads", uploads_link)

    env = {
        **os.environ,
        "PORT": "5001",
        "NODE_ENV": "production",
        "DATABASE_PATH": "/data/passport.db",
        "UPLOADS_DIR": "/data/uploads",
        "FRONTEND_URL": MODAL_APP_URL,
    }

    subprocess.Popen(
        ["node", "dist/index.js"],
        cwd="/app/backend",
        env=env,
    )
