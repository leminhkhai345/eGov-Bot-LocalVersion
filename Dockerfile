FROM python:3.9

WORKDIR /app

COPY requirements.txt .

# Thêm dòng này để cài đặt các gói từ packages.txt
RUN apt-get update && apt-get install -y $(cat packages.txt)

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "app.py"]