#!/usr/bin/env python3
"""
kzadmin.py — E-Passport Database Admin CLI
Run:  python3 kzadmin.py
"""

import sqlite3
import os
import shutil
from datetime import datetime

DB_PATH      = os.path.join(os.path.dirname(__file__), 'backend', 'src', 'database', 'passport.db')
UPLOADS_DIR  = os.path.join(os.path.dirname(__file__), 'backend', 'src', 'uploads')

# ── ANSI colours ──────────────────────────────────────────────────────────────
R  = '\033[0;31m'   # red
G  = '\033[0;32m'   # green
Y  = '\033[0;33m'   # yellow
B  = '\033[0;34m'   # blue
C  = '\033[0;36m'   # cyan
W  = '\033[1;37m'   # bold white
DIM= '\033[2m'      # dim
RST= '\033[0m'      # reset

def clr(text, colour): return f"{colour}{text}{RST}"
def hr(char='─', n=60): print(clr(char * n, DIM))

def connect():
    if not os.path.exists(DB_PATH):
        print(clr(f"❌  DB not found at {DB_PATH}", R)); exit(1)
    return sqlite3.connect(DB_PATH)

def confirm(prompt):
    ans = input(f"\n{Y}  ⚠  {prompt} (yes/no): {RST}").strip().lower()
    return ans == 'yes'

# ── VIEWS ─────────────────────────────────────────────────────────────────────

def show_summary():
    db = connect()
    hr()
    print(clr("  E-PASSPORT DATABASE SUMMARY", W))
    hr()

    sections = [
        ("USERS BY ROLE",
         "SELECT role, COUNT(*) AS total, "
         "SUM(CASE WHEN suspended=1 THEN 1 ELSE 0 END) AS suspended, "
         "SUM(CASE WHEN email_verified=0 THEN 1 ELSE 0 END) AS unverified, "
         "SUM(CASE WHEN is_super_admin=1 THEN 1 ELSE 0 END) AS super_admin "
         "FROM users GROUP BY role"),
        ("APPLICATIONS BY STATUS",
         "SELECT status, COUNT(*) AS count FROM applications GROUP BY status ORDER BY count DESC"),
        ("DATA COUNTS",
         "SELECT 'Total users' AS item, COUNT(*) AS n FROM users "
         "UNION ALL SELECT 'Total applications', COUNT(*) FROM applications "
         "UNION ALL SELECT 'Total notifications', COUNT(*) FROM notifications "
         "UNION ALL SELECT 'Read notifications', COUNT(*) FROM notifications WHERE read=1 "
         "UNION ALL SELECT 'Total messages', COUNT(*) FROM messages "
         "UNION ALL SELECT 'Audit log entries', COUNT(*) FROM audit_log "
         "UNION ALL SELECT 'Login log entries', COUNT(*) FROM login_logs"),
    ]

    for title, sql in sections:
        print(f"\n  {clr(title, C)}")
        rows = db.execute(sql).fetchall()
        cols = [d[0] for d in db.execute(sql).description]
        col_w = [max(len(str(c)), max((len(str(r[i])) for r in rows), default=0)) + 2 for i, c in enumerate(cols)]
        header = '  ' + ''.join(str(c).ljust(w) for c, w in zip(cols, col_w))
        print(clr(header, DIM))
        for row in rows:
            print('  ' + ''.join(str(v).ljust(w) for v, w in zip(row, col_w)))

    db.close()
    hr()

def show_users():
    db = connect()
    hr()
    print(clr("  ALL USERS", W))
    hr()
    rows = db.execute(
        "SELECT role, email, full_name, "
        "CASE WHEN suspended=1 THEN 'SUSPENDED' ELSE 'active' END, "
        "CASE WHEN email_verified=1 THEN '✓' ELSE '✗' END, "
        "CASE WHEN is_super_admin=1 THEN '⭐' ELSE '' END, "
        "COALESCE(last_login_at,'never'), "
        "(SELECT COUNT(*) FROM applications WHERE user_id=users.id) "
        "FROM users ORDER BY role DESC, created_at ASC"
    ).fetchall()
    headers = ['Role', 'Email', 'Name', 'Status', 'Verified', 'SA', 'Last Login', 'Apps']
    col_w   = [max(len(h), max(len(str(r[i])) for r in rows)) + 2 for i, h in enumerate(headers)]
    print(clr('  ' + ''.join(h.ljust(w) for h, w in zip(headers, col_w)), DIM))
    for row in rows:
        colour = R if row[3] == 'SUSPENDED' else (Y if row[4] == '✗' else RST)
        print(colour + '  ' + ''.join(str(v).ljust(w) for v, w in zip(row, col_w)) + RST)
    print(clr(f"\n  {len(rows)} user(s) total.", DIM))
    db.close()
    hr()

def show_applications():
    db = connect()
    hr()
    print(clr("  ALL APPLICATIONS", W))
    hr()
    rows = db.execute(
        "SELECT a.application_number, u.email, a.full_name, a.passport_type, "
        "a.status, a.submitted_at, COALESCE(a.passport_number,'-') "
        "FROM applications a JOIN users u ON a.user_id=u.id "
        "ORDER BY a.submitted_at DESC"
    ).fetchall()
    if not rows:
        print(clr("  No applications found.", DIM)); db.close(); hr(); return
    headers = ['App #', 'Email', 'Name', 'Type', 'Status', 'Submitted', 'Passport #']
    col_w   = [max(len(h), max(len(str(r[i])) for r in rows)) + 2 for i, h in enumerate(headers)]
    print(clr('  ' + ''.join(h.ljust(w) for h, w in zip(headers, col_w)), DIM))
    status_col = {'approved': G, 'rejected': R, 'processing': B, 'pending': Y}
    for row in rows:
        c = status_col.get(row[4], RST)
        print(c + '  ' + ''.join(str(v).ljust(w) for v, w in zip(row, col_w)) + RST)
    print(clr(f"\n  {len(rows)} application(s) total.", DIM))
    db.close()
    hr()

# ── CLEAN OPERATIONS ──────────────────────────────────────────────────────────

def _cascade_delete_user(db, user_id, email):
    """Delete all data belonging to a user (cascade)."""
    apps = db.execute("SELECT id, photo_path, id_document_path FROM applications WHERE user_id=?", (user_id,)).fetchall()
    for app_id, photo, id_doc in apps:
        for fpath in [photo, id_doc]:
            if fpath:
                full = os.path.join(UPLOADS_DIR, fpath)
                if os.path.exists(full):
                    os.remove(full)
        db.execute("DELETE FROM messages WHERE application_id=?", (app_id,))
        db.execute("DELETE FROM application_history WHERE application_id=?", (app_id,))
        db.execute("DELETE FROM notifications WHERE application_id=?", (app_id,))
        db.execute("DELETE FROM passport_expiry_reminders WHERE application_id=?", (app_id,))
        db.execute("DELETE FROM applications WHERE id=?", (app_id,))
    db.execute("DELETE FROM notifications WHERE user_id=?", (user_id,))
    db.execute("DELETE FROM login_logs WHERE user_id=?", (user_id,))
    db.execute("DELETE FROM password_reset_tokens WHERE user_id=?", (user_id,))
    db.execute("DELETE FROM email_verification_tokens WHERE user_id=?", (user_id,))
    db.execute("DELETE FROM users WHERE id=?", (user_id,))
    return len(apps)

def clean_loadtest_users():
    db = connect()
    users = db.execute(
        "SELECT id, email FROM users WHERE email LIKE 'loadtest%' OR email LIKE 'concurrent@test%'"
    ).fetchall()
    if not users:
        print(clr("  ✅ No load-test users found — DB already clean.", G))
        db.close(); return

    print(f"\n  {clr('Load-test users to delete:', Y)}")
    for _, email in users:
        print(f"    • {email}")

    if not confirm(f"Delete {len(users)} load-test user(s) and ALL their data?"):
        print(clr("  Cancelled.", DIM)); db.close(); return

    total_apps = 0
    for uid, email in users:
        n = _cascade_delete_user(db, uid, email)
        total_apps += n
        print(f"  {clr('✓', G)} Deleted {email} + {n} app(s)")

    db.commit()
    print(clr(f"\n  ✅ Removed {len(users)} user(s) and {total_apps} application(s).", G))
    db.close()

def clean_read_notifications():
    db = connect()
    count = db.execute("SELECT COUNT(*) FROM notifications WHERE read=1").fetchone()[0]
    if count == 0:
        print(clr("  ✅ No read notifications to clean.", G)); db.close(); return

    print(f"\n  {clr(f'{count} read notification(s) will be deleted.', Y)}")
    if not confirm(f"Delete all {count} read notifications?"):
        print(clr("  Cancelled.", DIM)); db.close(); return

    db.execute("DELETE FROM notifications WHERE read=1")
    db.commit()
    print(clr(f"  ✅ Deleted {count} read notification(s).", G))
    db.close()

def clean_audit_log():
    db = connect()
    count = db.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]
    print(f"\n  {clr(f'Audit log has {count} entries.', Y)}")
    days = input(f"  Delete entries older than how many days? {DIM}(0 = all, Enter = cancel){RST}: ").strip()
    if not days:
        print(clr("  Cancelled.", DIM)); db.close(); return
    days = int(days)
    if days == 0:
        sql = "DELETE FROM audit_log"
        label = "all"
    else:
        sql = f"DELETE FROM audit_log WHERE created_at < datetime('now', '-{days} days')"
        label = f"older than {days} day(s)"

    to_del = db.execute(sql.replace("DELETE FROM", "SELECT COUNT(*) FROM")).fetchone()[0]
    if to_del == 0:
        print(clr("  Nothing to delete.", DIM)); db.close(); return

    if not confirm(f"Delete {to_del} audit log entries ({label})?"):
        print(clr("  Cancelled.", DIM)); db.close(); return

    db.execute(sql)
    db.commit()
    print(clr(f"  ✅ Deleted {to_del} audit log entries.", G))
    db.close()

def clean_login_logs():
    db = connect()
    count = db.execute("SELECT COUNT(*) FROM login_logs").fetchone()[0]
    print(f"\n  {clr(f'Login log has {count} entries.', Y)}")
    days = input(f"  Delete entries older than how many days? {DIM}(0 = all, Enter = cancel){RST}: ").strip()
    if not days:
        print(clr("  Cancelled.", DIM)); db.close(); return
    days = int(days)
    sql = "DELETE FROM login_logs" if days == 0 else f"DELETE FROM login_logs WHERE created_at < datetime('now', '-{days} days')"
    label = "all" if days == 0 else f"older than {days} day(s)"
    to_del = db.execute(sql.replace("DELETE FROM", "SELECT COUNT(*) FROM")).fetchone()[0]
    if to_del == 0:
        print(clr("  Nothing to delete.", DIM)); db.close(); return

    if not confirm(f"Delete {to_del} login log entries ({label})?"):
        print(clr("  Cancelled.", DIM)); db.close(); return

    db.execute(sql)
    db.commit()
    print(clr(f"  ✅ Deleted {to_del} login log entries.", G))
    db.close()

def clean_unverified_users():
    db = connect()
    users = db.execute(
        "SELECT id, email, full_name, created_at FROM users "
        "WHERE email_verified=0 AND role='applicant' "
        "AND created_at < datetime('now', '-2 days')"
    ).fetchall()
    if not users:
        print(clr("  ✅ No stale unverified users found.", G)); db.close(); return

    print(f"\n  {clr('Unverified users (registered > 2 days ago):', Y)}")
    for _, email, name, created in users:
        print(f"    • {email}  ({name})  registered: {created}")

    if not confirm(f"Delete {len(users)} unverified user(s)?"):
        print(clr("  Cancelled.", DIM)); db.close(); return

    for uid, email, _, _ in users:
        _cascade_delete_user(db, uid, email)
        print(f"  {clr('✓', G)} Deleted {email}")
    db.commit()
    print(clr(f"  ✅ Removed {len(users)} unverified user(s).", G))
    db.close()

def delete_specific_user():
    db = connect()
    email = input(f"\n  Enter email of user to delete: {RST}").strip()
    row = db.execute("SELECT id, email, full_name, role FROM users WHERE email=?", (email,)).fetchone()
    if not row:
        print(clr(f"  ❌ User '{email}' not found.", R)); db.close(); return
    uid, em, name, role = row
    if role == 'admin':
        print(clr(f"  ⚠  This is an ADMIN account ({name}).", Y))
    apps_n = db.execute("SELECT COUNT(*) FROM applications WHERE user_id=?", (uid,)).fetchone()[0]
    notifs = db.execute("SELECT COUNT(*) FROM notifications WHERE user_id=?", (uid,)).fetchone()[0]
    print(f"\n  User:   {clr(em, W)}  ({name}, {role})")
    print(f"  Apps:   {apps_n}  |  Notifications: {notifs}")

    if not confirm(f"Permanently delete '{em}' and ALL their data?"):
        print(clr("  Cancelled.", DIM)); db.close(); return

    n = _cascade_delete_user(db, uid, em)
    db.commit()
    print(clr(f"  ✅ Deleted '{em}' + {n} application(s).", G))
    db.close()

def clean_messages():
    db = connect()
    count = db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    print(f"\n  {clr(f'Messages table has {count} entries.', Y)}")
    days = input(f"  Delete messages older than how many days? {DIM}(0 = all, Enter = cancel){RST}: ").strip()
    if not days:
        print(clr("  Cancelled.", DIM)); db.close(); return
    days = int(days)
    sql = "DELETE FROM messages" if days == 0 else f"DELETE FROM messages WHERE created_at < datetime('now', '-{days} days')"
    label = "all" if days == 0 else f"older than {days} day(s)"
    to_del = db.execute(sql.replace("DELETE FROM", "SELECT COUNT(*) FROM")).fetchone()[0]
    if to_del == 0:
        print(clr("  Nothing to delete.", DIM)); db.close(); return

    if not confirm(f"Delete {to_del} message(s) ({label})?"):
        print(clr("  Cancelled.", DIM)); db.close(); return

    db.execute(sql)
    db.commit()
    print(clr(f"  ✅ Deleted {to_del} message(s).", G))
    db.close()

def vacuum_db():
    db = connect()
    size_before = os.path.getsize(DB_PATH)
    print(f"\n  DB size before: {clr(f'{size_before/1024:.1f} KB', Y)}")
    if not confirm("Run VACUUM to reclaim disk space?"):
        print(clr("  Cancelled.", DIM)); db.close(); return
    db.execute("VACUUM")
    db.close()
    size_after = os.path.getsize(DB_PATH)
    saved = size_before - size_after
    print(clr(f"  ✅ VACUUM complete. Size after: {size_after/1024:.1f} KB  (saved {saved/1024:.1f} KB)", G))

def backup_db():
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    dest = os.path.join(os.path.dirname(DB_PATH), f"passport_backup_{ts}.db")
    shutil.copy2(DB_PATH, dest)
    size = os.path.getsize(dest)
    print(clr(f"  ✅ Backup saved → {dest}  ({size/1024:.1f} KB)", G))

def full_clean():
    """One-shot: remove all load-test data + read notifications + stale login logs."""
    print(clr("\n  FULL CLEAN — removes load-test users, read notifications, login logs > 30 days", Y))
    if not confirm("Proceed with full clean?"):
        print(clr("  Cancelled.", DIM)); return
    clean_loadtest_users()
    clean_read_notifications()
    db = connect()
    db.execute("DELETE FROM login_logs WHERE created_at < datetime('now', '-30 days')")
    deleted = db.execute("SELECT changes()").fetchone()[0]
    db.commit()
    db.close()
    if deleted:
        print(clr(f"  ✅ Deleted {deleted} old login log entries.", G))
    vacuum_db()

# ── MENU ──────────────────────────────────────────────────────────────────────

MENU = [
    ("View",    "show_summary",           "Database summary"),
    ("View",    "show_users",             "List all users"),
    ("View",    "show_applications",      "List all applications"),
    ("Clean",   "clean_loadtest_users",   "Remove load-test / test users"),
    ("Clean",   "clean_unverified_users", "Remove stale unverified accounts (> 2 days old)"),
    ("Clean",   "clean_read_notifications","Clear read notifications"),
    ("Clean",   "clean_messages",         "Delete messages (by age)"),
    ("Clean",   "clean_audit_log",        "Trim audit log (by age)"),
    ("Clean",   "clean_login_logs",       "Trim login logs (by age)"),
    ("Clean",   "delete_specific_user",   "Delete a specific user by email"),
    ("Maint",   "full_clean",             "Full clean (test data + old logs + VACUUM)"),
    ("Maint",   "vacuum_db",              "VACUUM database (reclaim disk space)"),
    ("Maint",   "backup_db",              "Backup database"),
]

ACTIONS = {
    'show_summary':            show_summary,
    'show_users':              show_users,
    'show_applications':       show_applications,
    'clean_loadtest_users':    clean_loadtest_users,
    'clean_unverified_users':  clean_unverified_users,
    'clean_read_notifications':clean_read_notifications,
    'clean_messages':          clean_messages,
    'clean_audit_log':         clean_audit_log,
    'clean_login_logs':        clean_login_logs,
    'delete_specific_user':    delete_specific_user,
    'full_clean':              full_clean,
    'vacuum_db':               vacuum_db,
    'backup_db':               backup_db,
}

def main():
    os.system('clear')
    print(clr("""
  ██╗  ██╗███████╗ █████╗ ██████╗ ███╗   ███╗██╗███╗   ██╗
  ██║ ██╔╝╚══███╔╝██╔══██╗██╔══██╗████╗ ████║██║████╗  ██║
  █████╔╝   ███╔╝ ███████║██║  ██║██╔████╔██║██║██╔██╗ ██║
  ██╔═██╗  ███╔╝  ██╔══██║██║  ██║██║╚██╔╝██║██║██║╚██╗██║
  ██║  ██╗███████╗██║  ██║██████╔╝██║ ╚═╝ ██║██║██║ ╚████║
  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝
  """, C))
    print(clr("  E-Passport Database Admin CLI", W))
    print(clr(f"  DB: {DB_PATH}", DIM))

    while True:
        hr()
        last_cat = None
        for i, (cat, _, label) in enumerate(MENU, 1):
            if cat != last_cat:
                print(f"\n  {clr(cat.upper(), Y)}")
                last_cat = cat
            print(f"  {clr(str(i).rjust(2), B)}.  {label}")
        print()
        print(f"  {clr(' 0', B)}.  Exit")
        hr()

        choice = input(f"\n  {W}Select option: {RST}").strip()
        if choice == '0':
            print(clr("\n  Bye.\n", DIM)); break
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(MENU):
                print()
                ACTIONS[MENU[idx][1]]()
            else:
                print(clr("  Invalid option.", R))
        except (ValueError, KeyboardInterrupt):
            print(clr("\n  Cancelled.", DIM))

if __name__ == '__main__':
    main()
