#!/bin/sh
set -e
python -m scripts.ensure_db_seeded
exec uvicorn main:app --host 0.0.0.0 --port 8000
