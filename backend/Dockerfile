# Gemini Live Avatar - Backend Container for Cloud Run
# Python 3.10 slim image for smaller container size
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Cloud Run provides PORT environment variable
# Our app uses BACKEND_PORT which defaults to 8080
ENV BACKEND_HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

# Health check runs on port 8081
EXPOSE 8080 8081

# Run the application
CMD exec python main.py
