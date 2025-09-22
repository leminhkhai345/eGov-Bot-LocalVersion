# ======================================================
# I. TẠO TESTSET 100 MẪU TỪ TOÀN BỘ DỮ LIỆU
# Code chạy trên Google Colab
# ======================================================

import json, random, re, requests, time
from urllib.parse import urlparse, unquote
import evaluate
import pandas as pd

# Đọc dữ liệu gốc (toàn bộ)
with open("/content/drive/MyDrive/eGov-Bot/EDA/toan_bo_du_lieu_final.json", "r", encoding="utf-8") as f:
    data = json.load(f)

dialogs = []
for rec in data:
    # Lấy các trường quan trọng trong bản ghi
    ten = rec.get("ten_thu_tuc", "")
    co_quan = rec.get("co_quan_thuc_hien", "")
    ho_so = rec.get("thanh_phan_ho_so", "")
    trinh_tu = rec.get("trinh_tu_thuc_hien", "")
    link = rec.get("nguon", "")

    dialogue = []
    # Tạo câu hỏi-đáp cho từng trường (ưu tiên hồ sơ, rồi cơ quan, rồi trình tự)
    if ho_so:
        dialogue.append({
            "question": f"Làm thủ tục {ten.lower()} cần những giấy tờ gì?",
            "answer": ho_so.strip(),
            "expected_link": link
        })
    if co_quan:
        if not dialogue:
            dialogue.append({
                "question": f"Cơ quan nào thực hiện thủ tục {ten.lower()}?",
                "answer": co_quan.strip(),
                "expected_link": link
            })
        else:
            dialogue.append({
                "question": "Cơ quan nào thực hiện thủ tục này?",
                "answer": co_quan.strip(),
                "expected_link": link
            })
    if trinh_tu:
        if not dialogue:
            dialogue.append({
                "question": f"Trình tự thực hiện thủ tục {ten.lower()} là gì?",
                "answer": trinh_tu.strip(),
                "expected_link": link
            })
        else:
            dialogue.append({
                "question": "Vậy trình tự thế nào?",
                "answer": trinh_tu.strip(),
                "expected_link": link
            })

    # Nếu có ít nhất 1 QA thì thêm vào danh sách
    if dialogue:
        dialogs.append({
            "context": ten,      # Lưu context là tên thủ tục
            "dialogue": dialogue
        })

# Gom tất cả các turn (mỗi turn = 1 câu hỏi-đáp)
all_turns = []
for d in dialogs:
    for t in d["dialogue"]:
        all_turns.append({
            "context": d["context"],
            "dialogue": [t]   # vẫn giữ format multi-turn
        })

print(f"Tổng số turn có sẵn: {len(all_turns)}")

# Lấy ngẫu nhiên đúng 100 turn (nếu dữ liệu đủ nhiều)
if len(all_turns) >= 100:
    final_dialogs = random.sample(all_turns, 100)
else:
    final_dialogs = all_turns

print(f"Số mẫu test chọn: {len(final_dialogs)}")

# Lưu ra file JSON để dùng cho đánh giá
out_path = "/content/drive/MyDrive/eGov-Bot/EDA/testset_100_multi_turn.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(final_dialogs, f, ensure_ascii=False, indent=2)

print(f"✅ Testset đã lưu tại: {out_path}")


# ======================================================
# II. CHẠY ĐÁNH GIÁ TRÊN TESTSET VỪA TẠO
# ======================================================

import json, random, re, requests, time
from urllib.parse import urlparse, unquote
from tqdm import tqdm
import evaluate
import pandas as pd

# Hàm tách link từ câu trả lời của chatbot (trường hợp có markdown hoặc URL thuần)
def extract_links(text):
    """Tách URL từ text (Markdown + plain URL)."""
    if not text:
        return []
    text = str(text)
    md = re.findall(r'\[.*?\]\((https?://[^\s)]+)\)', text)   # link dạng markdownzal
    plain = re.findall(r'https?://[^\s\)\]\}\'"]+', text)     # link dạng thuần
    urls = md + plain
    seen, out = set(), []
    for u in urls:
        u = u.strip().rstrip('.,;:!?)]}\'"')   # loại bỏ ký tự thừa cuối URL
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out[-1]   # chỉ lấy link cuối cùng nếu có nhiều

# Đọc file testset đã chuẩn bị
final_dialogs = json.load(open("D:\\testset_single_turn.json", "r", encoding="utf-8"))

# API chatbot (server local)
API_ENDPOINT = "http://localhost:7860/chat"

# Hàm gọi chatbot với retry
def call_chatbot(question, session_id, retries=3):
    """Gọi API chatbot với retry và log lỗi."""
    for attempt in range(retries):
        try:
            resp = requests.post(
                API_ENDPOINT,
                json={"question": question, "session_id": session_id},
                timeout=30
            )
            if resp.status_code == 200:
                return resp.json().get("answer", "")
            else:
                print(f"❌ Lỗi API {resp.status_code} (thử {attempt+1}/{retries}) cho câu: {question}")
                print("Chi tiết:", resp.text[:300])
        except Exception as e:
            print(f"❌ Exception (thử {attempt+1}/{retries}): {e} cho câu: {question}")
        time.sleep(2)
    return ""

# Chạy đánh giá: gọi chatbot cho từng câu hỏi và lưu kết quả
final_questions = json.load(open("D:\\testset_single_turn.json", "r", encoding="utf-8"))

results = []
for item in final_questions:
    q = item["question"]
    gold = item["answer"]
    expected_link = item["expected_link"]

    try:
        resp = requests.post(API_ENDPOINT, json={"question": q}, timeout=30)
        pred = resp.json().get("answer", "") if resp.status_code == 200 else ""
    except:
        pred = ""

    # Trích xuất link chatbot trả về
    pred_links = extract_links(pred)

    results.append({
        "question": q,
        "gold_answer": gold,
        "expected_link": expected_link,
        "predicted_answer": pred,
        "predicted_links": pred_links
    })

    time.sleep(1)   # nghỉ giữa các request để tránh quá tải


# ======================================================
# III. ĐÁNH GIÁ KẾT QUẢ
# ======================================================

import json
import evaluate

# Đọc kết quả chatbot đã lưu
with open("D:/test_results_single_turn.json", "r", encoding="utf-8") as f:
    results = json.load(f)

# Chuẩn bị dữ liệu cho BERTScore
preds = [r.get("predicted_answer", "") for r in results]
refs = [r.get("gold_answer", "") for r in results]

# Tính BERTScore (đo chất lượng câu trả lời theo ngữ nghĩa)
bertscore = evaluate.load("bertscore")
bert_out = bertscore.compute(predictions=preds, references=refs, lang="vi")

# Lấy giá trị trung bình cho precision, recall, f1
avg_precision = sum(bert_out["precision"]) / len(bert_out["precision"])
avg_recall = sum(bert_out["recall"]) / len(bert_out["recall"])
avg_f1 = sum(bert_out["f1"]) / len(bert_out["f1"])

print("\n=== Answer Quality (Semantic) ===")
print(f"Precision: {avg_precision:.4f}")
print(f"Recall: {avg_recall:.4f}")
print(f"F1: {avg_f1:.4f}")

# Đánh giá độ chính xác khi chatbot trả về link
total = len(results)
matches = sum(1 for r in results if r.get("expected_link") == r.get("predicted_links"))
ratio = matches / total if total > 0 else 0

print("\n=== Link Match ===")
print(f"Tổng số phần tử: {total}")
print(f"Số phần tử trùng khớp: {matches}")
print(f"Tỷ lệ trùng khớp: {ratio:.2%}")
