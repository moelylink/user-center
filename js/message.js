document.addEventListener('DOMContentLoaded', async () => {
    // 依赖 common.js
    if (typeof client === 'undefined') return;

    // 1. 验证登录
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
        window.location.href = '/login';
        return;
    }
    const myId = session.user.id;

    // 状态管理
    let activeChatUser = null; // 当前正在聊天的用户对象 {id, email, ...}
    let contactsMap = new Map(); // 缓存联系人信息

    // DOM 元素
    const contactListEl = document.getElementById('contact-list');
    const messagesArea = document.getElementById('messages-area');
    const msgInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('btn-send-message');
    const chatContainer = document.querySelector('.chat-container');
    const chatEmpty = document.getElementById('chat-empty');
    const chatContent = document.getElementById('chat-content');
    const searchContainer = document.getElementById('new-chat-search');

    // ============================================================
    // 2. 加载联系人列表 (基于历史消息聚合)
    // ============================================================
    async function loadContacts() {
        contactListEl.innerHTML = '<div class="loading-spinner" style="margin:20px auto"></div>';
        
        try {
            // 获取我参与的所有消息（发出的和收到的）
            // 注意：如果数据量大，这里应该用 RPC 函数优化，目前用简单查询
            const { data: messages, error } = await client
                .from('notifications')
                .select('sender_id, receiver_id, created_at, content')
                .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // 提取所有交互过的 unique User IDs
            const contactIds = new Set();
            messages.forEach(msg => {
                if (msg.sender_id !== myId) contactIds.add(msg.sender_id);
                if (msg.receiver_id !== myId) contactIds.add(msg.receiver_id);
            });

            if (contactIds.size === 0) {
                contactListEl.innerHTML = '<p style="text-align:center;color:#999;padding:20px">暂无消息<br>点击上方 + 号发起私信</p>';
                return;
            }

            // 获取这些用户的详细信息
            const { data: profiles, error: profileError } = await client
                .from('profiles')
                .select('id, email, username, avatar_url')
                .in('id', Array.from(contactIds));

            if (profileError) throw profileError;

            // 渲染列表
            contactListEl.innerHTML = '';
            profiles.forEach(profile => {
                contactsMap.set(profile.id, profile);
                
                // 找到最后一条消息
                const lastMsg = messages.find(m => m.sender_id === profile.id || m.receiver_id === profile.id);
                
                const div = document.createElement('div');
                div.className = 'contact-item';
                div.dataset.uid = profile.id;
                div.onclick = () => selectChat(profile);
                div.innerHTML = `
                    <div class="avatar-placeholder">${(profile.username || profile.email)[0].toUpperCase()}</div>
                    <div class="contact-info">
                        <div class="contact-name">${profile.username || profile.email}</div>
                        <div class="contact-preview">${lastMsg ? lastMsg.content : ''}</div>
                    </div>
                `;
                contactListEl.appendChild(div);
            });

        } catch (err) {
            console.error(err);
            contactListEl.innerHTML = '<p style="color:red;text-align:center">加载失败</p>';
        }
    }

    // ============================================================
    // 3. 搜索新用户并开始聊天
    // ============================================================
    document.getElementById('btn-new-chat').addEventListener('click', () => {
        searchContainer.classList.toggle('hidden');
        document.getElementById('search-email-input').focus();
    });

    document.getElementById('btn-search-confirm').addEventListener('click', async () => {
        const email = document.getElementById('search-email-input').value.trim();
        if (!email) return;

        try {
            // 查 profile 表
            const { data, error } = await client
                .from('profiles')
                .select('*')
                .eq('email', email)
                .single();

            if (error || !data) {
                Notifications.show('未找到该用户，请检查邮箱', 'warning');
                return;
            }

            if (data.id === myId) {
                Notifications.show('不能给自己发消息', 'warning');
                return;
            }

            // 选中该用户
            searchContainer.classList.add('hidden');
            document.getElementById('search-email-input').value = '';
            selectChat(data);
            
            // 如果不在列表里，刷新一下列表（或者手动插进去）
            if (!contactsMap.has(data.id)) {
                loadContacts(); 
            }

        } catch (err) {
            Notifications.show('查找失败', 'error');
        }
    });

    // ============================================================
    // 4. 选择聊天对象 & 加载消息
    // ============================================================
    async function selectChat(userProfile) {
        activeChatUser = userProfile;
        
        // UI 更新
        document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
        const activeEl = document.querySelector(`.contact-item[data-uid="${userProfile.id}"]`);
        if (activeEl) activeEl.classList.add('active');

        chatEmpty.classList.add('hidden');
        chatContent.classList.remove('hidden');
        
        // 移动端切换视图
        chatContainer.classList.add('active-chat');

        // 设置头部
        document.getElementById('current-chat-name').textContent = userProfile.username || userProfile.email;
        messagesArea.innerHTML = '<div class="loading-spinner" style="margin:20px auto"></div>';
        sendBtn.disabled = false;

        // 加载历史消息
        try {
            const { data: messages, error } = await client
                .from('notifications')
                .select('*')
                .or(`and(sender_id.eq.${myId},receiver_id.eq.${userProfile.id}),and(sender_id.eq.${userProfile.id},receiver_id.eq.${myId})`)
                .order('created_at', { ascending: true });

            if (error) throw error;

            renderMessages(messages);

        } catch (err) {
            console.error(err);
            messagesArea.innerHTML = '<p style="text-align:center">消息加载失败</p>';
        }
    }

    function renderMessages(messages) {
        messagesArea.innerHTML = '';
        if (messages.length === 0) {
            messagesArea.innerHTML = '<p style="text-align:center;color:#ccc;margin-top:20px">暂无消息，打个招呼吧！</p>';
            return;
        }

        messages.forEach(msg => appendMessageUI(msg));
        scrollToBottom();
    }

    function appendMessageUI(msg) {
        // 如果是“暂无消息”提示，先清空
        if (messagesArea.querySelector('p')) messagesArea.innerHTML = '';

        const isMine = msg.sender_id === myId;
        const div = document.createElement('div');
        div.className = `message-bubble ${isMine ? 'sent' : 'received'}`;
        div.innerHTML = `
            ${escapeHtml(msg.content)}
            <div class="message-time">${new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
        `;
        messagesArea.appendChild(div);
        scrollToBottom();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function scrollToBottom() {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    // ============================================================
    // 5. 发送消息
    // ============================================================
    async function sendMessage() {
        const text = msgInput.value.trim();
        if (!text || !activeChatUser) return;

        // 乐观更新 UI
        const tempMsg = {
            sender_id: myId,
            content: text,
            created_at: new Date().toISOString()
        };
        appendMessageUI(tempMsg);
        msgInput.value = '';

        try {
            const { error } = await client
                .from('notifications')
                .insert({
                    sender_id: myId,
                    receiver_id: activeChatUser.id,
                    content: text,
                    is_read: false
                });

            if (error) throw error;
            // 成功后不需要做什么，UI已经更新了
            
        } catch (err) {
            Notifications.show('发送失败', 'error');
            // 实际项目中这里应该回滚UI或显示红色感叹号
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    msgInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // ============================================================
    // 6. 实时消息监听 (Notifications)
    // ============================================================
    client
        .channel('public:notifications')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'notifications',
            filter: `receiver_id=eq.${myId}` // 只监听发给我的
        }, (payload) => {
            const newMsg = payload.new;
            
            // 情况 A: 当前正打开着发送者的聊天窗口 -> 直接上屏
            if (activeChatUser && newMsg.sender_id === activeChatUser.id) {
                appendMessageUI(newMsg);
                
                // 标记为已读 (可选)
                client.from('notifications').update({ is_read: true }).eq('id', newMsg.id);
            } 
            // 情况 B: 没在聊天，或聊的是别人 -> 弹出通知
            else {
                // 尝试获取发送者名字（如果在缓存里）
                let senderName = '新消息';
                const senderProfile = contactsMap.get(newMsg.sender_id);
                if (senderProfile) {
                    senderName = senderProfile.username || senderProfile.email;
                    // 更新左侧列表的预览文本
                    loadContacts(); 
                }
                
                Notifications.show(`收到来自 ${senderName} 的消息`, 'info');
            }
        })
        .subscribe();


    // 移动端返回按钮
    document.getElementById('back-to-contacts').addEventListener('click', () => {
        chatContainer.classList.remove('active-chat');
        activeChatUser = null;
    });

    // 初始加载
    loadContacts();
});
