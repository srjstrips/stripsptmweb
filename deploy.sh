#!/bin/bash
set -e
cd /var/www/ptm

echo "Pulling latest code..."
git pull origin main

echo "Backend..."
cd backend
npm install
node src/db/migrate.js
pm2 restart ptm-backend
cd ..

echo "Frontend..."
cd frontend
npm install
npm run build
pm2 restart ptm-frontend
cd ..

echo "Done."
pm2 status
