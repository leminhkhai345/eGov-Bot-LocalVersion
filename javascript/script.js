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
                        const procedureContent = `
                            <div class="space-y-6 text-white/90">
                                <div><h4 class="font-semibold text-amber-400 mb-2 text-lg">Cơ quan thực hiện</h4><p class="whitespace-pre-wrap text-base">${item.co_quan_thuc_hien || 'Chưa có thông tin'}</p></div>
                                <div><h4 class="font-semibold text-amber-400 mb-2 text-lg">Yêu cầu, điều kiện</h4><p class="whitespace-pre-wrap text-base">${item.yeu_cau_dieu_kien || 'Chưa có thông tin'}</p></div>
                                <div><h4 class="font-semibold text-amber-400 mb-2 text-lg">Thành phần hồ sơ</h4><p class="whitespace-pre-wrap text-base">${item.thanh_phan_ho_so || 'Chưa có thông tin'}</p></div>
                                <div><h4 class="font-semibold text-amber-400 mb-2 text-lg">Trình tự thực hiện</h4><p class="whitespace-pre-wrap text-base">${item.trinh_tu_thuc_hien || 'Chưa có thông tin'}</p></div>
                                <div><h4 class="font-semibold text-amber-400 mb-2 text-lg">Cách thức thực hiện</h4><p class="whitespace-pre-wrap text-base">${item.cach_thuc_thuc_hien || 'Chưa có thông tin'}</p></div>
                                <div><h4 class="font-semibold text-amber-400 mb-2 text-lg">Thủ tục liên quan</h4><p class="whitespace-pre-wrap text-base">${item.thu_tuc_lien_quan || 'Không có'}</p></div>
                                <div><h4 class="font-semibold text-amber-400 mb-2 text-lg">Nguồn</h4><a href="${item.nguon || '#'}" target="_blank" class="text-blue-400 hover:underline break-all">${item.nguon || 'Không có'}</a></div>
                            </div>`;
                        getEl('info-modal-title').innerHTML = item.ten_thu_tuc;
                        getEl('info-modal-body').innerHTML = procedureContent;
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

    // Hàm tiện ích để chờ
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
    
    // --- LOGIC CHAT NÂNG CẤP VỚI HIỆU ỨNG TRẠNG THÁI VÀ HIỂN THỊ TỪNG KHỐI ---
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userText = chatInput.value.trim();
        if (userText === '') return;

        // Thêm tin nhắn người dùng và render
        messages.push({ role: 'user', content: userText });
        renderMessages();
        chatInput.value = '';
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

        // Hiển thị trạng thái "Đang truy xuất thông tin..." với hiệu ứng gradient
        const statusDiv = document.createElement('div');
        statusDiv.className = 'flex items-end gap-2 max-w-[80%] self-start';
        // ADDED: class animated-text-gradient
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

            // Cập nhật trạng thái sau khi có câu trả lời, vẫn giữ hiệu ứng
            const statusContent = statusDiv.querySelector('i'); // Chọn thẻ <i> bên trong
            statusContent.textContent = 'Đã tìm thấy câu trả lời. Bắt đầu hiển thị...';
            // Không cần xóa class gradient, nó sẽ tự mất khi statusDiv bị remove

            await sleep(1000); // Chờ 1 giây để người dùng đọc trạng thái

            // Xóa tin nhắn trạng thái khỏi DOM
            statusDiv.remove();

            // Thêm câu trả lời hoàn chỉnh vào mảng và render lại toàn bộ
            messages.push({ role: 'assistant', content: fullAnswer });
            renderMessages();
            
            // Thêm hiệu ứng xuất hiện cho tin nhắn cuối cùng (của bot)
            const lastMessageElement = chatMessagesContainer.lastElementChild;
            if (lastMessageElement) {
                lastMessageElement.classList.add('message-enter-active');
            }

        } catch (error) {
            console.error('Lỗi:', error);
            const errorMessage = 'Xin lỗi, tôi đang gặp sự cố kết nối. Vui lòng thử lại sau.';
            // Đảm bảo tin nhắn lỗi cũng có hiệu ứng trạng thái
            statusDiv.querySelector('i').textContent = errorMessage; 
            messages.push({ role: 'assistant', content: errorMessage });
            // Cập nhật lại DOM để hiển thị lỗi, không xóa statusDiv
            // renderMessages() sẽ không được gọi ở đây để giữ lại statusDiv với tin nhắn lỗi
        }
    });
});
