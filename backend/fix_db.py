"""
One-time DB repair script — run from your project root:
  python fix_db.py
"""
import os, sqlite3

# Find the db path
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'db.sqlite3')
if not os.path.exists(DB_PATH):
    # Try settings to find it
    import django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
    django.setup()
    from django.conf import settings
    DB_PATH = settings.DATABASES['default']['NAME']

print(f"Database: {DB_PATH}")
con = sqlite3.connect(DB_PATH)
cur = con.cursor()

def col_exists(table, col):
    cur.execute(f"PRAGMA table_info({table})")
    return any(r[1] == col for r in cur.fetchall())

def table_exists(table):
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return any(r[0] == table for r in cur.fetchall())

# ── changes_changerequest ──────────────────────────────────────────────────
print("\n── changes_changerequest ──────────────────")
if col_exists('changes_changerequest', 'title') and \
   not col_exists('changes_changerequest', 'short_description'):
    cur.execute("ALTER TABLE changes_changerequest RENAME COLUMN title TO short_description")
    print("  ✓ Renamed title -> short_description")
else:
    print("  - short_description OK")

for col, defn in [
    ('category',            "VARCHAR(100) NOT NULL DEFAULT ''"),
    ('service',             "VARCHAR(100) NOT NULL DEFAULT ''"),
    ('service_offering',    "VARCHAR(100) NOT NULL DEFAULT ''"),
    ('configuration_item',  "VARCHAR(100) NOT NULL DEFAULT ''"),
    ('assignment_group',    "VARCHAR(100) NOT NULL DEFAULT ''"),
    ('change_window_start', "DATETIME NULL"),
    ('change_window_end',   "DATETIME NULL"),
    ('justification',       "TEXT NOT NULL DEFAULT ''"),
    ('implementation_plan', "TEXT NOT NULL DEFAULT ''"),
    ('test_plan',           "TEXT NOT NULL DEFAULT ''"),
    ('close_code',          "VARCHAR(50) NOT NULL DEFAULT ''"),
    ('close_notes',         "TEXT NOT NULL DEFAULT ''"),
    ('conflict_status',     "VARCHAR(50) NOT NULL DEFAULT 'None'"),
    ('conflict_last_run',   "DATETIME NULL"),
    ('ci_impact_depth',     "VARCHAR(10) NOT NULL DEFAULT 'full'"),
]:
    if not col_exists('changes_changerequest', col):
        cur.execute(f"ALTER TABLE changes_changerequest ADD COLUMN {col} {defn}")
        print(f"  ✓ Added {col}")

# ── changes_changetask ─────────────────────────────────────────────────────
print("\n── changes_changetask ─────────────────────")
if col_exists('changes_changetask', 'title') and \
   not col_exists('changes_changetask', 'short_description'):
    cur.execute("ALTER TABLE changes_changetask RENAME COLUMN title TO short_description")
    print("  ✓ Renamed title -> short_description")
else:
    print("  - short_description OK")

for col, defn in [
    ('task_number',        "VARCHAR(20) NOT NULL DEFAULT ''"),
    ('configuration_item', "VARCHAR(100) NOT NULL DEFAULT ''"),
    ('assignment_group',   "VARCHAR(100) NOT NULL DEFAULT ''"),
    ('planned_start',      "DATETIME NULL"),
    ('planned_end',        "DATETIME NULL"),
    ('actual_start',       "DATETIME NULL"),
    ('actual_end',         "DATETIME NULL"),
    ('ci_id',              "INTEGER NULL REFERENCES cmdb_configurationitem(id)"),
]:
    if not col_exists('changes_changetask', col):
        cur.execute(f"ALTER TABLE changes_changetask ADD COLUMN {col} {defn}")
        print(f"  ✓ Added {col}")

# ── changes_changeci ───────────────────────────────────────────────────────
print("\n── changes_changeci ───────────────────────")
if not table_exists('changes_changeci'):
    cur.execute("""
        CREATE TABLE changes_changeci (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role VARCHAR(10) NOT NULL DEFAULT 'Affected',
            notes TEXT NOT NULL DEFAULT '',
            added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            change_id INTEGER NOT NULL REFERENCES changes_changerequest(id),
            ci_id INTEGER NOT NULL REFERENCES cmdb_configurationitem(id),
            UNIQUE(change_id, ci_id, role)
        )
    """)
    print("  ✓ Created table")
else:
    print("  - Already exists")

# ── django_migrations ──────────────────────────────────────────────────────
print("\n── django_migrations cleanup ──────────────")
for name in [
    '0002_servicenow_fields',
    '0002_rename_title_changerequest_short_description_and_more',
    '0003_changetask_ci_alter_changerequest_description_and_more',
    '0004_changerequest_ci_impact_depth',
    '0005_merge_20260312_1137',
]:
    cur.execute("DELETE FROM django_migrations WHERE app='changes' AND name=?", (name,))
    if con.total_changes:
        print(f"  ✓ Removed {name}")

cur.execute("SELECT 1 FROM django_migrations WHERE app='changes' AND name='0002_all_changes_fields'")
if not cur.fetchone():
    from datetime import datetime, timezone
    cur.execute(
        "INSERT INTO django_migrations (app, name, applied) VALUES (?, ?, ?)",
        ('changes', '0002_all_changes_fields', datetime.now(timezone.utc).isoformat())
    )
    print("  ✓ Recorded 0002_all_changes_fields")
else:
    print("  - 0002_all_changes_fields already recorded")

con.commit()
con.close()

print("\n✅  Done. Now run:  python manage.py migrate")