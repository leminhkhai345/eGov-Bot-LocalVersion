
# -*- coding: utf-8 -*-
import time
import json
import os
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException, TimeoutException
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup

# ==============================================================================
# PHẦN 1: CÁC HÀM CHỨC NĂNG
# ==============================================================================

def setup_driver():
    print("... _Đang khởi tạo trình duyệt Chrome_ ...")
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('log-level=3')
    options.add_argument("window-size=1920,1080")

    service = ChromeService(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    print("_Trình duyệt đã sẵn sàng!_")
    return driver

def scrape_procedure_details(page_source, url):
    try:
        soup = BeautifulSoup(page_source, 'html.parser')
        defaults = {
            'ten_thu_tuc': "Không tìm thấy", 'cach_thuc_thuc_hien': "Không tìm thấy",
            'thanh_phan_ho_so': "Không tìm thấy", 'trinh_tu_thuc_hien': "Không tìm thấy",
            'co_quan_thuc_hien': "Không tìm thấy", 'yeu_cau_dieu_kien': "Không tìm thấy",
            'thu_tuc_lien_quan': "Không tìm thấy"
        }

        # 1. Tên thủ tục
        title_tag = soup.find('h1')
        if title_tag:
            defaults['ten_thu_tuc'] = title_tag.get_text(strip=True)

        # 2. Cách thức thực hiện
        all_tables = soup.find_all('table', class_='table-data')
        for table in all_tables:
            header = table.find('thead')
            if header and 'hình thức nộp' in header.get_text(strip=True).lower():
                rows = []
                for row in table.find('tbody').find_all('tr'):
                    cells = [cell.get_text(strip=True, separator=' ') for cell in row.find_all('td')]
                    if len(cells) >= 4:
                        rows.append(f"- Hình thức: {cells[0]}. Thời hạn: {cells[1]}. Phí: {cells[2]}. Mô tả: {cells[3]}")
                if rows:
                    defaults['cach_thuc_thuc_hien'] = "\n".join(rows)
                break

        # 3. Thành phần hồ sơ
        ho_so_header = soup.find('h2', string=lambda text: text and 'thành phần hồ sơ' in text.lower())
        if ho_so_header and ho_so_header.find_next_sibling('div'):
            rows = []
            for table_hs in ho_so_header.find_next_sibling('div').find_all('table', class_='table-data'):
                for row in table_hs.find('tbody').find_all('tr'):
                    first_cell = row.find('td', class_='justify')
                    if first_cell:
                        rows.append(first_cell.get_text(strip=True))
            if rows:
                defaults['thanh_phan_ho_so'] = "\n".join(rows)

        # 4. Trình tự thực hiện
        trinh_tu_header = soup.find('h2', string=lambda text: text and 'trình tự thực hiện' in text.lower())
        if trinh_tu_header and trinh_tu_header.find_next_sibling('div'):
            defaults['trinh_tu_thuc_hien'] = trinh_tu_header.find_next_sibling('div').get_text(strip=True, separator='\n')

        # 5. Cơ quan thực hiện, Yêu cầu điều kiện
        list_expand_divs = soup.find_all('div', class_='list-expand')
        for div in list_expand_divs:
            for item in div.find_all('div', class_='item'):
                title_tag = item.find('div', class_='title')
                content_tag = item.find('div', class_='content')
                if title_tag and content_tag:
                    title_text = title_tag.get_text(strip=True).lower()
                    content_text = content_tag.get_text(strip=True, separator='\n')
                    if 'cơ quan thực hiện' in title_text:
                        defaults['co_quan_thuc_hien'] = content_text
                    elif 'yêu cầu, điều kiện' in title_text:
                        defaults['yeu_cau_dieu_kien'] = content_text
        
        # 6. Thủ tục hành chính liên quan
        lien_quan_header = soup.find('h2', string=lambda text: text and 'thủ tục hành chính liên quan' in text.lower())
        if lien_quan_header and lien_quan_header.find_next_sibling('ul'):
            lien_quan_ul = lien_quan_header.find_next_sibling('ul')
            related_items = [li.get_text(strip=True) for li in lien_quan_ul.find_all('li')]
            if related_items:
                defaults['thu_tuc_lien_quan'] = "\n".join(related_items)
            else:
                defaults['thu_tuc_lien_quan'] = lien_quan_ul.get_text(strip=True)

        defaults['nguon'] = url
        return defaults
    except Exception as e:
        print(f"Lỗi khi phân tích HTML trang chi tiết: {url} - {e}")
        return None

def get_all_detail_links(driver, start_url):
    all_detail_links = []
    wait = WebDriverWait(driver, 15)
    
    try:
        driver.get(start_url)
        wait.until(EC.presence_of_element_located((By.ID, "table-main")))
        print(f"   Đã mở trang danh sách: {start_url}")
    except TimeoutException:
        print(f"   Lỗi: Không thể tải trang danh sách trong thời gian chờ. Bỏ qua URL này.")
        return []

    page_count = 1
    while True:
        print(f"   --- Đang cào các link ở Trang {page_count} ---")
        try:
            first_row_element = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#table-main tbody tr")))
        except TimeoutException:
            print("   Không tìm thấy hàng dữ liệu nào trong bảng. Có thể trang này không có dữ liệu.")
            break

        soup = BeautifulSoup(driver.page_source, 'html.parser')
        base_url = 'https://thutuc.dichvucong.gov.vn/p/home/'
        main_table = soup.find('table', id='table-main')
        if main_table and main_table.find('tbody'):
            links_found_on_page = 0
            for row in main_table.find('tbody').find_all('tr'):
                a_tag = row.find('a')
                if a_tag and a_tag.get('href'):
                    relative_link = a_tag.get('href')
                    full_link = base_url + relative_link
                    if full_link not in all_detail_links:
                        all_detail_links.append(full_link)
                        links_found_on_page += 1
            print(f"   Đã tìm thấy {links_found_on_page} link mới.")
        else:
            print("   Không tìm thấy bảng dữ liệu trên trang này.")

        try:
            pagination_area = driver.find_element(By.ID, "paginationPanel")
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", pagination_area)
            time.sleep(1) 
            next_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "li.next:not(.disabled) a")))
            driver.execute_script("arguments[0].click();", next_button)
            wait.until(EC.staleness_of(first_row_element))
            page_count += 1
        except (NoSuchElementException, TimeoutException):
            print("   Không tìm thấy nút 'Next' hoặc đã đến trang cuối cùng.")
            break

    print(f"   Đã thu thập được tổng cộng {len(all_detail_links)} link chi tiết.")
    return all_detail_links

# ==============================================================================
# PHẦN 2: CHƯƠNG TRÌNH CHÍNH
# ==============================================================================
if __name__ == '__main__':
    TARGET_URLS = {
        "Cac_Bo_Nganh": 'https://thutuc.dichvucong.gov.vn/p/home/dvc-tthc-category.html?tinh_bo=0&tu_khoa=&co_quan_cong_bo=-1&cap_thuc_hien=-1&linh_vuc=-1&loai_tthc=-1&doi_tuong_thuc_hien=-1&is_advanced_search=0',
        "Da_Nang": 'https://thutuc.dichvucong.gov.vn/p/home/dvc-tthc-category.html?loai_tthc=0&co_quan_cong_bo=426100&tinh_bo=1&is_advanced_search=1',
        "TP_HCM": 'https://thutuc.dichvucong.gov.vn/p/home/dvc-tthc-category.html?loai_tthc=0&co_quan_cong_bo=411312&tinh_bo=1&is_advanced_search=1',
        "Ha_Noi": 'https://thutuc.dichvucong.gov.vn/p/home/dvc-tthc-category.html?loai_tthc=0&co_quan_cong_bo=389181&tinh_bo=1&is_advanced_search=1'
    }

    SUFFIXES = {
        "Cac_Bo_Nganh": None,
        "Da_Nang": " (TP Đà Nẵng)",
        "TP_HCM": " (TP Hồ Chí Minh)",
        "Ha_Noi": " (TP Hà Nội)"
    }

    FINAL_OUTPUT_FILE = 'toan_bo_du_lieu_final.json'

    main_driver = setup_driver()
    wait = WebDriverWait(main_driver, 15)
    all_procedures_data = []
    
    for name, start_url in TARGET_URLS.items():
        print(f"\n========================================================")
        print(f"BẮT ĐẦU CÀO DỮ LIỆU CỦA: {name}")
        print(f"========================================================")

        detail_links = get_all_detail_links(main_driver, start_url)
        if not detail_links:
            print(f"Không có link nào để cào cho {name}. Bỏ qua.")
            continue

        suffix = SUFFIXES.get(name)

        print(f"\n--- Bắt đầu cào dữ liệu chi tiết cho {name} ---")
        for i, link in enumerate(detail_links):
            print(f"   [{i + 1}/{len(detail_links)}] Đang xử lý: {link}")
            try:
                main_driver.get(link)
                wait.until(EC.presence_of_element_located((By.TAG_NAME, "h1")))
                data = scrape_procedure_details(main_driver.page_source, link)
                if data:
                    if suffix and "ten_thu_tuc" in data:
                        data["ten_thu_tuc"] = data["ten_thu_tuc"].strip() + suffix
                    all_procedures_data.append(data)
                time.sleep(0.5) 
            except Exception as e:
                print(f"  Lỗi nghiêm trọng khi xử lý link {link}: {e}")
                with open('error_links.txt', 'a', encoding='utf-8') as f_err:
                    f_err.write(f"{link}\n")
                continue

        print(f"- Hoàn tất cào dữ liệu cho: {name}")

    print("\n========================================================")
    print("Đóng trình duyệt...")
    main_driver.quit()

    print(f"Đang lưu tất cả dữ liệu vào file '{FINAL_OUTPUT_FILE}'...")
    try:
        with open(FINAL_OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(all_procedures_data, f, indent=4, ensure_ascii=False)
        print(f"\nHOÀN TẤT!")
        print(f"Đã lưu thành công dữ liệu của {len(all_procedures_data)} thủ tục.")
        print(f"File kết quả: {os.path.abspath(FINAL_OUTPUT_FILE)}")
    except Exception as e:
        print(f"Lỗi khi ghi file: {e}")
