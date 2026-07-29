FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements from backend folder
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire backend folder
COPY backend/ .

# Expose port
EXPOSE 8000

# Run the application - use $PORT from Railway environment
CMD uvicorn aplicacion.main:app --host 0.0.0.0 --port ${PORT:-8000}
