import sqlite3, os, json

c = sqlite3.connect(r'F:\Nexus\nexus-pos-completo\database.db')
sales = c.execute('SELECT COUNT(*) FROM sales').fetchone()[0]
print(f'Current DB sales: {sales}')
if sales > 0:
    for r in c.execute('SELECT id, total, date FROM sales ORDER BY date DESC'):
        print(f'  {r[0]}: ${r[1]} - {r[2]}')
c.close()

backup_dir = r'F:\Nexus\nexus-pos-completo\backups'
files = sorted(os.listdir(backup_dir))
for f in files:
    if f.endswith('.db'):
        fp = os.path.join(backup_dir, f)
        try:
            conn = sqlite3.connect(fp)
            cnt = conn.execute('SELECT COUNT(*) FROM sales').fetchone()[0]
            if cnt > 0:
                print(f'\nBackup DB {f}: {cnt} sales')
                for r in conn.execute('SELECT id, total, date FROM sales ORDER BY date DESC'):
                    print(f'  {r[0]}: ${r[1]} - {r[2]}')
            conn.close()
        except Exception as e:
            print(f'  {f}: {e}')

for f in files:
    if f.endswith('.json'):
        fp = os.path.join(backup_dir, f)
        try:
            with open(fp, 'r', encoding='utf-8') as fh:
                data = json.load(fh)
            slist = data.get('sales', [])
            if slist:
                print(f'\nBackup JSON {f}: {len(slist)} sales')
                for s in slist[:5]:
                    sid = s.get('id', '?')
                    stot = s.get('total', 0)
                    sdate = s.get('date', '?')
                    print(f'  {sid}: ${stot} - {sdate}')
        except Exception as e:
            print(f'  JSON {f}: {e}')
