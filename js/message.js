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

    // 定义系统通知虚拟用户
    const SYSTEM_BOT = {
        id: 'system_notification_bot',
        email: '站内通知', // 因为没有 username，我们借用 email 字段显示名称
        isSystem: true
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
    const chatPane = document.getElementById('chat-pane');
    const searchContainer = document.getElementById('new-chat-search');

    // ============================================================
    // 2. 加载联系人列表
    // ============================================================
    async function loadContacts() {
        contactListEl.innerHTML = '<div class="loading-spinner" style="margin:20px auto"></div>';
        
        try {
            // A. 获取系统通知预览
            const { data: sysNotifs } = await client
                .from('notifications')
                .select('*')
                .eq('user_id', myId)
                .order('created_at', { ascending: false })
                .limit(1);
            
            const lastSysMsg = sysNotifs && sysNotifs.length > 0 ? sysNotifs[0] : null;

            // B. 获取私信列表 (private_messages)
            // 注意：确保你已经创建了 private_messages 表，如果没有，请看下文提示
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

            // 获取私信用户信息 (修复点：只查询 id 和 email)
            let profiles = [];
            if (contactIds.size > 0) {
                const { data: pros, error: profileError } = await client
                    .from('profiles')
                    .select('id, email') // <--- 修改这里：去掉了 username 和 avatar_url
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
            // 如果报错是因为 private_messages 表不存在，提示用户
            if (err.message && err.message.includes('relation "private_messages" does not exist')) {
                contactListEl.innerHTML = '<p style="color:red;text-align:center;padding:20px">请先在数据库创建 private_messages 表</p>';
            } else {
                contactListEl.innerHTML = '<p style="color:red;text-align:center">加载失败: ' + err.message + '</p>';
            }
        }
    }

    // 渲染单个联系人条目的辅助函数
    function renderContactItem(user, previewText) {
        const div = document.createElement('div');
        div.className = 'contact-item';
        div.dataset.uid = user.id;
        
        if (user.isSystem) {
            div.classList.add('system-item');
        }

        div.onclick = () => selectChat(user);
        
        // 修复点：使用 email 作为显示名称，如果没有 email (异常情况) 则显示 "Unknown"
        // 截取邮箱前缀作为显示的昵称，比如 "test@gmail.com" 显示 "test"
        const rawName = user.email || 'Unknown';
        const displayName = user.isSystem ? rawName : rawName.split('@')[0];
        
        // 头像逻辑：取首字母
        const initial = user.isSystem ? 
            '<span class="material-icons-round" style="font-size:20px">campaign</span>' : 
            (rawName[0].toUpperCase());

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
            // 修复点：只查询 id 和 email
            const { data, error } = await client
                .from('profiles')
                .select('id, email') 
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

            searchContainer.classList.add('hidden');
            document.getElementById('search-email-input').value = '';
            
            if (!contactsMap.has(data.id)) {
                contactsMap.set(data.id, data);
            }
            selectChat(data);

        } catch (err) {
            Notifications.show('查找失败', 'error');
        }
    });

    // ============================================================
    // 4. 选择聊天对象
    // ============================================================
    async function selectChat(userProfile) {
        activeChatUser = userProfile;
        
        document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
        const activeEl = document.querySelector(`.contact-item[data-uid="${userProfile.id}"]`);
        if (activeEl) activeEl.classList.add('active');

        chatEmpty.classList.add('hidden');
        chatContent.classList.remove('hidden');
        chatContainer.classList.add('active-chat');

        // 修复点：使用 email 显示
        const rawName = userProfile.email || 'Unknown';
        document.getElementById('current-chat-name').textContent = userProfile.isSystem ? rawName : rawName.split('@')[0];
        
        messagesArea.innerHTML = '<div class="loading-spinner" style="margin:20px auto"></div>';

        // 分支 A: 系统通知 (只读)
        if (userProfile.isSystem) {
            chatPane.classList.add('read-only');
            
            try {
                const { data: notifs, error } = await client
                    .from('notifications')
                    .select('*')
                    .eq('user_id', myId)
                    .order('created_at', { ascending: true });

                if (error) throw error;
                renderSystemMessages(notifs);
                
                // 标记已读
                await client.from('notifications').update({ is_read: true }).eq('user_id', myId).eq('is_read', false);

            } catch (err) {
                console.error(err);
                messagesArea.innerHTML = '<p style="text-align:center">加载通知失败</p>';
            }
        } 
        // 分支 B: 私信 (可回复)
        else {
            chatPane.classList.remove('read-only');
            sendBtn.disabled = false;

            try {
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

    function renderSystemMessages(notifications) {
        messagesArea.innerHTML = '';
        if (notifications.length === 0) {
            messagesArea.innerHTML = '<p style="text-align:center;color:#ccc;margin-top:20px">暂无系统通知</p>';
            return;
        }

        notifications.forEach(note => {
            const div = document.createElement('div');
            div.className = 'message-bubble system-msg';
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
    // 5. 发送私信
    // ============================================================
    async function sendMessage() {
        const text = msgInput.value.trim();
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
    // 6. 实时监听
    // ============================================================
    
    // 私信监听
    client.channel('public:private_messages')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'private_messages', 
            filter: `receiver_id=eq.${myId}` 
        }, (payload) => {
            const newMsg = payload.new;
            if (activeChatUser && !activeChatUser.isSystem && newMsg.sender_id === activeChatUser.id) {
                appendMessageUI(newMsg);
                client.from('private_messages').update({ is_read: true }).eq('id', newMsg.id);
            } else {
                Notifications.show(`收到新私信`, 'info');
                loadContacts(); 
            }
        })
        .subscribe();

    // 通知监听
    client.channel('public:notifications')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${myId}`
        }, (payload) => {
            const newNote = payload.new;
            if (activeChatUser && activeChatUser.isSystem) {
                selectChat(SYSTEM_BOT); 
            } else {
                Notifications.show(`收到系统通知: ${newNote.title || '新消息'}`, 'info');
                loadContacts();
            }
        })
        .subscribe();

    document.getElementById('back-to-contacts').addEventListener('click', () => {
        chatContainer.classList.remove('active-chat');
        activeChatUser = null;
    });

    loadContacts();
});
