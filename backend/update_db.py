import sqlite3

conn = sqlite3.connect('C:/project/TICKET BOOK SYSTEM/cinemax/backend/database.db')
try:
    conn.execute('ALTER TABLE shows ADD COLUMN regular_price INTEGER DEFAULT 10')
    conn.execute('ALTER TABLE shows ADD COLUMN vip_price INTEGER DEFAULT 20')
    print("Migrated successfully!")
except Exception as e:
    print("Migration error (might already exist):", e)
conn.commit()
conn.close()
