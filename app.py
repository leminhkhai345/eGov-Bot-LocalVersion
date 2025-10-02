# app.py - Optimized eGov Chatbot with improved performance and error handling
import os
import shutil
import time
import hashlib
import gzip
import pickle
import json
import traceback
import re
from typing import Optional, List, Dict, Tuple, Any
from functools import lru_cache
import logging
from huggingface_hub import login, hf_hub_download

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cache and environment setup BEFORE heavy imports
os.environ.update({
    "HF_HOME": "/tmp/hf_home",
    "HF_HUB_CACHE": "/tmp/hf_cache",
    "TRANSFORMERS_CACHE": "/tmp/hf_cache",
    "HF_DATASETS_CACHE": "/tmp/hf_datasets",
    "XDG_CACHE_HOME": "/tmp/.cache",
    "HOME": "/tmp"
})

# Create directories
for path in ["/tmp/hf_home", "/tmp/hf_cache", "/tmp/hf_datasets", "/tmp/.cache"]:
    os.makedirs(path, exist_ok=True)

shutil.rmtree("/.cache", ignore_errors=True)

# Heavy imports after environment setup
import torch
import numpy as np
import faiss
from flask import Flask, request, jsonify, Response, render_template, send_from_directory, abort
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
from rank_bm25 import BM25Okapi
import google.generativeai as genai
from cachetools import TTLCache, LRUCache
import unicodedata

# Configuration with hardcoded repo_id
class Config:
    EMB_MODEL = "AITeamVN/Vietnamese_Embedding"
    GENAI_MODEL = "gemini-2.5-flash"
    HF_REPO_ID = "HungBB/egov-bot-data"   # ✅ Hardcoded repo_id
    REPO_TYPE = "dataset"

    # Performance tuning
    TOP_K = 3
    FAISS_CANDIDATES = 50
    BM25_PREFILTER = 200
    
    # Caching
    CACHE_TTL = 3600
    CACHE_MAX = 2000
    
    # Similarity thresholds
    CONTEXT_SIM_THRESHOLD = 0.62
    MIN_CONTEXT_LEN_FOR_SIM = 50
    SWITCH_MARGIN = 0.15
    
    # Query processing
    LONG_QUERY_THRESHOLD = 50
    HISTORY_FOLLOWUP_THRESHOLD = 40

config = Config()

# Global variables for models and data
faiss_index = None
metadatas = None
bm25 = None
parent_id_to_chunks = {}
embedding_model = None
generation_model = None
generation_model_2 = None
procedure_dict = {}

# Caches
answer_cache = TTLCache(maxsize=config.CACHE_MAX, ttl=config.CACHE_TTL)
embedding_cache = LRUCache(maxsize=1000)  # Cache for embeddings

# Field mapping for response formatting
FIELD_MAP = {
    "ten_thu_tuc": "Tên thủ tục",
    "cach_thuc_thuc_hien": "Cách thức thực hiện",
    "thanh_phan_ho_so": "Thành phần hồ sơ",
    "trinh_tu_thuc_hien": "Trình tự thực hiện",
    "co_quan_thuc_hien": "Cơ quan thực hiện",
    "yeu_cau_dieu_kien": "Yêu cầu, điều kiện",
    "thu_tuc_lien_quan": "Thủ tục liên quan",
    "nguon": "Nguồn",
}

popular_procedures_path = "user_data/popular_procedures.json"
user_feedback_path = "user_data/user_feedback.json"
logger.info("Loading popular_procedures data...")
with open(popular_procedures_path, "r", encoding="utf-8") as f:
    popular_procedures_data = json.load(f)
logger.info("Loading user_feedback data...")
with open(user_feedback_path, "r", encoding="utf-8") as f:
    user_feedback_data = json.load(f) 

def load_resources():
    """Load all required resources từ Hugging Face Hub"""
    global faiss_index, metadatas, bm25, parent_id_to_chunks, embedding_model, generation_model, generation_model_2, procedure_dict
    
    start_time = time.perf_counter()
    logger.info("Starting resource loading...")

    try:
        # ✅ Tải file từ Hugging Face
        logger.info(f"Downloading files from HF repo: {config.HF_REPO_ID}")
        faiss_path = hf_hub_download(repo_id=config.HF_REPO_ID, filename="index.faiss", repo_type=config.REPO_TYPE)
        metas_path = hf_hub_download(repo_id=config.HF_REPO_ID, filename="metas.pkl.gz", repo_type=config.REPO_TYPE)
        bm25_path = hf_hub_download(repo_id=config.HF_REPO_ID, filename="bm25.pkl.gz", repo_type=config.REPO_TYPE)
        raw_path = hf_hub_download(repo_id=config.HF_REPO_ID, filename="toan_bo_du_lieu_final.json", repo_type=config.REPO_TYPE)

        # Load FAISS index
        logger.info("Loading FAISS index...")
        faiss_index = faiss.read_index(faiss_path)
        logger.info(f"FAISS loaded. ntotal = {getattr(faiss_index, 'ntotal', 'unknown')}")

        # Load metadata
        logger.info("Loading metadata...")
        with gzip.open(metas_path, "rb") as f:
            metas = pickle.load(f)
        metadatas = metas.get("corpus", metas) if isinstance(metas, dict) else metas

        # Load BM25
        logger.info("Loading BM25...")
        with gzip.open(bm25_path, "rb") as f:
            bm25 = pickle.load(f)

        # Load raw data once
        logger.info("Loading raw JSON data...")
        with open(raw_path, "r", encoding="utf-8") as f:
            data = json.load(f)       

        # Dictionary lookup
        procedure_dict = {obj.get("nguon"): obj for obj in data}
        logger.info(f"Loaded {len(procedure_dict)} procedures into memory.")

        # Build parent_id mapping
        logger.info("Building parent_id mapping...")
        parent_id_to_chunks = {}
        for chunk in metadatas:
            key = chunk.get("parent_id") or chunk.get("nguon")
            if key:
                parent_id_to_chunks.setdefault(key, []).append(chunk)

        # Load embedding model
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Loading embedding model: {config.EMB_MODEL} on {device}")
        embedding_model = SentenceTransformer(config.EMB_MODEL, device=device)

        # Initialize generation model
        api_key = os.getenv("GOOGLE_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
            generation_model = genai.GenerativeModel(config.GENAI_MODEL)
            logger.info("Generation model initialized")
        else:
            logger.warning("GOOGLE_API_KEY missing - LLM calls will fail")

        api_key_2 = os.getenv("GOOGLE_API_KEY_2")
        if api_key_2:
            genai.configure(api_key=api_key_2)
            generation_model_2 = genai.GenerativeModel(config.GENAI_MODEL)
            logger.info("Generation model 2 initialized")
        else:
            logger.warning("GOOGLE_API_KEY 2 missing - LLM calls will fail")

        load_time = time.perf_counter() - start_time
        logger.info(f"Resources loaded successfully in {load_time:.2f}s")
        logger.info(f"Corpus size: {len(metadatas)}")

        return True

    except Exception as e:
        logger.error(f"Failed to load resources: {e}")
        traceback.print_exc()
        return False


# Utility functions
@lru_cache(maxsize=1000)
def normalize_text(text: str) -> str:
    """Normalize text for consistent processing"""
    return " ".join(text.lower().strip().split())

def cache_key_for_query(query: str, session_id: str = "", parent_id: str = "") -> str:
    """Generate cache key for query"""
    raw = f"{session_id}|{parent_id}|{normalize_text(query)}|{config.EMB_MODEL}|{config.TOP_K}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

@lru_cache(maxsize=100)
def get_query_embedding_cached(query: str) -> Optional[np.ndarray]:
    """Get cached query embedding"""
    try:
        emb = embedding_model.encode([query], convert_to_numpy=True, normalize_embeddings=True).astype("float32")[0]
        return emb
    except Exception as e:
        logger.warning(f"Embedding failed for query: {e}")
        return None

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Fast cosine similarity for normalized vectors"""
    if a is None or b is None:
        return 0.0
    try:
        # For normalized vectors, cosine similarity = dot product
        return float(np.dot(a, b))
    except Exception:
        return 0.0

def minmax_scale(arr: List[float]) -> np.ndarray:
    """MinMax scaling with better error handling"""
    arr = np.array(arr, dtype=np.float32)
    if len(arr) == 0:
        return arr
    
    arr_min, arr_max = np.min(arr), np.max(arr)
    if arr_max == arr_min:
        return np.zeros_like(arr)
    
    return (arr - arr_min) / (arr_max - arr_min)

def classify_followup(text: str) -> bool:
    """Follow-up classification:
    False nếu nhắc thủ tục cụ thể, đăng ký, giấy phép;
    Ngược lại coi là follow-up.
    Ngoại lệ: nếu chỉ nói 'thủ tục này/trên' hoặc 'giấy phép này/trên' thì vẫn coi là follow-up.
    """
    if not text or len(text.strip()) < 2:
        return False
    
    text_norm = normalize_text(text)

    # Ngoại lệ: thủ tục này/trên, giấy phép này/trên => follow-up
    exception_patterns = [
        r"thủ\s*tục\s+(này|trên)",
        r"giấy\s*phép\s+(này|trên)"
    ]
    if any(re.search(pattern, text_norm) for pattern in exception_patterns):
        return True

    # Nếu có nhắc đến 1 thủ tục cụ thể hoặc từ khóa đặc thù => new topic
    specific_patterns = [
        r"\bthủ\s*tục\s+\w+",     # thủ tục đăng ký, thủ tục cấp hộ chiếu...
        r"\bđăng\s*k(ý|i)\b",     # đăng ký / đăng kí
        r"\bgiấy\s*phép\b"        # giấy phép lái xe, giấy phép kinh doanh...
    ]
    if any(re.search(pattern, text_norm) for pattern in specific_patterns):
        return False

    # Mặc định coi là follow-up
    return True

def add_popular_procedures_data(name, popular_procedures_data, popular_procedures_path):
    found = False
    for proc in popular_procedures_data.get("popular_procedures", []):
        if proc["name"] == name:
            proc["total_queries"] += 1
            found = True
            break

    if not found:
        popular_procedures_data.setdefault("popular_procedures", []).append({
            "name": name,
            "total_queries": 1
        })

    # Ghi đè lại file JSON
    with open(popular_procedures_path, "w", encoding="utf-8") as f:
        json.dump(popular_procedures_data, f, ensure_ascii=False, indent=2)

def add_user_feedback_data(feedback_type, user_feedback_path):
    # Đọc dữ liệu cũ
    try:
        with open(user_feedback_path, "r", encoding="utf-8") as f:
            user_feedback_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        user_feedback_data = {"feedback_summary": {"likes": 0, "dislikes": 0}}

    # Cập nhật
    if feedback_type == "like":
        user_feedback_data["feedback_summary"]["likes"] += 1
    elif feedback_type == "dislike":
        user_feedback_data["feedback_summary"]["dislikes"] += 1
    else:
        raise ValueError("feedback_type phải là 'like' hoặc 'dislike'")

    # Ghi lại file
    with open(user_feedback_path, "w", encoding="utf-8") as f:
        json.dump(user_feedback_data, f, ensure_ascii=False, indent=2)

def retrieve_documents(query: str, top_k: int = None) -> List[int]:
    """Document retrieval using FAISS -> BM25 re-rank"""
    if top_k is None:
        top_k = config.TOP_K

    try:
        # Query embedding
        qv = embedding_model.encode(
            [query], 
            convert_to_numpy=True, 
            normalize_embeddings=True
        ).astype("float32")

        # FAISS search
        num_candidates = max(config.FAISS_CANDIDATES, top_k * 5)
        try:
            D, I = faiss_index.search(qv, num_candidates)
            candidate_indices = I[0].tolist()
        except Exception as e:
            logger.error(f"Error during FAISS search: {e}")
            return []

        # Lọc candidate hợp lệ
        valid_candidate_indices = [
            i for i in candidate_indices
            if 0 <= i < len(metadatas) and isinstance(metadatas[i], dict)
        ]

        # Lấy text từ metadata
        candidate_docs_text = [
            metadatas[i].get('text')
            or metadatas[i].get('raw')
            or metadatas[i].get('cach_thuc_thuc_hien')
            or ""
            for i in valid_candidate_indices
        ]

        if not any(candidate_docs_text):
            return valid_candidate_indices[:top_k]

        # BM25 re-rank
        try:
            temp_bm25 = BM25Okapi(candidate_docs_text)
            tokenized_query = query.split()
            scores = temp_bm25.get_scores(tokenized_query)
        except Exception as e:
            logger.error(f"BM25 re-rank error: {e}")
            return valid_candidate_indices[:top_k]

        # Sắp xếp theo score giảm dần
        order = np.argsort(-np.array(scores))
        final = [valid_candidate_indices[i] for i in order[:top_k]]

        logger.debug(f"Retrieved {len(final)} documents for query: {query[:50]}...")
        return final

    except Exception as e:
        logger.error(f"Retrieval failed: {e}")
        return []

def get_full_procedure_text(parent_id: str) -> str:
    """Get full procedure text by parent ID with caching"""
    if not parent_id:
        return "Không tìm thấy thủ tục."
    
    cache_key = f"procedure_{parent_id}"
    if cache_key in embedding_cache:
        return embedding_cache[cache_key]
    
    obj = procedure_dict.get(parent_id)
    if obj:
        parts = []
        for key, value in obj.items():
            if value and key in FIELD_MAP:
                parts.append(f"{FIELD_MAP[key]}:\n{value.strip()}")
                if key == "ten_thu_tuc":
                    add_popular_procedures_data(value.strip(), popular_procedures_data, popular_procedures_path)
        result = "\n\n".join(parts) if parts else "Không tìm thấy thông tin chi tiết."
        embedding_cache[cache_key] = result
        return result
    
    return "Không tìm thấy thủ tục."

class ContextManager:
    """Manages conversation context and follow-up logic"""
    
    @staticmethod
    def should_reuse_context(history: List[Dict], query: str) -> bool:
        """Determine if we should reuse previous context"""
        if not history:
            return False
        
        # For short histories, prefer follow-up behavior
        if len(history) < config.HISTORY_FOLLOWUP_THRESHOLD:
            return classify_followup(query)
        
        return classify_followup(query)
    
    @staticmethod
    def get_context_for_query(history: List[Dict], query: str) -> Tuple[str, Optional[str]]:
        """Get appropriate context for the query"""
        if not ContextManager.should_reuse_context(history, query):
            # New query - do fresh retrieval
            return ContextManager._fresh_retrieval(query)
        
        # Follow-up query - check previous context
        prev_entry = history[-1]
        prev_parent = prev_entry.get('parent_id')
        prev_context = prev_entry.get('context', '')
        
        if not (prev_parent and prev_context):
            return ContextManager._fresh_retrieval(query)
        
        # Check for strong follow-up references
        strong_refs = [r"\bnó\b", r"hồ sơ (này|đó)", r"thủ tục (này|đó)"]
        if any(re.search(pattern, query.lower()) for pattern in strong_refs):
            logger.debug(f"Strong follow-up reference detected, reusing context")
            return prev_context, prev_parent
        
        # For short queries, prefer reusing context
        if len(query) < config.LONG_QUERY_THRESHOLD:
            logger.debug(f"Short follow-up query, reusing context")
            return prev_context, prev_parent
        
        # For longer queries, check similarity
        return ContextManager._check_context_similarity(
            prev_entry, prev_context, prev_parent, query
        )
    
    @staticmethod
    def _fresh_retrieval(query: str) -> Tuple[str, Optional[str]]:
        """Perform fresh document retrieval"""
        try:
            indices = retrieve_documents(query)
            if indices:
                parent_id = metadatas[indices[0]].get("parent_id") or metadatas[indices[0]].get("nguon")
                context = get_full_procedure_text(parent_id)
                return context, parent_id
        except Exception as e:
            logger.error(f"Fresh retrieval failed: {e}")
        
        return "", None
    
    @staticmethod
    def _check_context_similarity(prev_entry: Dict, prev_context: str, prev_parent: str, query: str) -> Tuple[str, Optional[str]]:
        """Check similarity between query and contexts to decide"""
        try:
            query_emb = get_query_embedding_cached(query)
            if query_emb is None:
                return prev_context, prev_parent
            
            # Get or compute previous context embedding
            prev_context_emb = prev_entry.get('context_emb')
            if prev_context_emb is None and len(prev_context) >= config.MIN_CONTEXT_LEN_FOR_SIM:
                try:
                    prev_context_emb = embedding_model.encode(
                        [prev_context], convert_to_numpy=True, normalize_embeddings=True
                    ).astype("float32")[0]
                    prev_entry['context_emb'] = prev_context_emb
                except Exception as e:
                    logger.warning(f"Failed to embed previous context: {e}")
                    return prev_context, prev_parent
            
            # Get candidate from retrieval
            indices = retrieve_documents(query)
            if not indices:
                return prev_context, prev_parent
            
            candidate_parent = metadatas[indices[0]].get("parent_id") or metadatas[indices[0]].get("nguon")
            if not candidate_parent or candidate_parent == prev_parent:
                return prev_context, prev_parent
            
            # Get candidate context and embedding
            candidate_context = get_full_procedure_text(candidate_parent)
            if len(candidate_context) < config.MIN_CONTEXT_LEN_FOR_SIM:
                return prev_context, prev_parent
            
            try:
                candidate_emb = embedding_model.encode(
                    [candidate_context], convert_to_numpy=True, normalize_embeddings=True
                ).astype("float32")[0]
            except Exception:
                return prev_context, prev_parent
            
            # Compare similarities
            sim_prev = cosine_similarity(query_emb, prev_context_emb) if prev_context_emb is not None else 0.0
            sim_candidate = cosine_similarity(query_emb, candidate_emb)
            
            # Switch only if candidate is significantly better
            if (sim_candidate >= config.CONTEXT_SIM_THRESHOLD and 
                (sim_candidate - sim_prev) > config.SWITCH_MARGIN):
                logger.info(f"Switched context: sim_prev={sim_prev:.3f}, sim_candidate={sim_candidate:.3f}")
                return candidate_context, candidate_parent
            else:
                logger.debug(f"Kept previous context: sim_prev={sim_prev:.3f}, sim_candidate={sim_candidate:.3f}")
                return prev_context, prev_parent
                
        except Exception as e:
            logger.error(f"Context similarity check failed: {e}")
            return prev_context, prev_parent

def build_prompt(history: List[Dict], context: str, query: str) -> str:
    """Build optimized prompt"""
    if history:
        history_str = "\n".join([
            f"{item.get('role', 'unknown')}: {item.get('content', '')}" 
            for item in history[-10:]  # Limit history to last 10 entries
        ])
    else:
        history_str = ""
    
    return f"""Bạn là trợ lý eGov-Bot chuyên về dịch vụ công Việt Nam. Trả lời tiếng Việt, chính xác, dựa TRỌN VẸN vào DỮ LIỆU được cung cấp (nếu có). Luôn đính kèm các Nguồn (đường link) xuất hiện trong dữ liệu ở cuối.
Nếu KHÔNG tìm thấy thông tin rõ ràng trong DỮ LIỆU, trả lời: "Mình chưa có thông tin về [chủ đề]. Bạn hãy ghi rõ Thủ tục [chủ đề] để mình tìm chính xác hơn. Hoặc bạn có thể tham khảo thêm tại: [Cổng dịch vụ công quốc gia](https://dichvucong.gov.vn/p/home/dvc-trang-chu.html)".
Lịch sử trò chuyện:
{history_str}
DỮ LIỆU (nếu có):
---
{context}
---
CÂU HỎI: {query}
TRẢ LỜI (rõ ràng, ngắn gọn, nếu cần liệt kê thành phần/điểm, hãy dùng bullets):"""

def store_conversation_entry(history: List[Dict], query: str, response: str, 
                           context: str, parent_id: Optional[str]) -> None:
    """Store conversation entry with context embedding"""
    # Compute context embedding for future similarity checks
    context_emb = None
    if context and len(context) >= config.MIN_CONTEXT_LEN_FOR_SIM:
        try:
            context_emb = embedding_model.encode(
                [context], convert_to_numpy=True, normalize_embeddings=True
            ).astype("float32")[0]
        except Exception as e:
            logger.warning(f"Failed to compute context embedding: {e}")
    
    # Add entries to history
    history.extend([
        {'role': 'user', 'content': query},
        {
            'role': 'model',
            'content': response,
            'context': context,
            'parent_id': parent_id,
            'context_emb': context_emb
        }
    ])
    
    # Trim history if too long
    if len(history) > 20:
        history[:] = history[-20:]

# Flask application
app = Flask(__name__)
CORS(app, origins=["*"])

# Session storage
chat_histories: Dict[str, List[Dict]] = {}

@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "timestamp": time.time(),
        "faiss_loaded": faiss_index is not None,
        "embedding_model_loaded": embedding_model is not None,
        "generation_model_loaded": generation_model is not None,
        "generation_model_2_loaded": generation_model_2 is not None
    })

@app.route("/chat", methods=["POST"])
def chat():
    """Main chat endpoint with optimized processing"""
    start_time = time.perf_counter()
    
    # Parse and validate request
    try:
        data = request.get_json(force=True)
    except Exception as e:
        return jsonify({"error": "Invalid JSON", "detail": str(e)}), 400
    
    user_query = data.get('question', '').strip()
    if not user_query:
        return jsonify({"error": "No question provided"}), 400
    
    session_id = data.get('session_id', 'default')
    use_stream = data.get('stream', False)
    
    # Initialize or get session history
    if session_id not in chat_histories:
        chat_histories[session_id] = []
    
    current_history = chat_histories[session_id]
    
    # Check cache first
    last_parent = current_history[-1].get('parent_id', '') if current_history else ""
    cache_key = cache_key_for_query(user_query, session_id=session_id, parent_id=str(last_parent))
    
    if cache_key in answer_cache:
        cached_response = answer_cache[cache_key]
        store_conversation_entry(current_history, user_query, cached_response, 'FROM_CACHE', last_parent)
        return jsonify({"answer": cached_response, "cached": True})
    
    # Get context for the query
    try:
        context, used_parent_id = ContextManager.get_context_for_query(current_history, user_query)
    except Exception as e:
        logger.error(f"Context retrieval failed: {e}")
        context, used_parent_id = "", None
    
    # Build prompt
    prompt = build_prompt(current_history, context, user_query)
    
    try:
        if generation_model is None:
            raise RuntimeError("Generation model not available. Check GOOGLE_API_KEY.")
        
        if not use_stream:
            # Non-streaming response
            try:
                response = generation_model.generate_content(prompt)
                final_answer = getattr(response, "text", str(response))
            except Exception as e:
                # Check if it's a 429 quota error and fallback to model 2
                if "429" in str(e) or "quota" in str(e).lower():
                    if generation_model_2 is not None:
                        response = generation_model_2.generate_content(prompt)
                        final_answer = getattr(response, "text", str(response))
                    else:
                        raise RuntimeError("Primary model quota exceeded and fallback model not available.")
                else:
                    raise e
            
            # Cache the response
            answer_cache[cache_key] = final_answer
            
            # Store in conversation history
            store_conversation_entry(current_history, user_query, final_answer, context, used_parent_id)
            
            processing_time = int((time.perf_counter() - start_time) * 1000)
            
            return jsonify({
                "answer": final_answer,
                "cached": False,
                "latency_ms": processing_time,
                "context_source": used_parent_id
            })
        
        else:
            # Streaming response
            def generate_stream():
                full_response = ""
                current_model = generation_model
                
                try:
                    for chunk in current_model.generate_content(prompt, stream=True):
                        chunk_text = getattr(chunk, "text", "")
                        full_response += chunk_text
                        yield chunk_text
                except Exception as e:
                    if generation_model_2 is not None:
                        # Switch to fallback model and continue streaming
                        for chunk in generation_model_2.generate_content(prompt, stream=True):
                            chunk_text = getattr(chunk, "text", "")
                            full_response += chunk_text
                            yield chunk_text
                    else:
                        if generation_model_2 is None:
                            yield "Error: Primary model quota exceeded and fallback model not available."
                        else:
                            yield f"Error: {str(e)}"
                finally:
                    # Cache and store after streaming completes
                    if full_response:
                        answer_cache[cache_key] = full_response
                        store_conversation_entry(current_history, user_query, full_response, context, used_parent_id)
            
            return Response(generate_stream(), mimetype='text/plain')
    
    except Exception as e:
        # Log the error and return appropriate response
        print(f"ERROR:__main__:LLM generation failed: {e}")
        
        processing_time = int((time.perf_counter() - start_time) * 1000)
        
        if not use_stream:
            return jsonify({
                "answer": f"Xin lỗi, đã có lỗi xảy ra: {str(e)}",
                "cached": False,
                "latency_ms": processing_time,
                "context_source": used_parent_id,
                "error": True
            }), 500
        else:
            def error_stream():
                yield f"Xin lỗi, đã có lỗi xảy ra: {str(e)}"
            
            return Response(error_stream(), mimetype='text/plain')
    
    except Exception as e:
        logger.error(f"LLM generation failed: {e}")
        error_response = {
            "error": "Generation failed",
            "detail": str(e),
            "fallback": "Xin lỗi, hệ thống đang gặp sự cố. Vui lòng thử lại sau."
        }
        return jsonify(error_response), 500
    
# Tìm đến hàm này trong file app.py và thay thế nó
@app.route("/save_feedback", methods=["POST"])
def save_feedback():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Thiếu dữ liệu JSON"}), 400

    # Lấy dữ liệu mới từ frontend (thay vì chỉ lấy 'feedback')
    new_feedback = data.get('new_feedback')
    previous_feedback = data.get('previous_feedback')

    # Không cần làm gì nếu không có sự thay đổi
    if new_feedback == previous_feedback:
        return jsonify({"status": "no_change"}), 200

    try:
        # Mở và đọc file JSON
        with open(user_feedback_path, "r+") as f:
            user_feedback_data = json.load(f)
            summary = user_feedback_data.get('feedback_summary', {'likes': 0, 'dislikes': 0})

            # --- LOGIC CẬP NHẬT MỚI ---
            
            # 1. Trừ đi 1 cho phản hồi cũ (nếu có)
            if previous_feedback == 'like':
                summary['likes'] = max(0, summary.get('likes', 0) - 1)
            elif previous_feedback == 'dislike':
                summary['dislikes'] = max(0, summary.get('dislikes', 0) - 1)

            # 2. Cộng 1 cho phản hồi mới (nếu có)
            if new_feedback == 'like':
                summary['likes'] = summary.get('likes', 0) + 1
            elif new_feedback == 'dislike':
                summary['dislikes'] = summary.get('dislikes', 0) + 1
            
            # --- KẾT THÚC LOGIC CẬP NHẬT ---

            user_feedback_data['feedback_summary'] = summary
            
            # Quay lại đầu file để ghi đè nội dung mới
            f.seek(0)
            json.dump(user_feedback_data, f, ensure_ascii=False, indent=2)
            f.truncate()

        return jsonify({
            "status": "success",
            "summary": user_feedback_data["feedback_summary"]
        })
        
    except FileNotFoundError:
        return jsonify({"error": "Không tìm thấy file user_feedback.json"}), 404
    except Exception as e:
        logger.error(f"Lỗi khi lưu feedback: {str(e)}")
        return jsonify({"error": f"Lỗi server: {str(e)}"}), 500
    
@app.route('/user_data/<path:filename>')
def user_data_files(filename):
    """
    Phục vụ file từ thư mục user_data một cách an toàn.
    Chống directory traversal bằng cách so sánh đường dẫn tuyệt đối.
    """
    user_data_dir = os.path.join(app.root_path, 'user_data')

    # Tạo đường dẫn tuyệt đối đến file requested
    requested_path = os.path.abspath(os.path.join(user_data_dir, filename))
    user_data_dir_abs = os.path.abspath(user_data_dir)

    # Bảo đảm requested_path nằm trong user_data_dir
    # thêm os.sep để tránh tình huống user_data_dir = /foo/bar và requested_path = /foo/barista
    if not (requested_path == user_data_dir_abs or requested_path.startswith(user_data_dir_abs + os.sep)):
        # Nếu không nằm trong thư mục user_data -> 404
        abort(404)

    # Kiểm tra tồn tại file
    if not os.path.isfile(requested_path):
        abort(404)

    # Trả file (Flask sẽ tự xử lý Content-Type)
    return send_from_directory(user_data_dir, filename, as_attachment=False)

@app.route("/clear_session", methods=["POST"])
def clear_session():
    """Clear conversation history for a session"""
    data = request.get_json(force=True)
    session_id = data.get('session_id', 'default')
    
    if session_id in chat_histories:
        del chat_histories[session_id]
        return jsonify({"status": "success", "message": f"Session {session_id} cleared"})
    
    return jsonify({"status": "success", "message": "Session not found"})

@app.route("/")
def home():
    return render_template("index.html")

# Initialize everything
def initialize_application():
    """Initialize the application with all resources"""
    logger.info("=== INITIALIZING eGOV CHATBOT ===")
    
    # Setup HF authentication
    # setup_huggingface()
    
    # Load all resources
    if not load_resources():
        raise RuntimeError("Failed to initialize application resources")
    
    logger.info("=== CHATBOT READY ===")

if __name__ == "__main__":
    try:
        initialize_application()
        port = int(os.getenv("PORT", 7860))
        app.run(host="0.0.0.0", port=port, debug=False)
    except Exception as e:
        logger.error(f"Failed to start application: {e}")
        raise