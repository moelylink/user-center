// user-center.js
const client = window.supabaseClient;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 验证 Session
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = session.user;
    
    // 初始化 UI
    M.Modal.init(document.querySelectorAll('.modal'));
    M.Tabs.init(document.querySelectorAll('.tabs'));
    
    loadUserProfile();
    loadMessages();
    setupUserActions();
});

function loadUserProfile() {
    document.getElementById('user-email-display').textContent = currentUser.email;
    document.getElementById('user-created-at').textContent = new Date(currentUser.created_at).toLocaleDateString();
}

async function setupUserActions() {
    // 1. 修改邮箱
    document.getElementById('form-update-email').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newEmail = document.getElementById('new-email').value;
        const { error } = await client.auth.updateUser({ email: newEmail });
        if (error) window.toast(error.message, 'error');
        else window.toast('请去新邮箱确认更改', 'success');
    });

    // 2. 绑定社交账号 (实际上就是再次调用 OAuth 登录，Supabase 会自动关联同名邮箱或合并)
    document.querySelectorAll('.link-social').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const provider = e.target.dataset.provider;
            const { error } = await client.auth.signInWithOAuth({
                provider: provider,
                options: { redirectTo: window.location.href }
            });
        });
    });

    // 3. 退出登录
    document.getElementById('btn-logout').addEventListener('click', async () => {
        await client.auth.signOut();
        window.location.href = 'login.html';
    });
    
    // 4. 发送私信
    document.getElementById('form-send-message').addEventListener('submit', async (e) => {
        e.preventDefault();
        const recipientEmail = document.getElementById('msg-recipient-email').value;
        const content = document.getElementById('msg-content').value;
        
        // 第一步：根据邮箱查找 User ID (利用 profiles 表)
        const { data: recipient, error: findError } = await client
            .from('profiles')
            .select('id')
            .eq('email', recipientEmail)
            .single();
            
        if (findError || !recipient) {
            window.toast('找不到该用户，请确认邮箱正确', 'error');
            return;
        }

        // 第二步：发送消息
        const { error: sendError } = await client
            .from('messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: recipient.id,
                content: content
            });
            
        if (sendError) window.toast(sendError.message, 'error');
        else {
            window.toast('发送成功', 'success');
            document.getElementById('form-send-message').reset();
            M.Modal.getInstance(document.getElementById('modal-message')).close();
        }
    });
}

// 加载站内信
async function loadMessages() {
    // 获取收到的消息，同时关联发送者的信息
    const { data: messages, error } = await client
        .from('messages')
        .select(`
            id, content, created_at, is_read,
            sender:sender_id (email)
        `)
        .eq('receiver_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) return console.error(error);

    const container = document.getElementById('message-list');
    container.innerHTML = '';
    
    if (messages.length === 0) {
        container.innerHTML = '<li class="collection-item">暂无消息</li>';
        return;
    }

    messages.forEach(msg => {
        const li = document.createElement('li');
        li.className = 'collection-item avatar';
        li.innerHTML = `
            <i class="material-icons circle blue">mail</i>
            <span class="title">来自: ${msg.sender ? msg.sender.email : '未知用户'}</span>
            <p>${msg.content}</p>
            <span class="secondary-content grey-text text-lighten-1" style="font-size:0.8rem">
                ${new Date(msg.created_at).toLocaleString()}
            </span>
        `;
        container.appendChild(li);
    });
}
