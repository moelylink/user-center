document.addEventListener('DOMContentLoaded', async () => {
    // 依赖 common.js
    if (typeof client === 'undefined') return;

    // 状态变量
    let currentEmail = '';
    const SITE_KEY = '8f124646-ac04-496c-85b6-6396e8b8da3c'; 

    // DOM 元素引用
    const steps = {
        email: document.getElementById('step-email'),
        password: document.getElementById('step-password'),
        register: document.getElementById('step-register'),
        forgot: document.getElementById('step-forgot'), // 请求邮件页
        update: document.getElementById('step-update-password') // 设置新密码页
    };
    
    const elements = {
        inputEmail: document.getElementById('input-email'),
        regEmail: document.getElementById('reg-email'),
        forgotEmail: document.getElementById('forgot-email'),
        displayEmail: document.getElementById('display-email'),
        title: document.getElementById('auth-title'),
        subtitle: document.getElementById('auth-subtitle'),
        // 新密码输入框
        newPwd: document.getElementById('new-password'),
        newPwdConfirm: document.getElementById('new-password-confirm')
    };

    // 获取重定向 URL
    function getRedirectUrl() {
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        if (redirect) {
            if(redirect.includes('moely.link')) return redirect;
            if(redirect.startsWith('/')) return "https://user.moely.link" + redirect;
        }
        return 'https://user.moely.link/'; 
    }

    // 切换步骤 UI
    function switchStep(stepName) {
        Object.values(steps).forEach(el => { if(el) el.classList.remove('active'); });
        if(steps[stepName]) steps[stepName].classList.add('active');

        // 动态更新标题
        if (stepName === 'email') {
            elements.title.textContent = '登录';
            elements.subtitle.textContent = '使用您的 Moely 账号';
        } else if (stepName === 'password') {
            elements.title.textContent = '欢迎回来';
            elements.subtitle.textContent = '请输入密码以继续';
            if(elements.displayEmail) elements.displayEmail.textContent = currentEmail; 
        } else if (stepName === 'forgot') {
            elements.title.textContent = '重置密码';
            elements.subtitle.textContent = '通过邮箱找回账号';
        } else if (stepName === 'update') {
            elements.title.textContent = '重置密码';
            elements.subtitle.textContent = '请输入新的安全密码';
        }
    }

    // 人机验证
    function executeCaptcha() {
        return new Promise((resolve, reject) => {
            const overlay = document.createElement('div');
            overlay.className = 'captcha-overlay';
            const box = document.createElement('div');
            box.className = 'captcha-box';
            const captchaDiv = document.createElement('div');
            const uniqueId = 'h-captcha-' + Date.now();
            captchaDiv.id = uniqueId;
            box.appendChild(captchaDiv);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('active'));

            if (!window.hcaptcha) {
                Notifications.show('验证组件加载失败', 'error');
                overlay.remove(); reject('Captcha fail'); return;
            }

            try {
                window.hcaptcha.render(uniqueId, {
                    sitekey: SITE_KEY,
                    callback: (token) => {
                        overlay.classList.remove('active');
                        setTimeout(() => overlay.remove(), 300);
                        resolve(token);
                    },
                    'error-callback': () => {
                        Notifications.show('验证失败', 'error');
                        overlay.remove(); reject('Captcha error');
                    },
                    'close-callback': () => {
                        overlay.remove(); reject('Captcha closed');
                    }
                });
            } catch (e) {
                overlay.remove(); reject(e);
            }
        });
    }

    // ============================================================
    // 监听 Auth 状态 (核心：处理重置密码回调)
    // ============================================================
    client.auth.onAuthStateChange(async (event, session) => {
        // 当用户点击邮件链接跳转回来时，事件为 PASSWORD_RECOVERY
        if (event === 'PASSWORD_RECOVERY') {
            switchStep('update'); // 直接显示设置新密码的界面
            Notifications.show('验证成功，请设置新密码', 'info');
        } 
        else if (event === 'SIGNED_IN') {
            // 普通登录成功，延迟跳转（防止覆盖 RECOVERY 事件）
            setTimeout(() => {
                // 如果 URL 里包含 type=recovery，说明是重置流程，不要跳走
                const isRecovery = window.location.hash.includes('type=recovery');
                if (!isRecovery) {
                    window.location.href = getRedirectUrl();
                }
            }, 500);
        }
    });

    // ============================================================
    // 常规登录/注册逻辑
    // ============================================================

    // 1. 输入邮箱 -> 下一步
    document.getElementById('btn-next').addEventListener('click', () => {
        const email = elements.inputEmail.value.trim();
        if (!email) return Notifications.show('请输入邮箱', 'warning');
        if (!/^\S+@\S+\.\S+$/.test(email)) return Notifications.show('邮箱格式不正确', 'warning');
        currentEmail = email;
        switchStep('password');
    });

    // 2. 去注册
    document.getElementById('btn-to-register').addEventListener('click', () => {
        if(elements.inputEmail.value) currentEmail = elements.inputEmail.value;
        switchStep('register');
    });

    // 3. 返回修改邮箱
    document.getElementById('btn-back-email').addEventListener('click', () => switchStep('email'));
    const userChip = document.getElementById('user-chip');
    if(userChip) userChip.addEventListener('click', () => switchStep('email'));

    // 4. 登录
    document.getElementById('btn-login').addEventListener('click', async () => {
        const password = document.getElementById('input-password').value;
        if (!password) return Notifications.show('请输入密码', 'warning');

        try {
            const token = await executeCaptcha();
            const { error } = await client.auth.signInWithPassword({
                email: currentEmail,
                password: password,
                options: { captchaToken: token }
            });
            if (error) throw error;
            Notifications.show('登录成功', 'success');
        } catch (err) {
            if (err !== 'Captcha closed') Notifications.show(err.message || '登录失败', 'error');
        }
    });

    // 5. 注册
    document.getElementById('btn-register').addEventListener('click', async () => {
        const email = elements.regEmail.value.trim();
        const pwd = document.getElementById('reg-password').value;
        const pwdR = document.getElementById('reg-password-repeat').value;

        if (!email) return Notifications.show('请输入电子邮箱', 'warning');
        if (pwd.length < 8) return Notifications.show('密码长度需大于8位', 'warning');
        if (pwd !== pwdR) return Notifications.show('两次密码输入不一致', 'warning');

        try {
            const token = await executeCaptcha();
            const { error } = await client.auth.signUp({
                email: email,
                password: pwd,
                options: { 
                    captchaToken: token,
                    emailRedirectTo: getRedirectUrl()
                }
            });
            if (error) throw error;
            Notifications.show('注册成功！请查收验证邮件', 'success');
            setTimeout(() => { elements.inputEmail.value = email; switchStep('email'); }, 3000);
        } catch (err) {
            if (err !== 'Captcha closed') Notifications.show(err.message, 'error');
        }
    });

    // ============================================================
    // 重置密码逻辑 (标准流程)
    // ============================================================

    // A. 点击"忘记密码" -> 进入邮箱输入页
    document.getElementById('btn-forgot-pwd').addEventListener('click', () => {
        if (currentEmail) elements.forgotEmail.value = currentEmail;
        switchStep('forgot');
    });

    // B. 返回登录
    document.getElementById('btn-cancel-forgot').addEventListener('click', () => switchStep('email'));

    // C. 发送重置邮件
    document.getElementById('btn-send-reset-link').addEventListener('click', async () => {
        const email = elements.forgotEmail.value.trim();
        if (!email) return Notifications.show('请输入注册邮箱', 'warning');

        try {
            const token = await executeCaptcha();
            const { error } = await client.auth.resetPasswordForEmail(email, {
                captchaToken: token,
                redirectTo: getRedirectUrl()
            });
            if (error) throw error;
            Notifications.show('重置邮件已发送，请查收', 'success');
            // 可以选择跳回登录页，或者停留在当前页提示
            setTimeout(() => switchStep('email'), 2000);
        } catch (err) {
            if (err !== 'Captcha closed') Notifications.show(err.message, 'error');
        }
    });

    // D. 提交新密码 (用户从邮件回来后)
    document.getElementById('btn-save-new-password').addEventListener('click', async () => {
        const newPwd = elements.newPwd.value;
        const confirmPwd = elements.newPwdConfirm.value;

        if (newPwd.length < 8) return Notifications.show('新密码长度需大于8位', 'warning');
        if (newPwd !== confirmPwd) return Notifications.show('两次密码输入不一致', 'warning');

        try {
            Notifications.show('正在更新密码...', 'info');
            // 调用 updateUser 修改密码
            const { error } = await client.auth.updateUser({ password: newPwd });
            
            if (error) throw error;
            
            Notifications.show('密码修改成功！正在跳转...', 'success');
            setTimeout(() => {
                window.location.href = getRedirectUrl();
            }, 1500);

        } catch (err) {
            Notifications.show('修改失败: ' + err.message, 'error');
        }
    });

    // 第三方登录 & Passkey (保持不变)
    document.querySelectorAll('.social-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const provider = e.currentTarget.getAttribute('data-provider');
            try {
                const token = await executeCaptcha();
                await client.auth.signInWithOAuth({
                    provider: provider,
                    options: { captchaToken: token, redirectTo: getRedirectUrl() }
                });
            } catch (err) { if (err !== 'Captcha closed') Notifications.show(err.message, 'error'); }
        });
    });
});
