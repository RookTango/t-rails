#!/bin/bash
cd "$(dirname "$0")"
echo "Starting Django backend on http://localhost:8000"
python manage.py runserver
