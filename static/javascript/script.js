document.addEventListener('DOMContentLoaded', () => {

    // Biến để lưu trữ toàn bộ dữ liệu thủ tục
    let allProcedures = [];

    // TẢI DỮ LIỆU TỪ FILE JSON 
    fetch(typeof DATA_JSON_URL !== 'undefined' ? DATA_JSON_URL : '/static/data/toan_bo_du_lieu_final.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Lỗi mạng hoặc không tìm thấy file toan_bo_du_lieu_final.json');
            }
            return response.json();
        })
        .then(data => {
            allProcedures = data;
            console.log(`Tải thành công ${allProcedures.length} thủ tục từ file JSON.`);
        })
        .catch(error => {
            console.error('Lỗi nghiêm trọng khi tải file dữ liệu:', error);
            alert('Không thể tải được cơ sở dữ liệu thủ tục. Vui lòng kiểm tra lại file và đường dẫn. Chức năng tìm kiếm sẽ không hoạt động.');
        });

    // Lấy các phần tử DOM 
    const getEl = (id) => document.getElementById(id);

    const startChatBtn = getEl('start-chat-btn');
    const chatbotContainer = getEl('chatbot-container');
    const infoModal = getEl('info-modal');
    const searchForm = getEl('search-form');
    const searchInput = getEl('search-input');
    const resultsContainer = getEl('results-container');
    const resultsTitle = getEl('results-title');
    const resultsList = getEl('results-list');
    const homeLink = getEl('home-link');
    const guideBtn = getEl('guide-btn');
    const contactBtn = getEl('contact-btn');
    const chatForm = getEl('chat-form');
    const chatInput = getEl('chat-input');
    const chatMessagesContainer = getEl('chat-messages');
    const homeLinkMobile = getEl('home-link-mobile');
    const guideBtnMobile = getEl('guide-btn-mobile');
    const contactBtnMobile = getEl('contact-btn-mobile');
    const clearChatBtn = getEl('clear-chat-btn');
    const statsModal = getEl('stats-modal');
    const statsOptions = document.querySelectorAll('.stats-option');
    const statsModalTitle = getEl('stats-modal-title');
    const statsModalBody = getEl('stats-modal-body');


    // Hàm hiển thị chi tiết thủ tục (dùng chung cho search và top10)
    function showProcedureDetails(proc, titleText, triggerElement) {
        const modalBody = getEl('info-modal-body');

        // đảm bảo class giống nhau như khi hiển thị từ tìm kiếm
        modalBody.className = 'flex-grow p-6 overflow-y-auto custom-scrollbar prose text-white/90';

        // Tạo markdown content từ object proc (an toàn nếu trường thiếu)
        const markdownContent = `
### Cơ quan thực hiện
${proc.co_quan_thuc_hien || '_Chưa có thông tin_'}

### Yêu cầu, điều kiện
${proc.yeu_cau_dieu_kien || '_Chưa có thông tin_'}

### Thành phần hồ sơ
${proc.thanh_phan_ho_so || '_Chưa có thông tin_'}

### Trình tự thực hiện
${proc.trinh_tu_thuc_hien || '_Chưa có thông tin_'}

### Cách thức thực hiện
${proc.cach_thuc_thuc_hien || '_Chưa có thông tin_'}

### Thủ tục liên quan
${proc.thu_tuc_lien_quan || '_Không có_'}

### Nguồn
[${proc.nguon || 'Không có'}](${proc.nguon || '#'})
`;

        // parse markdown -> HTML (same as before)
        modalBody.innerHTML = marked.parse(markdownContent);

        // style headings và links (giữ nguyên như khi tìm kiếm)
        const headings = modalBody.querySelectorAll('h3');
        headings.forEach(h3 => {
            h3.style.color = '#FBBF24';
            h3.style.marginBottom = '0.5rem';
            h3.style.fontSize = '1.125rem';
        });
        const links = modalBody.querySelectorAll('a');
        links.forEach(link => { link.target = '_blank'; link.rel = 'noopener noreferrer'; });

        // tiêu đề modal
        getEl('info-modal-title').innerHTML = titleText || proc.ten_thu_tuc || proc.name || 'Chi tiết thủ tục';

        // Mở modal (với trigger để animation xuất phát từ vị trí click)
        openModal(infoModal, triggerElement || null);
    }

    let lastTriggerElement = null;

    //  LOGIC MỞ/ĐÓNG CÁC POPUP (MODAL) 

    const openModal = (modalElement, triggerElement) => {
        lastTriggerElement = triggerElement;

        // Tính toạ độ để animation xuất phát
        if (triggerElement && typeof triggerElement.getBoundingClientRect === 'function') {
            const rect = triggerElement.getBoundingClientRect();
            const iconCenterX = rect.left + rect.width / 2;
            const iconCenterY = rect.top + rect.height / 2;
            const viewportCenterX = window.innerWidth / 2;
            const viewportCenterY = window.innerHeight / 2;
            const fromX = iconCenterX - viewportCenterX;
            const fromY = iconCenterY - viewportCenterY;
            modalElement.style.setProperty('--fromX', `${fromX}px`);
            modalElement.style.setProperty('--fromY', `${fromY}px`);
        } else {
            modalElement.style.setProperty('--fromX', `0px`);
            modalElement.style.setProperty('--fromY', `0px`);
        }

        // Reset z-index cho tất cả modal về mặc định (nếu bạn có set sẵn trong CSS thì để trống sẽ dùng CSS)
        document.querySelectorAll('.modal').forEach(m => {
            // giữ nguyên z-index nếu modal đang open và là modalElement (tránh nhấp nháy)
            if (m !== modalElement) m.style.zIndex = ''; 
        });

        // Đặt z-index cao hơn để modal này luôn trên cùng
        modalElement.style.zIndex = 60; // bạn có thể tăng thành 80/100 nếu cần

        modalElement.classList.remove('closing');
        modalElement.classList.add('open');
    };

    const closeModal = (modalElement) => {
        if (lastTriggerElement) {
            const rect = lastTriggerElement.getBoundingClientRect();
            const iconCenterX = rect.left + rect.width / 2;
            const iconCenterY = rect.top + rect.height / 2;
            const viewportCenterX = window.innerWidth / 2;
            const viewportCenterY = window.innerHeight / 2;
            const fromX = iconCenterX - viewportCenterX;
            const fromY = iconCenterY - viewportCenterY;
            modalElement.style.setProperty('--fromX', `${fromX}px`);
            modalElement.style.setProperty('--fromY', `${fromY}px`);
        } else {
            modalElement.style.setProperty('--fromX', '0px');
            modalElement.style.setProperty('--fromY', '0px');
        }

        modalElement.classList.add('closing');

        // Khi animation đóng kết thúc -> remove class và reset z-index
        modalElement.addEventListener('animationend', () => {
            modalElement.classList.remove('open', 'closing');
            modalElement.style.zIndex = ''; // trả về mặc định (dùng CSS)
        }, { once: true });
    };

    //  Gán sự kiện cho các nút 
    const showGuideModal = (e) => {
        getEl('info-modal-title').innerHTML = 'Hướng dẫn sử dụng';
        getEl('info-modal-body').innerHTML = `<ul class="list-disc space-y-4 pl-5"><li><strong>Tìm kiếm:</strong> Sử dụng thanh tìm kiếm ở trang chủ để tìm nhanh các thủ tục hành chính theo từ khóa.</li><li><strong>Trò chuyện:</strong> Nhấn nút "Bắt đầu Trò chuyện" để tương tác với trợ lý ảo eGov-Bot.</li><li><strong>Hỏi đáp:</strong> Đặt các câu hỏi rõ ràng, ngắn gọn để nhận được câu trả lời chính xác nhất về các thủ tục bạn quan tâm.</li></ul>`;
        openModal(infoModal, e.currentTarget);
    };

    const showContactModal = (e) => {
        getEl('info-modal-title').innerHTML = 'Thông tin liên hệ';
        getEl('info-modal-body').innerHTML = `<ul class="list-disc space-y-4 pl-5">
                                                <li>
                                                    <strong>Địa chỉ website chính thức:</strong><br>
                                                    Cổng dịch vụ công Quốc gia: <a href="https://dichvucong.gov.vn" target="_blank" class="text-amber-400 hover:underline">www.dichvucong.gov.vn</a>
                                                </li>
                                                <li>
                                                    <strong>Tổng đài hỗ trợ:</strong><br>
                                                    Số điện thoại hỗ trợ (miễn phí): <a href="tel:18001096" class="text-amber-400 hover:underline">1800 1096</a> — phục vụ người dân và doanh nghiệp trong quy trình đăng ký, tra cứu, phản ánh, v.v.
                                                </li>
                                                <li>
                                                    <strong>Email hỗ trợ:</strong><br>
                                                    <a href="mailto:dichvucong@chinhphu.vn" class="text-amber-400 hover:underline">dichvucong@chinhphu.vn</a> — dùng để gửi câu hỏi, góp ý, hoặc phản ánh các vấn đề liên quan đến dịch vụ công trực tuyến.
                                                </li>
                                            </ul>`;
        openModal(infoModal, e.currentTarget);
    };

    guideBtn.addEventListener('click', showGuideModal);
    guideBtnMobile.addEventListener('click', showGuideModal);
    contactBtn.addEventListener('click', showContactModal);
    contactBtnMobile.addEventListener('click', showContactModal);

    // LOGIC MỞ MODAL THỐNG KÊ
    // giữ instance chart để destroy khi mở lại
    let statsChart = null;

    function loadScriptOnce(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Không tải được ' + src));
            document.head.appendChild(s);
        });
    }

    statsOptions.forEach(option => {
        option.addEventListener('click', async (e) => {
            const clickedOption = e.currentTarget;
            const title = clickedOption.textContent.trim();

            // Reset modal body & set title, mở modal thống kê
            statsModalTitle.textContent = title;
            statsModalBody.innerHTML = '';
            openModal(statsModal, clickedOption);

            // --- Top procedures ---
            if (title.includes('Những thủ tục hay được hỏi') || title.includes('thủ tục hay được hỏi')) {
                statsModalBody.innerHTML = '<p>Đang tải danh sách thủ tục được hỏi nhiều nhất...</p>';

                try {
                    const POP_URL = (typeof POPULAR_JSON_URL !== 'undefined') ? POPULAR_JSON_URL : '/static/data/popular_procedures.json';
                    const resp = await fetch(POP_URL);
                    if (!resp.ok) throw new Error('Không tải được file popular_procedures.json (HTTP ' + resp.status + ')');
                    const json = await resp.json();

                    let arr = [];
                    if (Array.isArray(json.popular_procedures)) arr = json.popular_procedures;
                    else if (Array.isArray(json)) arr = json;
                    else {
                        const found = Object.values(json).find(v => Array.isArray(v));
                        if (found) arr = found;
                    }

                    arr = arr.map(it => ({
                        name: it.name || it.ten || it.ten_thu_tuc || '(Tên không rõ)',
                        total_queries: Number(it.total_queries || it.total || it.count || 0)
                    }));

                    arr.sort((a,b) => b.total_queries - a.total_queries);
                    const top = arr.slice(0, 10);

                    if (top.length === 0) {
                        statsModalBody.innerHTML = '<p>Không có dữ liệu thống kê trong file.</p>';
                        return;
                    }

                    statsModalBody.innerHTML = '';
                    const header = document.createElement('p');
                    header.className = 'mb-3 text-white/80';
                    header.textContent = `Top ${top.length} thủ tục theo số lượt hỏi (giảm dần)`;
                    statsModalBody.appendChild(header);

                    // Tạo canvas cho biểu đồ cột
                    const canvas = document.createElement('canvas');
                    canvas.id = 'top-procedures-chart';
                    canvas.style.width = '100%';
                    canvas.style.height = '200px';
                    statsModalBody.appendChild(canvas);

                    // Load Chart.js nếu chưa có
                    await loadScriptOnce('https://cdn.jsdelivr.net/npm/chart.js');
                    await loadScriptOnce('https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2');

                    if (statsChart) {
                        try { statsChart.destroy(); } catch(e){}
                        statsChart = null;
                    }

                    const ctx = canvas.getContext('2d');
                    const colors = top.map((_, i) => `hsl(${i * 36}, 60%, 58%)`);

                    // tính max để tạo khoảng trống phía trên cột cao nhất
                    const maxVal = Math.max(...top.map(it => it.total_queries), 0);
                    const suggestedMax = maxVal + 1;

                    // chọn stepSize hợp lý nhưng luôn là số nguyên
                    let step = 1;
                    if (maxVal > 10) step = Math.ceil(maxVal / 5);

                    if (statsChart) {
                        try { statsChart.destroy(); } catch (e) {}
                        statsChart = null;
                    }

                    statsChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: top.map(item => item.name),
                        datasets: [{
                            label: 'Số lượt hỏi',
                            data: top.map(item => item.total_queries),
                            backgroundColor: colors
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: {
                            padding: {
                                top: 24 // thêm khoảng trống trên để datalabel không bị cắt
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: { enabled: true },
                            datalabels: {
                                anchor: 'end',
                                align: 'end',
                                color: '#ffffff',
                                font: { weight: '600' },
                                formatter: (val) => val,
                                clip: false // cho phép vẽ vượt hơi ra ngoài nếu cần
                            }
                        },
                        scales: {
                            x: {
                                ticks: { display: false }
                            },
                            y: {
                                beginAtZero: true,
                                suggestedMax: suggestedMax,
                                ticks: {
                                    color: '#ccc',
                                    stepSize: 1,
                                    precision: 0,
                                    callback: function(value) {
                                        // chỉ hiển thị số nguyên
                                        return Number.isInteger(value) ? value : null;
                                    }
                                }
                            }
                        }
                    },
                    plugins: [ChartDataLabels]
                });

                    // Danh sách thủ tục với ô vuông màu
                    const ol = document.createElement('ol');
                    ol.className = 'list-decimal pl-5 space-y-2 mt-4';

                    top.forEach((item, i) => {
                        const li = document.createElement('li');
                        li.className = 'p-2 rounded-md bg-white/5 flex justify-between items-center cursor-pointer hover:bg-white/8';

                        const left = document.createElement('div');
                        left.className = 'flex items-center gap-2 pr-4';

                        const colorBox = document.createElement('span');
                        colorBox.style.display = 'inline-block';
                        colorBox.style.width = '14px';
                        colorBox.style.height = '14px';
                        colorBox.style.borderRadius = '3px';
                        colorBox.style.background = colors[i];

                        const nameSpan = document.createElement('span');
                        nameSpan.textContent = item.name;

                        left.appendChild(colorBox);
                        left.appendChild(nameSpan);

                        const right = document.createElement('div');
                        right.className = 'text-sm text-amber-400 ml-4 font-medium';
                        right.textContent = String(item.total_queries);

                        li.appendChild(left);
                        li.appendChild(right);
                        ol.appendChild(li);

                        li.addEventListener('click', async () => {
                            const normalized = s => (s || '').toString().trim().toLowerCase();
                            const nameLower = normalized(item.name);
                            let match = null;
                            if (Array.isArray(allProcedures) && allProcedures.length > 0) {
                                match = allProcedures.find(p => normalized(p.ten_thu_tuc) === nameLower);
                                if (!match) {
                                    match = allProcedures.find(p =>
                                        normalized(p.ten_thu_tuc).includes(nameLower) || nameLower.includes(normalized(p.ten_thu_tuc))
                                    );
                                }
                            }
                            if (match) {
                                showProcedureDetails(match, match.ten_thu_tuc || item.name, li);
                            } else {
                                getEl('info-modal-title').innerHTML = item.name;
                                const modalBody = getEl('info-modal-body');
                                modalBody.className = 'flex-grow p-6 overflow-y-auto custom-scrollbar prose text-white/90';
                                modalBody.innerHTML = `
                                    <p>Xin lỗi — chi tiết thủ tục này chưa có sẵn trong cơ sở dữ liệu chi tiết.</p>
                                    <div style="margin-top:12px;">
                                        <button id="do-search-from-top" class="px-4 py-2 rounded-full bg-[#ff6f00] hover:bg-[#e66400] text-white font-semibold">Tìm trong cơ sở dữ liệu</button>
                                    </div>
                                `;
                                const searchBtn = modalBody.querySelector('#do-search-from-top');
                                if (searchBtn) {
                                    searchBtn.addEventListener('click', () => {
                                        searchInput.value = item.name;
                                        closeModal(statsModal);
                                        searchForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                                    });
                                }
                                openModal(infoModal, li);
                            }
                        });
                    });

                    statsModalBody.appendChild(ol);

                } catch (err) {
                    console.error('Lỗi khi load popular_procedures.json:', err);
                    statsModalBody.innerHTML = `<p>Không thể tải dữ liệu thống kê: ${err.message}</p>`;
                }

                return;
            }


            // Nếu là "Mức độ hài lòng về phản hồi của chatbot" -> pie chart
            if (title.includes('Mức độ hài lòng') || title.includes('hài lòng')) {
                statsModalBody.innerHTML = '<p>Đang tải dữ liệu thống kê phản hồi...</p>';
                openModal(statsModal, clickedOption);

                try {
                    const FB_URL = (typeof USER_FEEDBACK_URL !== 'undefined') ? USER_FEEDBACK_URL : '/static/data/user_feedback.json';
                    const resp = await fetch(FB_URL);
                    if (!resp.ok) throw new Error('Không tải được file user_feedback.json (HTTP ' + resp.status + ')');
                    const json = await resp.json();
                    const summary = json.feedback_summary || json || { likes: 0, dislikes: 0 };
                    const likes = Number(summary.likes || 0);
                    const dislikes = Number(summary.dislikes || 0);
                    const total = likes + dislikes;

                    statsModalBody.innerHTML = '';
                    const container = document.createElement('div');
                    container.style.display = 'flex';
                    container.style.flexDirection = 'column';
                    container.style.gap = '12px';
                    container.style.alignItems = 'center';

                    const canvasWrap = document.createElement('div');
                    canvasWrap.style.width = '100%';
                    canvasWrap.style.maxWidth = '420px';
                    canvasWrap.style.height = '320px';
                    canvasWrap.style.display = 'flex';
                    canvasWrap.style.alignItems = 'center';
                    canvasWrap.style.justifyContent = 'center';

                    const canvas = document.createElement('canvas');
                    canvas.id = 'feedback-chart-canvas';
                    canvas.style.width = '100%';
                    canvas.style.height = '100%';
                    canvasWrap.appendChild(canvas);
                    container.appendChild(canvasWrap);

                    // Legend dưới
                    const legend = document.createElement('div');
                    legend.style.display = 'flex';
                    legend.style.gap = '18px';
                    legend.style.flexDirection = 'column';
                    legend.style.width = '100%';
                    legend.style.maxWidth = '420px';

                    const makeLegendRow = (color, labelText, count, perc) => {
                        const row = document.createElement('div');
                        row.style.display = 'flex';
                        row.style.alignItems = 'center';
                        row.style.gap = '10px';
                        row.style.justifyContent = 'space-between';
                        row.style.padding = '8px';
                        row.style.borderRadius = '8px';
                        row.style.background = 'rgba(255,255,255,0.03)';

                        const left = document.createElement('div');
                        left.style.display = 'flex';
                        left.style.alignItems = 'center';
                        left.style.gap = '10px';

                        const swatch = document.createElement('span');
                        swatch.style.display = 'inline-block';
                        swatch.style.width = '14px';
                        swatch.style.height = '14px';
                        swatch.style.borderRadius = '4px';
                        swatch.style.background = color;

                        const lbl = document.createElement('span');
                        lbl.textContent = labelText;
                        lbl.style.fontSize = '14px';
                        lbl.style.color = 'rgba(255,255,255,0.9)';

                        left.appendChild(swatch);
                        left.appendChild(lbl);

                        const right = document.createElement('div');
                        right.innerHTML = `<strong style="color: ${color}">${count}</strong> &nbsp; <span style="color: rgba(255,255,255,0.7)">${perc}</span>`;
                        right.style.fontSize = '13px';

                        row.appendChild(left);
                        row.appendChild(right);
                        return row;
                    };

                    const likePerc = total === 0 ? '0%' : Math.round((likes / total) * 100) + '%';
                    const dislikePerc = total === 0 ? '0%' : Math.round((dislikes / total) * 100) + '%';

                    legend.appendChild(makeLegendRow('#10B981', 'Hài lòng', likes, likePerc));
                    legend.appendChild(makeLegendRow('#EF4444', 'Không hài lòng', dislikes, dislikePerc));

                    container.appendChild(legend);
                    statsModalBody.appendChild(container);

                    // Load Chart.js + datalabels plugin
                    await loadScriptOnce('https://cdn.jsdelivr.net/npm/chart.js');
                    await loadScriptOnce('https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2');

                    // destroy prev chart
                    if (statsChart) {
                        try { statsChart.destroy(); } catch (e) {}
                        statsChart = null;
                    }

                    const ctx = canvas.getContext('2d');
                    const dataColors = ['#10B981', '#EF4444'];

                    statsChart = new Chart(ctx, {
                        type: 'pie',
                        data: {
                            labels: ['Hài lòng', 'Không hài lòng'],
                            datasets: [{
                                data: [likes, dislikes],
                                backgroundColor: dataColors,
                                borderColor: ['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.0)'],
                                borderWidth: 0
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        label: function(context) {
                                            const v = context.raw || 0;
                                            const sum = context.chart.data.datasets[0].data.reduce((a,b)=>a+b,0) || 1;
                                            const pct = Math.round((v / sum) * 100);
                                            return `${context.label}: ${v} (${pct}%)`;
                                        }
                                    }
                                },
                                datalabels: {
                                    color: '#ffffff',
                                    formatter: function(value, ctx) {
                                        const sum = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0) || 1;
                                        const pct = Math.round((value / sum) * 100);
                                        return pct + '%';
                                    },
                                    font: {
                                        weight: '600',
                                        size: 14
                                    },
                                    anchor: 'center',
                                    align: 'center'
                                }
                            }
                        },
                        plugins: [ChartDataLabels]
                    });

                } catch (err) {
                    console.error('Lỗi khi load user_feedback.json hoặc Chart.js:', err);
                    statsModalBody.innerHTML = `<p>Không thể tải hoặc hiển thị dữ liệu: ${err.message}</p>`;
                }

                return;
            }

            // Mặc định: mở modal (dành cho các lựa chọn khác)
            openModal(statsModal, clickedOption);
        });
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.querySelector('.modal-overlay').addEventListener('click', () => closeModal(modal));
        modal.querySelector('.modal-close, #close-chat-btn')?.addEventListener('click', () => closeModal(modal));
    });

    homeLink.addEventListener('click', (e) => { e.preventDefault(); window.location.reload(); });
    homeLinkMobile.addEventListener('click', (e) => { e.preventDefault(); window.location.reload(); });
    startChatBtn.addEventListener('click', (e) => openModal(chatbotContainer, e.currentTarget));

    // LOGIC TÌM KIẾM 
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const keyword = searchInput.value.trim().toLowerCase();
        resultsList.innerHTML = '';

        if (keyword) {
            const filtered = allProcedures.filter(item =>
                item.ten_thu_tuc?.toLowerCase().includes(keyword)
            );

            if (filtered.length > 0) {
                resultsTitle.textContent = `Kết quả (${filtered.length}):`;
                filtered.forEach((item) => {
                    const li = document.createElement('li');
                    li.className = 'p-3 border border-white/10 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm cursor-pointer';
                    li.textContent = item.ten_thu_tuc;

                    // Hiển thị bằng hàm chung để giống hệt behaviour khi click từ Top10
                    li.addEventListener('click', (e_li) => {
                        showProcedureDetails(item, item.ten_thu_tuc, e_li.currentTarget);
                    });

                    resultsList.appendChild(li);
                });
            } else {
                resultsTitle.textContent = 'Không tìm thấy kết quả nào.';
            }
            resultsContainer.classList.remove('hidden');
        } else {
            resultsContainer.classList.add('hidden');
        }
    });

    // LOGIC CHAT 
    let messages = [{ role: "assistant", content: "Chào bạn, tôi là trợ lý ảo eGov-Bot." }];

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const renderMessages = () => {
        chatMessagesContainer.innerHTML = '';
        messages.forEach((msg, idx) => {
            const wrapper = document.createElement('div');
            wrapper.className = `flex items-end gap-2 max-w-[80%] ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`;

            const messageContent = msg.role === 'assistant' ? marked.parse(msg.content) : msg.content;

            const bubble = document.createElement('div');
            bubble.className = `prose text-xs sm:text-sm md:text-base px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-[#ff6f00] text-white rounded-br-none' : 'bg-[#4d4d4d] text-white/90 rounded-bl-none'}`;
            bubble.innerHTML = messageContent;

            // Bọc tin nhắn trong một container để chứa cả bubble và nút feedback
            const messageContainer = document.createElement('div');
            messageContainer.className = 'flex flex-col';
            messageContainer.appendChild(bubble);	

            // --- BẮT ĐẦU THAY ĐỔI ---
            // Chỉ thêm nút feedback cho tin nhắn của assistant VÀ không phải tin nhắn đầu tiên (idx > 0)
            if (msg.role === 'assistant' && idx > 0) {
                const fbWrap = document.createElement('div');
                fbWrap.className = 'feedback-buttons';

                const likeBtn = document.createElement('button');
                likeBtn.className = 'feedback-btn';
                likeBtn.type = 'button';
                // Thêm icon và chữ
                likeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a2 2 0 0 1 1.79 1.11L15 5.88Z"/></svg> Hài lòng`;

                const dislikeBtn = document.createElement('button');
                dislikeBtn.className = 'feedback-btn';
                dislikeBtn.type = 'button';
                dislikeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a2 2 0 0 1-1.79-1.11L9 18.12Z"/></svg> Không hài lòng`;

                // Áp dụng lớp 'active' nếu đã được chọn trước đó
                if (msg.feedback === 'like') likeBtn.classList.add('active');
                if (msg.feedback === 'dislike') dislikeBtn.classList.add('active');
                
                // =======================================================
                // ========== BẮT ĐẦU KHỐI MÃ ĐƯỢC SỬA LỖI ==========
                // =======================================================

                /// --- Xử lý sự kiện Like ---
                likeBtn.addEventListener('click', () => {
                    const previousFeedback = msg.feedback; // Lưu lại trạng thái cũ
                    let newFeedback;

                    // Nếu đang "like" thì bấm lần nữa sẽ hủy
                    if (previousFeedback === 'like') {
                        newFeedback = null; 
                        msg.feedback = null;
                        likeBtn.classList.remove('active');
                    } else {
                    // Nếu chưa "like" (hoặc đang "dislike") thì chuyển thành "like"
                        newFeedback = 'like';
                        msg.feedback = 'like';
                        likeBtn.classList.add('active');
                        dislikeBtn.classList.remove('active');
                    }
                    
                    // Gửi cả trạng thái cũ và mới lên server
                    fetch("/save_feedback", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            new_feedback: newFeedback,      // Trạng thái mới (có thể là null)
                            previous_feedback: previousFeedback, // Trạng thái cũ
                            message: msg.content,
                            timestamp: new Date().toISOString()
                        })
                    }).catch(err => console.error("Không gửi được feedback:", err));
                });

                // --- Xử lý sự kiện Dislike ---
                dislikeBtn.addEventListener('click', () => {
                    const previousFeedback = msg.feedback; // Lưu lại trạng thái cũ
                    let newFeedback;

                    // Nếu đang "dislike" thì bấm lần nữa sẽ hủy
                    if (previousFeedback === 'dislike') {
                        newFeedback = null;
                        msg.feedback = null;
                        dislikeBtn.classList.remove('active');
                    } else {
                    // Nếu chưa "dislike" (hoặc đang "like") thì chuyển thành "dislike"
                        newFeedback = 'dislike';
                        msg.feedback = 'dislike';
                        dislikeBtn.classList.add('active');
                        likeBtn.classList.remove('active');
                    }

                    // Gửi cả trạng thái cũ và mới lên server
                    fetch("/save_feedback", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            new_feedback: newFeedback,      // Trạng thái mới
                            previous_feedback: previousFeedback, // Trạng thái cũ
                            message: msg.content,
                            timestamp: new Date().toISOString()
                        })
                    }).catch(err => console.error("Không gửi được feedback:", err));
                });

                // =======================================================
                // ========== KẾT THÚC KHỐI MÃ ĐƯỢC SỬA LỖI ==========
                // =======================================================

                fbWrap.appendChild(likeBtn);
                fbWrap.appendChild(dislikeBtn);
                messageContainer.appendChild(fbWrap);
            }
            // --- KẾT THÚC THAY ĐỔI ---

            wrapper.appendChild(messageContainer);
            chatMessagesContainer.appendChild(wrapper);

            const links = wrapper.querySelectorAll('a');
            links.forEach(link => {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            });
        });

        const allMessageDivs = chatMessagesContainer.children;
        if (allMessageDivs.length > 1 && messages[messages.length - 1].role === 'assistant') {
            const userQuestionElement = allMessageDivs[allMessageDivs.length - 2];
            userQuestionElement.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }
    };
    renderMessages();

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userText = chatInput.value.trim();
        if (userText === '') return;

        messages.push({ role: 'user', content: userText });
        renderMessages();
        chatInput.value = '';
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

        const statusDiv = document.createElement('div');
        statusDiv.className = 'flex items-end gap-2 max-w-[80%] self-start';
        statusDiv.innerHTML = `<div class="prose text-xs sm:text-sm md:text-base px-4 py-2 rounded-2xl bg-[#4d4d4d] text-white/90 rounded-bl-none"><i class="animated-text-gradient">Đang truy xuất thông tin...</i></div>`;
        chatMessagesContainer.appendChild(statusDiv);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

        try {
            const API_ENDPOINT = "http://localhost:7860/chat";
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: userText,
                    session_id: "user123" 
                }),
            });

            if (!response.ok) {
                throw new Error('Lỗi kết nối đến máy chủ AI');
            }

            const data = await response.json();
            const fullAnswer = data.answer;

            const statusContent = statusDiv.querySelector('i');
            statusContent.textContent = 'Đã tìm thấy câu trả lời. Bắt đầu hiển thị...';

            await sleep(1000);

            statusDiv.remove();

            messages.push({ role: 'assistant', content: fullAnswer });
            renderMessages();

            const lastMessageElement = chatMessagesContainer.lastElementChild;
            if (lastMessageElement) {
                lastMessageElement.classList.add('message-enter-active');
            }

        } catch (error) {
            console.error('Lỗi:', error);
            const errorMessage = 'Xin lỗi, tôi đang gặp sự cố kết nối. Vui lòng thử lại sau.';
            statusDiv.querySelector('i').textContent = errorMessage; 
            messages.push({ role: 'assistant', content: errorMessage });
        }
    });

    // LOGIC CHO NÚT XÓA CHAT 
    clearChatBtn.addEventListener('click', async () => {
        // Đặt lại mảng tin nhắn về trạng thái ban đầu
        messages = [{ role: "assistant", content: "Chào bạn, tôi là trợ lý ảo eGov-Bot." }];
        renderMessages();
        chatInput.value = '';

        console.log('Đã xóa cuộc trò chuyện.');

        // Gửi request tới backend để clear session hiện tại
        try {
            const response = await fetch("https://hungbb-egov-bot-backend.hf.space/clear_session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: "user123" }) // nhớ truyền session_id
            });

            const result = await response.json();
            console.log("Clear session:", result);
        } catch (err) {
            console.error("Không thể clear session:", err);
        }
    });
});