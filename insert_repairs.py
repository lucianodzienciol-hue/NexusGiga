import sqlite3, json

live = sqlite3.connect(r'F:\Nexus\nexus-pos-completo\database.db')

repairs = [
    {
        "id": "REP-965730", "code": "3YLQY", "clientId": "1780419305300blh6",
        "clientName": "Maria Carla Lombardia", "clientPhone": "11-4888-5305",
        "equipment": "Tv Box", "marca": "Mx9", "modelo": "Mx9",
        "status": "Recibida", "problem": "Actualizacion App Magis", "notes": "",
        "price": 0.0, "date": "2026-06-03"
    },
    {
        "id": "REP-303846", "code": "C836X", "clientId": "17804193041845h87",
        "clientName": "Daniel Pereira", "clientPhone": "4431 6663",
        "equipment": "Tv Box", "marca": "Mx9", "modelo": "Mx9",
        "status": "Recibida", "problem": "Actualizar App", "notes": "",
        "price": 0.0, "date": "2026-06-03"
    },
    {
        "id": "REP-343386", "code": "ZX85K", "clientId": "17804193044316ymg",
        "clientName": "Marcelo Mato", "clientPhone": "15-3337-5069",
        "equipment": "Disco Rigido Externo", "marca": "Noga", "modelo": "Noga",
        "status": "Recibida", "problem": "revisar no funciona", "notes": "",
        "price": 0.0, "date": "2026-06-03"
    }
]

for r in repairs:
    live.execute('''INSERT OR REPLACE INTO repairs
        (id, code, clientId, clientName, clientPhone, equipment, marca, modelo,
         status, problem, notes, price, date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)''',
        (r['id'], r['code'], r['clientId'], r['clientName'], r['clientPhone'],
         r['equipment'], r['marca'], r['modelo'], r['status'], r['problem'],
         r['notes'], r['price'], r['date']))

live.commit()

# Verify
count = live.execute('SELECT COUNT(*) FROM repairs').fetchone()[0]
print(f'Repairs inserted: {count}')
rows = live.execute('SELECT id, clientName, equipment FROM repairs').fetchall()
for r in rows:
    print(f'  - {r[0]}: {r[1]} - {r[2]}')

live.close()
