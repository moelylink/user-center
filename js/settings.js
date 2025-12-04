// settings.js
// 暴露给 dashboard-core.js 调用
window.initSettings = function() {
    loadMessages();
    setupSettingsEvents();
};

function setupSettingsEvents() {
    // 1. 修改邮箱
    const emailForm = document.getElementById('form-update-email');
    // 防止重复绑定
    if (emailForm.getAttribute('data-bound') === 'true') return;
    
    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newEmail = document.getElementById('new-email').value;
        if (!newEmail) return window.toast('请输入新邮箱', 'warning');
        
        const { error } = await window.supabaseClient.auth.updateUser({ email: newEmail });
        if (error) window.toast(error.message, 'error');
        else window.toast('确认邮件已发送至新邮箱', 'success');
    });
    emailForm.setAttribute('data-bound', 'true');

    // 2. 绑定社交账号 (GitHub/Google)
    document.querySelectorAll('.link-social').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const provider = e.currentTarget.dataset.provider;
            const { error } = await window.supabaseClient.auth.signInWithOAuth({
                provider: provider,
                options: { redirectTo: window.location.href }
            });
            if (error) window.toast(error.message, 'error');
        });
    });

    // 3. 发送私信
    const msgForm = document.getElementById('form-send-message');
    if (msgForm.getAttribute('data-bound') === 'true') return;

    msgForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const recipientEmail = document.getElementById('msg-recipient-email').value;
        const content = document.getElementById('msg-content').value;
        const client = window.supabaseClient;

        // 步骤 1: 查找用户 ID
        const { data: recipient, error: findError } = await client
            .from('profiles')
            .select('id')
            .eq('email', recipientEmail)
            .single();

        if (findError || !recipient) {
            window.toast('找不到该用户，请确认邮箱', 'error');
            return;
        }

        // 步骤 2: 写入消息表
        const { data: { user } } = await client.auth.getUser();
        const { error: sendError } = await client
            .from('messages')
            .insert({
                sender_id: user.id,
                receiver_id: recipient.id,
                content: content
            });

        if (sendError) {
            window.toast(sendError.message, 'error');
        } else {
            window.toast('发送成功', 'success');
            msgForm.reset();
            M.Modal.getInstance(document.getElementById('modal-message')).close();
            // 刷新列表（如果是自己发给自己，这里可以立即看到）
            loadMessages();
        }
    });
    msgForm.setAttribute('data-bound', 'true');
}

async function loadMessages() {
    const client = window.supabaseClient;
    const { data: { user } } = await client.auth.getUser();
    
    const { data: messages, error } = await client
        .from('messages')
        .select(`
            id, content, created_at,
            sender:sender_id (email)
        `)
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

    const list = document.getElementById('message-list');
    list.innerHTML = '';

    if (error) return console.error(error);
    if (!messages || messages.length === 0) {
        list.innerHTML = '<li class="collection-item center-align">暂无新消息</li>';
        return;
    }

    messages.forEach(msg => {
        const li = document.createElement('li');
        li.className = 'collection-item avatar';
        const senderInitial = msg.sender ? msg.sender.email.charAt(0).toUpperCase() : '?';
        const senderEmail = msg.sender ? msg.sender.email : '未知用户';
        
        li.innerHTML = `
            <i class="material-icons circle green">${senderInitial}</i>
            <span class="title"><strong>${senderEmail}</strong></span>
            <p class="truncate" style="margin-top:5px;">${msg.content}</p>
            <span class="secondary-content grey-text" style="font-size:0.8rem">
                ${new Date(msg.created_at).toLocaleDateString()}
            </span>
        `;
        list.appendChild(li);
    });
}
