source ./venv/bin/activate
python ./backend/main.py

cd frontend
npm run dev

Create posts, export them.

Report single city, all dates:
python posting-script.py --city brno

Post single city, all dates:
python posting-script.py --city brno --post
Post single city, one day:
python posting-script.py --city brno --post --day 2026-03-29

0 7 * * * /home/ubuntu/party-scraper2/venv/bin/python /home/ubuntu/party-scraper2/posting-script.py --city brno --post