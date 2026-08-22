
document.addEventListener('DOMContentLoaded', async () => {
    // 依赖 common.js 中的 client (Supabase实例) 和 Notifications
    if (typeof client === 'undefined') {
        console.error('Supabase client not initialized. Make sure common.js is loaded.');
        return;
    }

    // 1. 检查 Session
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
        window.location.href = '/login/?redirect=/';
        return;
    }

    const user = session.user;

    // =========================================
    // 2.1 渲染用户信息
    // =========================================
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('user-id').textContent = user.id;

    // 格式化日期
    const regDate = new Date(user.created_at);
    document.getElementById('user-reg-date').textContent = regDate.toLocaleDateString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric'
    });

    // =========================================
    // 2.2 渲染第三方绑定状态
    // =========================================
    function renderIdentities() {
        const identities = user.identities || [];
        const providers = identities.map(id => id.provider);

        ['google', 'github', 'azure'].forEach(provider => {
            const btn = document.querySelector(`.bind-btn[data-provider="${provider}"]`);
            if (!btn) return;

            // 检查是否已绑定 (注意: azure 的 provider 可能是 'azure' 也可能是 'workos' 等)
            const isLinked = providers.includes(provider);

            if (isLinked) {
                btn.textContent = '已绑定';
                btn.classList.add('linked');
                btn.disabled = true;
            } else {
                btn.textContent = '绑定';
                btn.classList.remove('linked');
                btn.disabled = false;

                // 绑定事件
                btn.onclick = async () => {
                    try {
                        const token = await executeCaptcha();
                        const { data, error } = await client.auth.signInWithOAuth({
                            provider: provider,
                            options: {
                                captchaToken: token,
                                redirectTo: window.location.href // 绑定后跳回当前设置页
                            }
                        });
                        if (error) throw error;
                    } catch (err) {
                        if (err !== 'Captcha closed') Notifications.show('绑定启动失败: ' + err.message, 'error');
                    }
                };
            }
        });
    }
    renderIdentities();

    // =========================================
    // 2.3 修改密码
    // =========================================
    const pwdForm = document.getElementById('form-change-pwd');
    pwdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldPwd = document.getElementById('old-pwd').value;
        const newPwd = document.getElementById('new-pwd').value;
        const repeatPwd = document.getElementById('new-pwd-repeat').value;

        if (newPwd.length < 8) return Notifications.show('新密码需大于8位', 'warning');
        if (newPwd !== repeatPwd) return Notifications.show('两次新密码输入不一致', 'warning');

        Notifications.show('正在更新密码...', 'info');

        const { error: updateError } = await client.auth.updateUser({
            password: newPwd,
            current_password: oldPwd
        });

        if (updateError) {
            Notifications.show(updateError.message, 'error');
        } else {
            Notifications.show('密码修改成功！', 'success');
            pwdForm.reset();
        }
    });


    // =========================================
    // 2.5 通行密钥管理
    // =========================================
    const passkeyButton = document.getElementById('btn-create-passkey');
    const passkeyState = document.getElementById('passkey-state');
    const passkeyList = document.getElementById('passkey-list');
    let passkeyActionInProgress = false;
    let lastFocusedElement = null;

    function isPasskeySupported() {
        return window.isSecureContext &&
            typeof window.PublicKeyCredential !== 'undefined' &&
            navigator.credentials &&
            typeof navigator.credentials.create === 'function' &&
            typeof client.auth.registerPasskey === 'function' &&
            client.auth.passkey &&
            typeof client.auth.passkey.list === 'function';
    }

    function isPasskeyCancellation(error) {
        return error && (error.name === 'NotAllowedError' || error.code === 'webauthn_operation_cancelled');
    }

    function setPasskeyState(message, isError = false) {
        passkeyState.textContent = message;
        passkeyState.classList.toggle('error', isError);
    }

    function formatPasskeyDate(value) {
        if (!value) return '';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    function createPasskeyModal({ title, message, value = '', confirmText, danger = false, onConfirm }) {
        lastFocusedElement = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const card = document.createElement('div');
        card.className = 'modal-card';
        const heading = document.createElement('h3');
        heading.textContent = title;
        const description = document.createElement('p');
        description.textContent = message;
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'btn-outline';
        cancelButton.textContent = '取消';
        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = danger ? 'btn-danger' : 'btn-primary';
        confirmButton.textContent = confirmText;

        let input = null;
        if (value !== null) {
            const inputGroup = document.createElement('div');
            inputGroup.className = 'input-group';
            input = document.createElement('input');
            input.type = 'text';
            input.value = value;
            input.maxLength = 120;
            input.placeholder = ' ';
            input.setAttribute('aria-label', '通行密钥名称');
            const label = document.createElement('label');
            label.textContent = '通行密钥名称';
            inputGroup.append(input, label);
            card.append(heading, description, inputGroup, actions);
        } else {
            card.append(heading, description, actions);
        }

        actions.append(cancelButton, confirmButton);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        const close = () => {
            overlay.remove();
            if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
        };

        cancelButton.addEventListener('click', close);
        overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
        overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
        confirmButton.addEventListener('click', async () => {
            const name = input ? input.value.trim() : null;
            if (input && !name) {
                Notifications.show('请输入通行密钥名称', 'warning');
                input.focus();
                return;
            }
            confirmButton.disabled = true;
            cancelButton.disabled = true;
            try {
                const shouldClose = await onConfirm(name);
                if (shouldClose !== false) close();
            } finally {
                confirmButton.disabled = false;
                cancelButton.disabled = false;
            }
        });

        setTimeout(() => (input || confirmButton).focus(), 0);
    }

    function renderPasskeys(passkeys) {
        passkeyList.replaceChildren();
        if (!passkeys.length) {
            setPasskeyState('尚未添加通行密钥。');
            return;
        }
        setPasskeyState(`已添加 ${passkeys.length} 个通行密钥。`);

        passkeys.forEach((passkey) => {
            const item = document.createElement('div');
            item.className = 'passkey-item';
            const icon = document.createElement('span');
            icon.className = 'material-icons-round passkey-icon';
            icon.textContent = 'passkey';
            const details = document.createElement('div');
            details.className = 'passkey-details';
            const name = document.createElement('div');
            name.className = 'passkey-name';
            name.textContent = passkey.friendly_name || '未命名通行密钥';
            const meta = document.createElement('div');
            meta.className = 'passkey-meta';
            const date = formatPasskeyDate(passkey.last_used_at || passkey.created_at);
            meta.textContent = date ? `最近使用或创建于 ${date}` : '已添加通行密钥';
            details.append(name, meta);
            const actions = document.createElement('div');
            actions.className = 'passkey-actions';

            const renameButton = document.createElement('button');
            renameButton.type = 'button';
            renameButton.className = 'btn-outline';
            renameButton.setAttribute('aria-label', `重命名 ${name.textContent}`);
            const renameIcon = document.createElement('span');
            renameIcon.className = 'material-icons-round';
            renameIcon.textContent = 'edit';
            renameButton.appendChild(renameIcon);
            renameButton.addEventListener('click', () => {
                createPasskeyModal({
                    title: '重命名通行密钥',
                    message: '使用便于识别的名称，例如“我的手机”。',
                    value: passkey.friendly_name || '',
                    confirmText: '保存',
                    onConfirm: async (friendlyName) => {
                        const { error } = await client.auth.passkey.update({ passkeyId: passkey.id, friendlyName });
                        if (error) {
                            Notifications.show('重命名失败，请稍后重试。', 'error');
                            return false;
                        }
                        Notifications.show('通行密钥名称已更新', 'success');
                        await loadPasskeys();
                    }
                });
            });

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn-danger';
            deleteButton.setAttribute('aria-label', `删除 ${name.textContent}`);
            const deleteIcon = document.createElement('span');
            deleteIcon.className = 'material-icons-round';
            deleteIcon.textContent = 'delete';
            deleteButton.appendChild(deleteIcon);
            deleteButton.addEventListener('click', () => {
                createPasskeyModal({
                    title: '删除通行密钥？',
                    message: `删除“${name.textContent}”后，对应设备将无法再使用此通行密钥登录。请保留其他登录方式。`,
                    value: null,
                    confirmText: '删除',
                    danger: true,
                    onConfirm: async () => {
                        const { error } = await client.auth.passkey.delete({ passkeyId: passkey.id });
                        if (error) {
                            Notifications.show('删除失败，请稍后重试。', 'error');
                            return false;
                        }
                        Notifications.show('通行密钥已删除', 'success');
                        await loadPasskeys();
                    }
                });
            });

            actions.append(renameButton, deleteButton);
            item.append(icon, details, actions);
            passkeyList.appendChild(item);
        });
    }

    async function loadPasskeys() {
        if (!isPasskeySupported()) {
            passkeyButton.disabled = true;
            setPasskeyState('当前浏览器不支持通行密钥管理，请使用支持 WebAuthn 的 HTTPS 浏览器。');
            return;
        }

        setPasskeyState('正在加载通行密钥...');
        const { data, error } = await client.auth.passkey.list();
        if (error) {
            console.error('Passkey list failed:', error);
            setPasskeyState('无法加载通行密钥，请稍后重试。', true);
            return;
        }
        renderPasskeys(data || []);
    }

    if (passkeyButton) {
            passkeyButton.addEventListener('click', () => {
                if (!isPasskeySupported() || passkeyActionInProgress) return;
                createPasskeyModal({
                    title: '添加通行密钥',
                    message: '为此通行密钥设置一个便于识别的名称。',
                    value: '我的通行密钥',
                    confirmText: '继续',
                    onConfirm: async (friendlyName) => {
                        passkeyActionInProgress = true;
                        passkeyButton.disabled = true;
                        try {
                            const { data, error } = await client.auth.registerPasskey();
                            if (error) throw error;
                            if (data && data.id) {
                                const { error: renameError } = await client.auth.passkey.update({
                                    passkeyId: data.id,
                                    friendlyName
                                });
                                if (renameError) {
                                    // passkey 已注册成功，命名失败不应阻断整体流程
                                    console.warn('Passkey rename failed:', renameError);
                                    Notifications.show('通行密钥已添加，但命名失败，可稍后重命名。', 'warning');
                                } else {
                                    Notifications.show('通行密钥已添加', 'success');
                                }
                            } else {
                                Notifications.show('通行密钥已添加', 'success');
                            }
                            await loadPasskeys();
                        } catch (err) {
                            if (!isPasskeyCancellation(err)) {
                                console.error('Passkey registration failed:', err);
                                Notifications.show('添加通行密钥失败，请稍后重试。', 'error');
                            }
                        } finally {
                            passkeyActionInProgress = false;
                            passkeyButton.disabled = false;
                        }
                    }
                });
            });
            loadPasskeys();
        }

    // =========================================
    // 2.4 修改邮箱
    // =========================================
    const emailForm = document.getElementById('form-change-email');
    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newEmail = document.getElementById('new-email').value.trim();

        if (newEmail === user.email) return Notifications.show('新邮箱不能与当前邮箱相同', 'warning');

        // 发送修改请求
        const { error } = await client.auth.updateUser({ email: newEmail });

        if (error) {
            Notifications.show(error.message, 'error');
        } else {
            Notifications.show('验证邮件已发送至新邮箱，请查收确认', 'success');
            emailForm.reset();
        }
    });
});

// 侧边栏高亮逻辑 (简单实现：根据URL匹配)
const currentPath = window.location.pathname;
document.querySelectorAll('.sidebar-item').forEach(item => {
    if (item.getAttribute('href') === currentPath) {
        item.classList.add('active');
    }
});
