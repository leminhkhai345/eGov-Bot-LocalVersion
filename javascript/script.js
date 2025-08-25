document.addEventListener('DOMContentLoaded', () => {
    let allProcedures = [];
    fetch('./toan_bo_du_lieu_final.json')
        .then(response => response.ok ? response.json() : Promise.reject('File not found'))
        .then(data => {
            allProcedures = data;
            console.log(`Tải thành công ${allProcedures.length} thủ tục.`);
        })
        .catch(error => {
            console.error('Lỗi khi tải file JSON:', error);
            alert('Không thể tải cơ sở dữ liệu thủ tục. Chức năng tìm kiếm sẽ không hoạt động.');
        });

    const getEl = (id) => document.getElementById(id);
    const startChatBtn = getEl('start-chat-btn');
    const chatbotContainer = getEl('chatbot-container');
    const infoModal = getEl('info-modal');
    
    let lastTriggerElement = null;

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

    getEl('guide-btn').addEventListener('click', (e) => {
        getEl('info-modal-title').innerHTML = 'Hướng dẫn sử dụng';
        getEl('info-modal-body').innerHTML = `<ul class="list-disc space-y-4 pl-5"><li><strong>Tìm kiếm:</strong> Sử dụng thanh tìm kiếm ở trang chủ để tìm nhanh các thủ tục hành chính theo từ khóa.</li><li><strong>Trò chuyện:</strong> Nhấn nút "Bắt đầu Trò chuyện" để tương tác với trợ lý ảo eGov-Bot.</li><li><strong>Hỏi đáp:</strong> Đặt các câu hỏi rõ ràng, ngắn gọn để nhận được câu trả lời chính xác nhất về các thủ tục bạn quan tâm.</li></ul>`;
        openModal(infoModal, e.currentTarget);
    });

    getEl('contact-btn').addEventListener('click', (e) => {
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
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.querySelector('.modal-overlay').addEventListener('click', () => closeModal(modal));
        modal.querySelector('.modal-close, #close-chat-btn')?.addEventListener('click', () => closeModal(modal));
    });
    
    getEl('home-link').addEventListener('click', (e) => { e.preventDefault(); window.location.reload(); });
    startChatBtn.addEventListener('click', (e) => openModal(chatbotContainer, e.currentTarget));
    
    getEl('search-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const keyword = getEl('search-input').value.trim().toLowerCase();
        const resultsList = getEl('results-list');
        resultsList.innerHTML = '';
        if (keyword) {
            const filtered = allProcedures.filter(item => item.ten_thu_tuc?.toLowerCase().includes(keyword));
            if (filtered.length > 0) {
                getEl('results-title').textContent = `Kết quả (${filtered.length}):`;
                filtered.forEach((item) => {
                    const li = document.createElement('li');
                    li.className = 'p-3 border border-white/10 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm cursor-pointer';
                    li.textContent = item.ten_thu_tuc;
                    li.addEventListener('click', (e_li) => {
                        // --- PHẦN CODE ĐƯỢC CẬP NHẬT ---
                        const procedureContent = `
                            <div class="space-y-6 text-white/90">
                                <div>
                                    <h4 class="font-semibold text-amber-400 mb-2 text-lg">Cơ quan thực hiện</h4>
                                    <p class="whitespace-pre-wrap text-base">${item.co_quan_thuc_hien || 'Chưa có thông tin'}</p>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-amber-400 mb-2 text-lg">Yêu cầu, điều kiện</h4>
                                    <p class="whitespace-pre-wrap text-base">${item.yeu_cau_dieu_kien || 'Chưa có thông tin'}</p>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-amber-400 mb-2 text-lg">Thành phần hồ sơ</h4>
                                    <p class="whitespace-pre-wrap text-base">${item.thanh_phan_ho_so || 'Chưa có thông tin'}</p>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-amber-400 mb-2 text-lg">Trình tự thực hiện</h4>
                                    <p class="whitespace-pre-wrap text-base">${item.trinh_tu_thuc_hien || 'Chưa có thông tin'}</p>
                                </div>
                                 <div>
                                    <h4 class="font-semibold text-amber-400 mb-2 text-lg">Cách thức thực hiện</h4>
                                    <p class="whitespace-pre-wrap text-base">${item.cach_thuc_thuc_hien || 'Chưa có thông tin'}</p>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-amber-400 mb-2 text-lg">Thủ tục liên quan</h4>
                                    <p class="whitespace-pre-wrap text-base">${item.thu_tuc_lien_quan || 'Không có'}</p>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-amber-400 mb-2 text-lg">Nguồn</h4>
                                    <a href="${item.nguon || '#'}" target="_blank" class="text-blue-400 hover:underline break-all">${item.nguon || 'Không có'}</a>
                                </div>
                            </div>`;
                        getEl('info-modal-title').innerHTML = item.ten_thu_tuc;
                        getEl('info-modal-body').innerHTML = procedureContent;
                        openModal(infoModal, e_li.currentTarget);
                    });
                    resultsList.appendChild(li);
                });
            } else {
                getEl('results-title').textContent = 'Không tìm thấy kết quả nào.';
            }
            getEl('results-container').classList.remove('hidden');
        } else {
            getEl('results-container').classList.add('hidden');
        }
    });
    
    // Chat Logic
    let messages = [{ role: "assistant", content: "Chào bạn, tôi là trợ lý ảo eGov-Bot." }];
    const chatMessagesContainer = getEl('chat-messages');
    const chatForm = getEl('chat-form');
    const chatInput = getEl('chat-input');

    const renderMessages = () => {
        chatMessagesContainer.innerHTML = '';
        messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `flex items-end gap-2 max-w-[80%] ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`;
            msgDiv.innerHTML = `<div class="px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-[#ff6f00] text-white rounded-br-none' : 'bg-[#4d4d4d] text-white/90 rounded-bl-none'}">${msg.content}</div>`;
            chatMessagesContainer.appendChild(msgDiv);
        });
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    };
    renderMessages();

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userText = chatInput.value.trim();
        if (userText === '') return;
        messages.push({ role: 'user', content: userText });
        renderMessages();
        chatInput.value = '';
        setTimeout(() => {
            const typingIndicator = document.createElement('div');
            typingIndicator.className = 'flex items-end gap-2 max-w-[80%] self-start';
            typingIndicator.innerHTML = `<div class="px-4 py-2 rounded-2xl bg-[#4d4d4d] text-white/90 rounded-bl-none"><div class="flex items-center gap-1"><span class="w-2 h-2 bg-white/50 rounded-full animate-bounce" style="animation-delay: 0s;"></span><span class="w-2 h-2 bg-white/50 rounded-full animate-bounce" style="animation-delay: 0.15s;"></span><span class="w-2 h-2 bg-white/50 rounded-full animate-bounce" style="animation-delay: 0.3s;"></span></div></div>`;
            chatMessagesContainer.appendChild(typingIndicator);
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
            setTimeout(() => {
                chatMessagesContainer.removeChild(typingIndicator);
                messages.push({ role: 'assistant', content: 'Chức năng trò chuyện AI đang được phát triển.' });
                renderMessages();
            }, 2000);
        }, 500);
    });
});
