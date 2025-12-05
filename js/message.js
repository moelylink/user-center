document.addEventListener('DOMContentLoaded', async () => {
    if (typeof client === 'undefined') return;

    // 1. 验证登录
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
        window.location.href = '/user/login/';
        return;
    }
    const myId = session.user.id;

    // 定义系统通知虚拟用户
    const SYSTEM_BOT = {
        id: 'system_notification_bot',
        username: '站内通知',
        email: 'system@moely.link',
        avatar_url: null,
        isSystem: true // 标记位
    };

    // 状态管理
    let activeChatUser = null; 
    let contactsMap = new Map(); 

    // DOM 元素
    const contactListEl = document.getElementById('contact-list');
    const messagesArea = document.getElementById('messages-area');
    const msgInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('btn-send-message');
    const chatContainer = document.querySelector('.chat-container');
    const chatEmpty = document.getElementById('chat-empty');
    const chatContent = document.getElementById('chat-content');
    const chatPane = document.getElementById('chat-pane'); // 用于切换只读模式
    const searchContainer = document.getElementById('new-chat-search');

    // ============================================================
    // 2. 加载联系人列表 (系统通知 + 私信聚合)
    // ============================================================
    async function loadContacts() {
        contactListEl.innerHTML = '<div class="loading-spinner" style="margin:20px auto"></div>';
        
        try {
            // A. 获取最新的系统通知预览
            const { data: sysNotifs } = await client
                .from('notifications')
                .select('*')
                .eq('user_id', myId)
                .order('created_at', { ascending: false })
                .limit(1);
            
            const lastSysMsg = sysNotifs && sysNotifs.length > 0 ? sysNotifs[0] : null;

            // B. 获取私信列表 (private_messages)
            const { data: messages, error } = await client
                .from('private_messages')
                .select('sender_id, receiver_id, created_at, content')
                .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // 提取私信联系人 ID
            const contactIds = new Set();
            messages.forEach(msg => {
                if (msg.sender_id !== myId) contactIds.add(msg.sender_id);
                if (msg.receiver_id !== myId) contactIds.add(msg.receiver_id);
            });

            // 获取私信用户信息
            let profiles = [];
            if (contactIds.size > 0) {
                const { data: pros, error: profileError } = await client
                    .from('profiles')
                    .select('id, email, username, avatar_url')
                    .in('id', Array.from(contactIds));
                if (profileError) throw profileError;
                profiles = pros;
            }

            // 清空列表
            contactListEl.innerHTML = '';
            contactsMap.clear();

            // --- 1. 渲染【站内通知】置顶 ---
            renderContactItem(SYSTEM_BOT, lastSysMsg ? lastSysMsg.title || lastSysMsg.content : '暂无系统通知');

            // --- 2. 渲染【私信联系人】 ---
            profiles.forEach(profile => {
                contactsMap.set(profile.id, profile);
                const lastMsg = messages.find(m => m.sender_id === profile.id || m.receiver_id === profile.id);
                renderContactItem(profile, lastMsg ? lastMsg.content : '');
            });

        } catch (err) {
            console.error(err);
            contactListEl.innerHTML = '<p style="color:red;text-align:center">加载失败</p>';
        }
    }

    // 渲染单个联系人条目的辅助函数
    function renderContactItem(user, previewText) {
        const div = document.createElement('div');
        div.className = 'contact-item';
        div.dataset.uid = user.id;
        
        // 如果是系统通知，加个特殊样式
        if (user.isSystem) {
            div.classList.add('system-item');
        }

        div.onclick = () => selectChat(user);
        
        const displayName = user.username || user.email;
        // 如果是系统，显示喇叭图标；如果是用户，显示首字母
        const initial = user.isSystem ? 
            '<span class="material-icons-round" style="font-size:20px">campaign</span>' : 
            (displayName ? displayName[0].toUpperCase() : '?');

        div.innerHTML = `
            <div class="avatar-placeholder">${initial}</div>
            <div class="contact-info">
                <div class="contact-name">${displayName}</div>
                <div class="contact-preview">${escapeHtml(previewText)}</div>
            </div>
        `;
        contactListEl.appendChild(div);
    }

    // ============================================================
    // 3. 搜索新用户 (私信)
    // ============================================================
    document.getElementById('btn-new-chat').addEventListener('click', () => {
        searchContainer.classList.toggle('hidden');
        document.getElementById('search-email-input').focus();
    });

    document.getElementById('btn-search-confirm').addEventListener('click', async () => {
        const email = document.getElementById('search-email-input').value.trim();
        if (!email) return;

        try {
            const { data, error } = await client.from('profiles').select('*').eq('email', email).single();
            if (error || !data) {
                Notifications.show('未找到该用户', 'warning');
                return;
            }
            if (data.id === myId) {
                Notifications.show('不能给自己发消息', 'warning');
                return;
            }

            searchContainer.classList.add('hidden');
            document.getElementById('search-email-input').value = '';
            
            // 如果不在列表里，加入缓存
            if (!contactsMap.has(data.id)) {
                contactsMap.set(data.id, data);
            }
            selectChat(data);

        } catch (err) {
            Notifications.show('查找失败', 'error');
        }
    });

    // ============================================================
    // 4. 选择聊天对象 (区分系统 vs 私信)
    // ============================================================
    async function selectChat(userProfile) {
        activeChatUser = userProfile;
        
        // UI 高亮
        document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
        const activeEl = document.querySelector(`.contact-item[data-uid="${userProfile.id}"]`);
        if (activeEl) activeEl.classList.add('active');

        chatEmpty.classList.add('hidden');
        chatContent.classList.remove('hidden');
        chatContainer.classList.add('active-chat');

        document.getElementById('current-chat-name').textContent = userProfile.username || userProfile.email;
        messagesArea.innerHTML = '<div class="loading-spinner" style="margin:20px auto"></div>';

        // ----------------------------------------------------
        // 分支 A: 如果是系统通知 (只读)
        // ----------------------------------------------------
        if (userProfile.isSystem) {
            // 隐藏输入框
            chatPane.classList.add('read-only');
            
            try {
                // 查询 notifications 表
                const { data: notifs, error } = await client
                    .from('notifications')
                    .select('*')
                    .eq('user_id', myId)
                    .order('created_at', { ascending: true }); // 按时间正序排列

                if (error) throw error;
                renderSystemMessages(notifs);

                // 标记所有未读为已读 (可选)
                await client.from('notifications').update({ is_read: true }).eq('user_id', myId).eq('is_read', false);

            } catch (err) {
                console.error(err);
                messagesArea.innerHTML = '<p style="text-align:center">加载通知失败</p>';
            }
        } 
        // ----------------------------------------------------
        // 分支 B: 如果是普通私信 (可回复)
        // ----------------------------------------------------
        else {
            // 显示输入框
            chatPane.classList.remove('read-only');
            sendBtn.disabled = false;

            try {
                // 查询 private_messages 表
                const { data: messages, error } = await client
                    .from('private_messages')
                    .select('*')
                    .or(`and(sender_id.eq.${myId},receiver_id.eq.${userProfile.id}),and(sender_id.eq.${userProfile.id},receiver_id.eq.${myId})`)
                    .order('created_at', { ascending: true });

                if (error) throw error;
                renderPrivateMessages(messages);

            } catch (err) {
                console.error(err);
                messagesArea.innerHTML = '<p style="text-align:center">消息加载失败</p>';
            }
        }
    }

    // 渲染系统通知列表
    function renderSystemMessages(notifications) {
        messagesArea.innerHTML = '';
        if (notifications.length === 0) {
            messagesArea.innerHTML = '<p style="text-align:center;color:#ccc;margin-top:20px">暂无系统通知</p>';
            return;
        }

        notifications.forEach(note => {
            const div = document.createElement('div');
            // 系统消息使用特殊样式，居中显示
            div.className = 'message-bubble system-msg';
            
            // 组装内容：如果有标题，加粗显示
            let html = '';
            if (note.title) {
                html += `<div class="system-msg-title">${escapeHtml(note.title)}</div>`;
            }
            html += escapeHtml(note.content);
            html += `<div class="message-time">${new Date(note.created_at).toLocaleString()}</div>`;

            div.innerHTML = html;
            messagesArea.appendChild(div);
        });
        scrollToBottom();
    }

    // 渲染私信列表 (保持之前逻辑)
    function renderPrivateMessages(messages) {
        messagesArea.innerHTML = '';
        if (messages.length === 0) {
            messagesArea.innerHTML = '<p style="text-align:center;color:#ccc;margin-top:20px">暂无消息，打个招呼吧！</p>';
            return;
        }
        messages.forEach(msg => appendMessageUI(msg));
        scrollToBottom();
    }

    function appendMessageUI(msg) {
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
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function scrollToBottom() {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    // ============================================================
    // 5. 发送私信 (只对普通用户有效)
    // ============================================================
    async function sendMessage() {
        const text = msgInput.value.trim();
        // 双重检查：如果当前是系统通知模式，禁止发送
        if (!text || !activeChatUser || activeChatUser.isSystem) return;

        const tempMsg = {
            sender_id: myId,
            content: text,
            created_at: new Date().toISOString()
        };
        appendMessageUI(tempMsg);
        msgInput.value = '';

        try {
            const { error } = await client
                .from('private_messages')
                .insert({
                    sender_id: myId,
                    receiver_id: activeChatUser.id,
                    content: text,
                    is_read: false
                });

            if (error) throw error;
        } catch (err) {
            console.error(err);
            Notifications.show('发送失败', 'error');
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
    // 6. 实时监听 (同时监听私信和系统通知)
    // ============================================================
    
    // 监听私信
    client.channel('public:private_messages')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'private_messages', 
            filter: `receiver_id=eq.${myId}` 
        }, (payload) => {
            const newMsg = payload.new;
            // 如果正和此人聊天
            if (activeChatUser && !activeChatUser.isSystem && newMsg.sender_id === activeChatUser.id) {
                appendMessageUI(newMsg);
                client.from('private_messages').update({ is_read: true }).eq('id', newMsg.id);
            } else {
                Notifications.show(`收到新私信`, 'info');
                loadContacts(); // 刷新列表预览
            }
        })
        .subscribe();

    // 监听系统通知
    client.channel('public:notifications')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${myId}`
        }, (payload) => {
            const newNote = payload.new;
            // 如果正打开系统通知页面
            if (activeChatUser && activeChatUser.isSystem) {
                // 手动刷新一下列表即可，或者手动插入DOM
                selectChat(SYSTEM_BOT); 
            } else {
                Notifications.show(`收到系统通知: ${newNote.title || '新消息'}`, 'info');
                loadContacts(); // 刷新列表预览
            }
        })
        .subscribe();

    // 移动端返回
    document.getElementById('back-to-contacts').addEventListener('click', () => {
        chatContainer.classList.remove('active-chat');
        activeChatUser = null;
    });

    // 初始加载
    loadContacts();
});
