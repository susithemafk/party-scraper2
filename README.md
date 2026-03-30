1. 
- source ./venv/bin/activate
- python ./backend/main.py

- cd frontend
- npm run dev

2. Create posts, export them.

- python posting-script.py --city brno
- python posting-script.py --city brno --post
- python posting-script.py --city brno --post --day 2026-03-29

3. Send them to server:

- scp -i "C:\Users\msuch\.ssh\oracle-cloud.key" src/env/.env.brno ubuntu@130.61.72.167:/home/ubuntu/party-scraper2/src/env/
- scp -r -i "C:\Users\msuch\.ssh\oracle-cloud.key" studio_data_export ubuntu@130.61.72.167:/home/ubuntu/party-scraper2/


- 0 7 * * * /home/ubuntu/party-scraper2/venv/bin/python /home/ubuntu/party-scraper2/posting-script.py --city brno --post >> /home/ubuntu/party-scraper2/posting-script.log 2>&1
