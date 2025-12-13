document.addEventListener('DOMContentLoaded', () => {
    // 状态变量
    let currentEmail = '';
    const SITE_KEY = '8f124646-ac04-496c-85b6-6396e8b8da3c'; 

    // DOM 元素引用
    const steps = {
        email: document.getElementById('step-email'),
        password: document.getElementById('step-password'),
        register: document.getElementById('step-register')
    };
    
    const elements = {
        inputEmail: document.getElementById('input-email'),   // 登录第一步
        regEmail: document.getElementById('reg-email'),       // 注册页 (新)
        displayEmail: document.getElementById('display-email'),
        title: document.getElementById('auth-title'),
        subtitle: document.getElementById('auth-subtitle')
    };

    // 获取重定向 URL
    function getRedirectUrl() {
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        if (redirect && (redirect.startsWith('/') || redirect.startsWith(window.location.origin))) {
            return redirect;
        }
        return '/'; 
    }

    // 切换步骤
    function switchStep(stepName) {
        Object.values(steps).forEach(el => el.classList.remove('active'));
        steps[stepName].classList.add('active');

        if (stepName === 'email') {
            elements.title.textContent = '登录';
            elements.subtitle.textContent = '使用您的 萌哩 账号';
        } else if (stepName === 'password') {
            elements.title.textContent = '欢迎回来';
            elements.subtitle.textContent = '请输入密码以继续';
            elements.displayEmail.textContent = currentEmail; 
        } else if (stepName === 'register') {
            elements.title.textContent = '创建账号';
            elements.subtitle.textContent = '注册一个新的 萌哩 账号';
            
            // 邮箱同步逻辑
            if (currentEmail) {
                elements.regEmail.value = currentEmail;
                // 暂时添加 style 触发 focus 效果，或者依赖 css :not(:placeholder-shown)
            } else {
                elements.regEmail.value = '';
            }
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

    // --- 事件监听 ---

    // 1. 下一步 (去输入密码)
    document.getElementById('btn-next').addEventListener('click', async () => {
        const email = elements.inputEmail.value.trim();
        if (!email) return Notifications.show('请输入邮箱', 'warning');
        if (!/^\S+@\S+\.\S+$/.test(email)) return Notifications.show('邮箱格式不正确', 'warning');
        
        currentEmail = email;
        switchStep('password');
    });

    // 2. 去注册
    document.getElementById('btn-to-register').addEventListener('click', () => {
        const email = elements.inputEmail.value.trim();
        if (email) currentEmail = email;
        switchStep('register');
    });

    // 3. 返回修改邮箱
    document.getElementById('btn-back-email').addEventListener('click', () => switchStep('email'));
    document.getElementById('user-chip').addEventListener('click', () => switchStep('email'));

    // 4. 从注册页返回登录
    document.getElementById('btn-back-login').addEventListener('click', () => {
        const regEmailVal = elements.regEmail.value.trim();
        if (regEmailVal) currentEmail = regEmailVal;

        if (currentEmail) {
            elements.inputEmail.value = currentEmail;
            switchStep('password');
        } else {
            switchStep('email');
        }
    });

    // 5. 登录
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
            Notifications.show('登录成功！', 'success');
            setTimeout(() => window.location.href = getRedirectUrl(), 1500);
        } catch (err) {
            if (err !== 'Captcha closed') Notifications.show(err.message || '登录失败', 'error');
        }
    });

    // 6. OTP 登录
    document.getElementById('btn-otp-login').addEventListener('click', async () => {
        try {
            const token = await executeCaptcha();
            const { error } = await client.auth.signInWithOtp({
                email: currentEmail,
                options: { 
                    captchaToken: token, 
                    emailRedirectTo: window.location.origin + '/?redirect=' + encodeURIComponent(getRedirectUrl())
                }
            });
            if (error) throw error;
            Notifications.show('登录链接已发送至您的邮箱', 'success');
        } catch (err) {
            if (err !== 'Captcha closed') Notifications.show(err.message, 'error');
        }
    });

    // 7. 注册
    document.getElementById('btn-register').addEventListener('click', async () => {
        const emailVal = elements.regEmail.value.trim();
        const pwd = document.getElementById('reg-password').value;
        const pwdR = document.getElementById('reg-password-repeat').value;

        if (!emailVal) return Notifications.show('请输入电子邮箱', 'warning');
        if (!/^\S+@\S+\.\S+$/.test(emailVal)) return Notifications.show('邮箱格式不正确', 'warning');
        currentEmail = emailVal;

        if (pwd.length < 8) return Notifications.show('密码长度大于8位', 'warning');
        if (pwd !== pwdR) return Notifications.show('两次密码输入不一致', 'warning');

        try {
            const token = await executeCaptcha();
            const { error } = await client.auth.signUp({
                email: currentEmail,
                password: pwd,
                options: { 
                    captchaToken: token,
                    emailRedirectTo: window.location.origin + '/?redirect=' + encodeURIComponent(getRedirectUrl())
                }
            });
            if (error) throw error;
            Notifications.show('注册成功！请查收验证邮件', 'success');
            setTimeout(() => {
                elements.inputEmail.value = currentEmail;
                switchStep('email');
            }, 3000);
        } catch (err) {
            if (err !== 'Captcha closed') Notifications.show(err.message, 'error');
        }
    });

    // 8. 忘记密码
    document.getElementById('btn-forgot-pwd').addEventListener('click', async () => {
        if (!currentEmail) return Notifications.show('邮箱丢失，请返回上一步', 'error');
        try {
            const token = await executeCaptcha();
            const { error } = await client.auth.resetPasswordForEmail(currentEmail, {
                captchaToken: token,
                redirectTo: window.location.origin + '/reset-password'
            });
            if (error) throw error;
            Notifications.show('重置密码邮件已发送', 'success');
        } catch (err) {
            if (err !== 'Captcha closed') Notifications.show(err.message, 'error');
        }
    });

    // 9. 第三方登录
    document.querySelectorAll('.social-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const provider = e.currentTarget.getAttribute('data-provider');
            try {
                const token = await executeCaptcha();
                const { error } = await client.auth.signInWithOAuth({
                    provider: provider,
                    options: {
                        captchaToken: token,
                        redirectTo: window.location.origin + '/?redirect=' + encodeURIComponent(getRedirectUrl())
                    }
                });
                if (error) throw error;
            } catch (err) {
                if (err !== 'Captcha closed') Notifications.show(err.message, 'error');
            }
        });
    });

    // 10. 检查 Session
    client.auth.getSession().then(({ data: { session } }) => {
        if (session) window.location.href = getRedirectUrl();
    });
});
