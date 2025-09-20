# EGOV-BOT: AUTOMATED QUESTION-ANSWERING SYSTEM FOR ADMINISTRATIVE PROCEDURES

**Project for UIT Data Science Challenge 2025**

---

## 1. Description

**eGov-Bot** is a chatbot system designed to assist citizens and businesses in Vietnam in searching and retrieving information about **administrative procedures** from the [National Public Service Portal](https://dichvucong.gov.vn).

Key features:

- **Procedure Lookup**: Retrieve detailed information (required documents, process steps, responsible agencies).
- **Multi-turn conversation (Follow-up)**: Users can continue asking about the same procedure without repeating context.
- **New Chat option**: Users can start a fresh chat when switching to another topic for higher accuracy.
- **Web Interface**: Includes both **search bar** and **chat assistant** for convenience.

---

## 2. Data

The dataset is collected from the **Vietnamese National Public Service Portal** and preprocessed into several files:

| File                         | Purpose                                  |
| ---------------------------- | ---------------------------------------- |
| `toan_bo_du_lieu_final.json` | Full dataset of all procedures           |
| `index.faiss`                | Vector index for semantic search (FAISS) |
| `metas.pkl.gz`               | Metadata for text chunks                 |
| `bm25.pkl.gz`                | BM25 index for keyword search            |
| `id_to_record.pkl`           | Fast ID-to-record lookup                 |

👉 All data files are hosted on Hugging Face Datasets:  
[https://huggingface.co/datasets/HungBB/egov-bot-data](https://huggingface.co/datasets/HungBB/egov-bot-data)

The application **automatically downloads** required data on first run.

---

## 3. Model & Architecture

- **Answer generation model**: [Google Gemini 2.5 Flash](https://ai.google/)
- **Embedding model**: [AITeamVN/Vietnamese_Embedding](https://huggingface.co/AITeamVN/Vietnamese_Embedding)
- **Retrieval strategy**: Hybrid search
  - FAISS (semantic search)
  - BM25 (keyword search)
  - Weighted fusion for final ranking
- **Follow-up detection**: Uses regex + similarity threshold to decide whether to reuse previous context.

---

## 4. Responsible AI

- The chatbot **only relies on official government data**.
- If the requested information is **not found**, the bot will respond with:

  > _“Mình chưa có thông tin về vấn đề này. Bạn có thể tham khảo nguồn: [Cổng dịch vụ công quốc gia](https://dichvucong.gov.vn)”_

- No hallucination: avoids making up answers beyond dataset.
- Privacy-friendly: user sessions are temporary, not stored externally.

---

## 5. Installation & Usage

### 5.1. Prerequisites

- Python **3.9+** (if running locally) OR Docker installed
- A valid **Google API Key** (for Gemini model)
- (Optional) Hugging Face token (if dataset or model is private)

---

### 5.2. Run with Docker (Recommended)

-Make sure you have started Docker Desktop on your computer first

```bash
# Build Docker image
docker build -t egov-bot .

# Run container (replace with your own keys)
docker run -p 7860:7860 -e GOOGLE_API_KEY=<your_google_api_key> egov-bot

```

After running the above commands:

- **Backend Flask API** will be available at: [http://localhost:7860/chat](http://localhost:7860/chat)
- **Web UI** (from `index.html`, `script.js`, `style.css`) will be served at [http://localhost:7860](http://localhost:7860) or (http://127.0.0.1:7860/)
  (make sure these files are inside `/static` or correctly configured in Flask)

👉 In short, the judges only need to run the two Docker commands above to get a fully functional chatbot web app running at `localhost:7860`.

## 6. Sample Queries

You can test the chatbot with the following example questions:

1. **“Làm giấy khai sinh cần gì?”**  
   → The bot should return the required documents for the birth certificate procedure.

2. **“Tôi muốn làm giấy phép kinh doanh mua bán vàng thì cần gì?”**  
   → The bot should return the required documents for the business license for gold trading.

3. **“Cơ quan nào thực hiện đăng ký kết hôn?”**  
   → The bot should return the responsible authority for marriage registration.

4. **Follow-up example:**

   - User: “Đăng ký khai sinh cần giấy tờ gì?”
   - Then ask: “Tốn phí bao nhiêu?”  
     → The bot should retain the previous context and return the fee for birth registration.

5. **New Chat example:**
   - After finishing one topic, click **“Reload”** in the UI and ask:  
      “Tôi muốn biết làm thủ tục cấp giấy chứng nhận đăng ký quyền tác giả cần gì?”  
     → The bot will start a new context and answer based on the copyright registration procedure.


### 7. Project Structure

egov-bot/
│── app.py                 # Main Flask application (entry point of backend server)
│── requirements.txt       # Python dependencies (Flask, transformers, faiss, etc.)
│── Dockerfile             # Docker instructions to build and run the app in a container
│── README.md              # Project documentation
│── LICENSE                # Project license
│
├── CrawData/              # (Optional) Scripts for crawling or preprocessing raw data
│   └── crawdata.py        # Example script to collect or clean data
│
├── static/                # Static files accessible by the frontend (served by Flask automatically)
│   ├── css/
│   │   └── style.css      # Stylesheet for frontend UI
│   ├── javascript/
│   │   └── script.js      # Client-side logic (fetch API, handle search, etc.)
│   └── data/
│       └── toan_bo_du_lieu_final.json   # JSON dataset loaded by frontend for search
│
└── templates/             # HTML templates (rendered via Flask `render_template`)
    └── index.html         # Main frontend page (UI of the chatbot / search system)


### 8. License

This project is released under the MIT License.
You are free to use, modify, and distribute with attribution.