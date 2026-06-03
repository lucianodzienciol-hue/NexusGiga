import json, sqlite3

live = sqlite3.connect(r'F:\Nexus\nexus-pos-completo\database.db')
live.row_factory = sqlite3.Row

backup_conn = sqlite3.connect(r'F:\Nexus\nexus-pos-completo\backups\nexus-2026-06-03T17-03-51.db')
backup_conn.row_factory = sqlite3.Row

# Check clients from backup
client_ids = ['1780419305300blh6', '17804193041845h87', '17804193044316ymg']
for cid in client_ids:
    bc = backup_conn.execute('SELECT * FROM clients WHERE id = ?', (cid,)).fetchone()
    lc = live.execute('SELECT * FROM clients WHERE id = ?', (cid,)).fetchone()
    print(f'Client {cid}:')
    if bc: print(f'  Backup: {dict(bc)}')
    else: print('  Backup: NOT FOUND')
    if lc: print(f'  Live: {dict(lc)}')
    else: print('  Live: NOT FOUND')

# Check app_config for sync counters etc
bc = backup_conn.execute('SELECT key, value FROM app_config').fetchall()
print(f'\nBackup app_config ({len(bc)} entries)')
for r in bc: print(f'  {r["key"]}: {r["value"][:80]}')

print(f'\nLive app_config:')
lc = live.execute('SELECT key, value FROM app_config').fetchall()
for r in lc: print(f'  {r["key"]}: {r["value"][:80]}')

backup_conn.close()
live.close()
