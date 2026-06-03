import json, sqlite3, os
backup_dir = r'F:\Nexus\nexus-pos-completo\backups'
files = sorted(os.listdir(backup_dir))
for f in files:
    if f.endswith('.db'):
        fp = os.path.join(backup_dir, f)
        try:
            conn = sqlite3.connect(fp)
            try:
                rows = conn.execute('SELECT id, equipment, clientName FROM repairs').fetchall()
                print(f'{f}: {len(rows)} repairs')
                for r in rows:
                    print(f'  - id={r[0]}: {r[1]} / {r[2]}')
            except Exception as e:
                print(f'{f}: schema error: {e}')
            conn.close()
        except Exception as e:
            print(f'{f}: cannot open: {e}')
print('---')
print('Checking web/data.json...')
with open(r'F:\Nexus\nexus-pos-completo\web\data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
repairs = data.get('repairs', [])
print(f'data.json: {len(repairs)} repairs')
for r in repairs:
    print(f'  - id={r.get("id")}: {r.get("equipment","?")} / {r.get("clientName","?")}')
