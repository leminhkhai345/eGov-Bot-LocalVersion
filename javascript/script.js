document.addEventListener('DOMContentLoaded', () => {

    // Biến để lưu trữ toàn bộ dữ liệu thủ tục
    let allProcedures = [];

    // --- TẢI DỮ LIỆU TỪ FILE JSON ---
    fetch('./toan_bo_du_lieu_final.json')
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

    // --- Lấy các phần tử DOM ---
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
    

    let lastTriggerElement = null;

    // --- LOGIC MỞ/ĐÓNG CÁC POPUP (MODAL) ---
    const openModal = (modalElement, triggerElement) => {
        lastTriggerElement = triggerElement;
        const rect = triggerElement.getBoundingClientRect();
        const iconCenterX = rect.left + rect.width / 2;
        const iconCenterY = rect.top + rect.height / 2;
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;
        const fromX = iconCenterX - viewportCenterX;
        const fromY = iconCenterY - viewportCenterY;
        modalElement.style.setProperty('--fromX', `${fromX}px`);
        modalElement.style.setProperty('--fromY', `${fromY}px`);
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
        modalElement.addEventListener('animationend', () => {
            modalElement.classList.remove('open', 'closing');
        }, { once: true });
    };

    // --- Gán sự kiện cho các nút ---
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

    document.querySelectorAll('.modal').forEach(modal => {
        modal.querySelector('.modal-overlay').addEventListener('click', () => closeModal(modal));
        modal.querySelector('.modal-close, #close-chat-btn')?.addEventListener('click', () => closeModal(modal));
    });

    homeLink.addEventListener('click', (e) => { e.preventDefault(); window.location.reload(); });
    homeLinkMobile.addEventListener('click', (e) => { e.preventDefault(); window.location.reload(); });
    startChatBtn.addEventListener('click', (e) => openModal(chatbotContainer, e.currentTarget));

    // --- LOGIC TÌM KIẾM ---
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

                    li.addEventListener('click', (e_li) => {
                        const markdownContent = `
### Cơ quan thực hiện
${item.co_quan_thuc_hien || '_Chưa có thông tin_'}

### Yêu cầu, điều kiện
${item.yeu_cau_dieu_kien || '_Chưa có thông tin_'}

### Thành phần hồ sơ
${item.thanh_phan_ho_so || '_Chưa có thông tin_'}

### Trình tự thực hiện
${item.trinh_tu_thuc_hien || '_Chưa có thông tin_'}

### Cách thức thực hiện
${item.cach_thuc_thuc_hien || '_Chưa có thông tin_'}

### Thủ tục liên quan
${item.thu_tuc_lien_quan || '_Không có_'}

### Nguồn
[${item.nguon || 'Không có'}](${item.nguon || '#'})
`;
                        const modalBody = getEl('info-modal-body');
                        
                        modalBody.className = 'flex-grow p-6 overflow-y-auto custom-scrollbar prose text-white/90';
                        
                        modalBody.innerHTML = marked.parse(markdownContent);
                        
                        // FINAL FIX: Gán màu trực tiếp vào style
                        const headings = modalBody.querySelectorAll('h3');
                        headings.forEach(h3 => {
                            h3.style.color = '#FBBF24'; // Mã màu của amber-400
                            h3.style.marginBottom = '0.5rem';
                            h3.style.fontSize = '1.125rem'; // Tương đương text-lg
                        });

                        const links = modalBody.querySelectorAll('a');
                        links.forEach(link => {
                            link.target = '_blank';
                            link.rel = 'noopener noreferrer';
                        });

                        getEl('info-modal-title').innerHTML = item.ten_thu_tuc;
                        
                        openModal(infoModal, e_li.currentTarget);
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

    // --- LOGIC CHAT ---
    let messages = [{ role: "assistant", content: "Chào bạn, tôi là trợ lý ảo eGov-Bot." }];

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const renderMessages = () => {
        chatMessagesContainer.innerHTML = '';
        messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `flex items-end gap-2 max-w-[80%] ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`;

            const messageContent = msg.role === 'assistant' 
                ? marked.parse(msg.content) 
                : msg.content;
            
            msgDiv.innerHTML = `<div class="prose text-xs sm:text-sm md:text-base px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-[#ff6f00] text-white rounded-br-none' : 'bg-[#4d4d4d] text-white/90 rounded-bl-none'}">${messageContent}</div>`;

            chatMessagesContainer.appendChild(msgDiv);

            const links = msgDiv.querySelectorAll('a');
            links.forEach(link => {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            });
        });
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
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
            const API_ENDPOINT = "https://hungbb-egov-bot-backend.hf.space/chat";
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
});
