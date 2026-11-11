# Virtual AI Lover - Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

# Copy application files
COPY . /app

# Expose server port
EXPOSE 8080

# Run the server
CMD ["python", "server.py"]
