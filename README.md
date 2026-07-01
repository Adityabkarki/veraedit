## 🚀 Running the Project (Linux / Rocky Linux 9)

Start the project using **3 terminal windows**.

---

### 📦 Terminal 1 — Infrastructure (Docker)

Start all required infrastructure services:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

This starts:

* **PostgreSQL** → `localhost:5433`
* **Redis** → `localhost:6379`
* **MinIO API** → `localhost:9000`
* **MinIO Console** → `localhost:9001`

---

### ⚡ Terminal 2 — FastAPI Backend

```bash
cd apps/api

python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:

```
http://localhost:8000
```

---

### 💻 Terminal 3 — Frontend

Start the frontend development server:

```bash
npm run dev
```

The frontend will be available at:

```
http://localhost:3000
```

---

### ⚙️ Background Worker (Celery)

Open another terminal (or run it in the background):

```bash
cd apps/api

source .venv/bin/activate

celery -A celery_app worker \
  --queues=transcription,analysis,render,ai \
  --loglevel=info
```

---

### 🎬 Remotion Render Service

Start the Remotion-based video overlay renderer:

```bash
cd remotion-service

npm install

node server.js
```

The Remotion service will be available at:

```
http://127.0.0.1:3500
```

**Endpoints:**

| Method | Path                  | Description                  |
| ------ | --------------------- | ---------------------------- |
| `GET`  | `/health`             | Health check                 |
| `POST` | `/render-captions`    | Render caption overlay video |
| `POST` | `/render-title-card`  | Render title card overlay    |

---

## ✅ Quick Health Check

Verify that all services are running correctly.

### Backend

```bash
curl http://localhost:8000/health
```

### Frontend

```bash
curl http://localhost:3000
```

---

## 🗄️ MinIO Console

Open the MinIO web console in your browser:

```
http://localhost:9001
```

**Credentials**

| Username     | Password        |
| ------------ | --------------- |
| `minioadmin` | `minioadmin123` |
