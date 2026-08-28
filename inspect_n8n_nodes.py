from bs4 import BeautifulSoup
from pathlib import Path
p = Path('/home/ubuntu/browser_html/n8n_novaagencian8n_online_7hHeHhvoCxA6JTSv_1787929248468.html')
soup = BeautifulSoup(p.read_text(errors='ignore'), 'html.parser')
for node in soup.select('[data-node-name]'):
    name = node.get('data-node-name')
    if name in {'Responder API', 'Webhook - Rascunho'}:
        print(name, node.get('data-manus_click_id'), node.get('class'))
        for child in node.select('[data-manus_click_id]')[:10]:
            print(' child', child.name, child.get('title') or child.get('aria-label'), child.get('data-manus_click_id'))
