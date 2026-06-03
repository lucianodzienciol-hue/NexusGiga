import sqlite3, json, datetime

live = sqlite3.connect(r'F:\Nexus\nexus-pos-completo\database.db')
live.row_factory = sqlite3.Row

# Map DB tables -> data.json keys
table_map = {
    'products': 'articles',
    'web_categories': 'categories',
    'sales': 'sales',
    'sale_items': 'sale_items',
    'repairs': 'repairs',
    'expenses': 'expenses',
}

data = {}
for db_table, json_key in table_map.items():
    try:
        items = [dict(r) for r in live.execute(f'SELECT * FROM [{db_table}]').fetchall()]
        data[json_key] = items
    except Exception as e:
        print(f'  {db_table}: error {e}')
        data[json_key] = []

# Read companyName from app_config
config_map = {}
for c in live.execute('SELECT * FROM app_config').fetchall():
    config_map[c['key']] = c['value']

if 'webConfig' in config_map:
    try:
        wc = json.loads(config_map['webConfig'])
        data['companyName'] = wc.get('companyName', 'GIGA Computers')
    except:
        data['companyName'] = 'GIGA Computers'
else:
    data['companyName'] = 'GIGA Computers'

data['_syncTimestamp'] = datetime.datetime.now().isoformat()

live.close()

path = r'F:\Nexus\nexus-pos-completo\web\data.json'
with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'data.json written:')
print(f'  articles: {len(data["articles"])}')
print(f'  categories: {len(data["categories"])}')
print(f'  sales: {len(data["sales"])}')
print(f'  repairs: {len(data["repairs"])}')
print(f'  expenses: {len(data["expenses"])}')
print(f'  companyName: {data.get("companyName")}')
