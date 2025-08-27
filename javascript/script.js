# app.py (optimized & fixed)
import os, shutil, time, hashlib, gzip, pickle, json, traceback, re
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from rank_bm25 import BM25Okapi
import google.generativeai as genai
from cachetools import TTLCache
from huggingface_hub import login, hf_hub_download

# --- Cache + Env setup ---
import os, shutil

# Đặt cache vào /tmp (luôn ghi được trên HuggingFace Spaces)
os.environ["HF_HOME"] = "/tmp/hf_home"
os.environ["HF_HUB_CACHE"] = "/tmp/hf_cache"
os.environ["TRANSFORMERS_CACHE"] = "/tmp/hf_cache"
os.environ["HF_DATASETS_CACHE"] = "/tmp/hf_datasets"
os.environ["XDG_CACHE_HOME"] = "/tmp/.cache"
os.environ["HOME"] = "/tmp"

os.makedirs("/tmp/hf_home", exist_ok=True)
os.makedirs("/tmp/hf_cache", exist_ok=True)
os.makedirs("/tmp/hf_datasets", exist_ok=True)
os.makedirs("/tmp/.cache", exist_ok=True)

# Xoá cache cũ nếu có (tránh bị kẹt ở /.cache)
shutil.rmtree("/.cache", ignore_errors=True)


HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN")
if HF_TOKEN:
    try:
        login(HF_TOKEN)
        print("HF login successful")
    except Exception as e:
        print("Warning: HF login failed:", e)
else:
    print("Warning: HF_TOKEN not found - only public repos accessible")

# ---------- Config ----------
HF_REPO_ID = os.environ.get("HF_REPO_ID", "HungBB/egov-bot-data")
REPO_TYPE = os.environ.get("REPO_TYPE", "dataset")
EMB_MODEL = os.environ.get("EMB_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
GENAI_MODEL = os.environ.get("GENAI_MODEL", "gemini-2.5-flash")
TOP_K = int(os.environ.get("TOP_K", "3"))
FAISS_CANDIDATES = int(os.environ.get("FAISS_CANDIDATES", str(max(10, TOP_K*5))))
BM25_PREFILTER = int(os.environ.get("BM25_PREFILTER", "200"))
CACHE_TTL = int(os.environ.get("CACHE_TTL", "3600"))
CACHE_MAX = int(os.environ.get("CACHE_MAX", "2000"))

print("--- KHỞI ĐỘNG MÁY CHỦ CHATBOT (optimized & fixed) ---")

# ---------- Download dataset ----------
FAISS_PATH = None
try:
    RAW_PATH = hf_hub_download(repo_id=HF_REPO_ID, filename="toan_bo_du_lieu_final.json", repo_type=REPO_TYPE)
    FAISS_PATH = hf_hub_download(repo_id=HF_REPO_ID, filename="index.faiss", repo_type=REPO_TYPE)
    METAS_PATH = hf_hub_download(repo_id=HF_REPO_ID, filename="metas.pkl.gz", repo_type=REPO_TYPE)
    BM25_PATH = hf_hub_download(repo_id=HF_REPO_ID, filename="bm25.pkl.gz", repo_type=REPO_TYPE)
    print("✅ Files downloaded or already available.")
except Exception as e:
    print("❌ LỖI KHI TẢI TÀI NGUYÊN:", e)

# Kiểm tra trước khi load
if FAISS_PATH:
    print("Loading FAISS index from:", FAISS_PATH)
    faiss_index = faiss.read_index(FAISS_PATH)
else:
    raise RuntimeError("Không có file FAISS index. Kiểm tra repo HF_REPO_ID của bạn.")

# ---------- External APIs ----------
API_KEY = os.environ.get("GOOGLE_API_KEY")
if not API_KEY:
    print("Warning: GOOGLE_API_KEY missing. LLM calls will fail until you set GOOGLE_API_KEY.")
else:
    genai.configure(api_key=API_KEY)

# ---------- Load models ----------
t0 = time.perf_counter()
device = os.environ.get("DEVICE", "cpu")
print("Loading embedding model:", EMB_MODEL)
embedding_model = SentenceTransformer(EMB_MODEL, device=device)
print("Embedding model loaded.")

print("Loading FAISS index from:", FAISS_PATH)
faiss_index = faiss.read_index(FAISS_PATH)
print("FAISS index loaded. ntotal =", getattr(faiss_index, "ntotal", "unknown"))

with gzip.open(METAS_PATH, "rb") as f:
    metas = pickle.load(f)
if isinstance(metas, dict) and "corpus" in metas:
    corpus = metas["corpus"]
else:
    corpus = metas
with gzip.open(BM25_PATH, "rb") as f:
    bm25 = pickle.load(f)

metadatas = corpus
print("Loaded metas and BM25. corpus size:", len(corpus))
print("Resources load time: %.2fs" % (time.perf_counter() - t0))

answer_cache = TTLCache(maxsize=CACHE_MAX, ttl=CACHE_TTL)

# ---------- Utility functions ----------
def _norm_key(s: str) -> str:
    return " ".join(s.lower().strip().split())

def cache_key_for_query(q: str) -> str:
    raw = f"{_norm_key(q)}|emb={EMB_MODEL}|k={TOP_K}|p={BM25_PREFILTER}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def minmax_scale(arr):
    arr = np.array(arr, dtype="float32")
    if len(arr) == 0 or np.max(arr) == np.min(arr):
        return np.zeros_like(arr)
    return (arr - np.min(arr)) / (np.max(arr) - np.min(arr))

def classify_followup(text: str):
    text = text.lower().strip()
    score = 0
    strong_followup_keywords = [
        r"\b(nó|cái (này|đó|ấy)|thủ tục (này|đó|ấy))\b",
        r"\b(vừa (nói|hỏi)|trước đó|ở trên|phía trên)\b",
        r"\b(tiếp theo|tiếp|còn nữa|ngoài ra)\b",
        r"\b(thế (thì|à)|vậy (thì|à)|như vậy)\b"
    ]
    detail_questions = [
        r"\b(mất bao lâu|thời gian|bao nhiêu tiền|chi phí|phí)\b",
        r"\b(ở đâu|tại đâu|chỗ nào|địa chỉ)\b",
        r"\b(cần (gì|những gì)|yêu cầu|điều kiện)\b"
    ]
    specific_services = [
        r"\b(làm|cấp|gia hạn|đổi|đăng ký)\s+(căn cước|cmnd|cccd)\b",
        r"\b(làm|cấp|gia hạn|đổi)\s+hộ chiếu\b",
        r"\b(đăng ký)\s+(kết hôn|sinh|tử|hộ khẩu)\b"
    ]
    if any(re.search(p, text) for p in strong_followup_keywords):
        score -= 3
    if any(re.search(p, text) for p in detail_questions):
        score -= 2
    if any(re.search(p, text) for p in specific_services):
        score += 3
    if len(text.split()) <= 4:
        score -= 1
    return 0 if score < 0 else 1

def retrieve(query: str, top_k=TOP_K):
    qv = embedding_model.encode([query], convert_to_numpy=True, normalize_embeddings=True).astype("float32")
    try:
        tokenized = query.split()
        bm25_scores_all = bm25.get_scores(tokenized)
        bm25_top_idx = np.argsort(-bm25_scores_all)[:BM25_PREFILTER].tolist()
    except Exception:
        bm25_top_idx = []
    k_cand = max(FAISS_CANDIDATES, top_k * 5)
    D, I = faiss_index.search(qv, k_cand)
    vec_idx = I[0].tolist()
    vec_scores = (1 - D[0]).tolist()
    union_idx = list(dict.fromkeys(vec_idx + bm25_top_idx))
    vec_map = {i: s for i, s in zip(vec_idx, vec_scores)}
    vec_list = [vec_map.get(i, 0.0) for i in union_idx]
    try:
        bm25_scores_all
    except NameError:
        bm25_scores_all = bm25.get_scores(query.split())
    bm25_list = [bm25_scores_all[i] if i < len(bm25_scores_all) else 0.0 for i in union_idx]
    vec_scaled = minmax_scale(vec_list)
    bm25_scaled = minmax_scale(bm25_list)
    fused = 0.7 * vec_scaled + 0.3 * bm25_scaled
    order = np.argsort(-fused)
    top_indices = [union_idx[i] for i in order[:top_k]]
    return top_indices

def get_full_procedure_text_by_parent(parent_id):
    procedure = procedure_map.get(parent_id) if 'procedure_map' in globals() else None
    if not procedure:
        for item in metadatas:
            if item.get('nguon') == parent_id or item.get('parent_id') == parent_id:
                procedure = item
                break
    if not procedure:
        return "Không tìm thấy thủ tục."
    field_map = {
        "ten_thu_tuc": "Tên thủ tục",
        "cach_thuc_thuc_hien": "Cách thức thực hiện",
        "thanh_phan_ho_so": "Thành phần hồ sơ",
        "trinh_tu_thuc_hien": "Trình tự thực hiện",
        "co_quan_thuc_hien": "Cơ quan thực hiện",
        "yeu_cau_dieu_kien": "Yêu cầu, điều kiện",
        "thu_tuc_lien_quan": "Thủ tục liên quan",
        "nguon": "Nguồn"
    }
    parts = []
    for k, v in procedure.items():
        if v and k in field_map:
            parts.append(f"{field_map[k]}:\n{str(v).strip()}")
    return "\n\n".join(parts)

try:
    with open(RAW_PATH, "r", encoding="utf-8") as f:
        raw_data = json.load(f)
        procedure_map = {item.get('nguon') or item.get('parent_id') or str(i): item for i, item in enumerate(raw_data)}
except Exception:
    procedure_map = {}

if API_KEY:
    try:
        generation_model = genai.GenerativeModel(GENAI_MODEL)
    except Exception as e:
        print("Warning: cannot initialize generation_model now:", e)
        generation_model = None
else:
    generation_model = None

# ---------- Flask ----------
app = Flask(__name__)
CORS(app)
chat_histories = {}

@app.route("/chat_debug", methods=["POST"])
def chat_debug():
    try:
        raw = request.get_data(as_text=True)
        headers = dict(request.headers)
        return jsonify({
            "ok": True,
            "raw_body_repr": repr(raw),
            "raw_body": raw,
            "headers": headers
        })
    except Exception as e:
        tb = traceback.format_exc()
        return jsonify({"ok": False, "error": str(e), "trace": tb}), 200

@app.route("/health", methods=["GET"])
def health():
    return {"status": "ok"}

@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json(force=True)
    except Exception as e:
        return jsonify({"error": "cannot parse JSON", "detail": str(e)}), 400

    user_query = data.get('question')
    session_id = data.get('session_id', 'default')
    if not user_query:
        return jsonify({"error": "No question provided"}), 400

    if session_id not in chat_histories:
        chat_histories[session_id] = []
    current_history = chat_histories[session_id]

    if classify_followup(user_query) == 0 and current_history:
        context = current_history[-1].get('context', '')
    else:
        idxs = retrieve(user_query, top_k=TOP_K)
        if idxs:
            parent_id = metadatas[idxs[0]].get("parent_id") or metadatas[idxs[0]].get("nguon")
            context = get_full_procedure_text_by_parent(parent_id)
        else:
            context = ""

    history_str = "\n".join([f"{item['role']}: {item['content']}" for item in current_history])
    prompt = f"""Bạn là trợ lý eGov-Bot dịch vụ công Việt Nam. Trả lời tiếng Việt, chính xác, dựa hoàn toàn vào DỮ LIỆU được cung cấp.
Nếu thiếu dữ liệu, hãy nói "Mình chưa có thông tin" và đưa link nguồn trong dữ liệu để người dùng tham khảo thêm.
Lịch sử trò chuyện:
{history_str}
DỮ LIỆU: --- {context} ---
CÂU HỎI: {user_query}"""

    try:
        if generation_model is None:
            raise RuntimeError("generation_model is not available. Check GOOGLE_API_KEY.")
        response = generation_model.generate_content(prompt)
        final_answer = getattr(response, "text", str(response))
    except Exception as e:
        tb = traceback.format_exc()
        return jsonify({"error": "LLM call failed", "detail": str(e), "trace": tb}), 200

    current_history.append({'role': 'user', 'content': user_query})
    current_history.append({'role': 'model', 'content': final_answer, 'context': context})
    return jsonify({"answer": final_answer})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 7860)))
