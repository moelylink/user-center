document.addEventListener('DOMContentLoaded', async () => {
    // 依赖 common.js
    if (typeof client === 'undefined') return;

    // ============================================================
    // 0. 核心修复：极速拦截 Recovery 状态
    // ============================================================
    // 必须在 Supabase 客户端初始化和清除 Hash 之前捕获它
    // 一旦捕获到，将此状态“锁死”在变量中，后续无论 Hash 是否消失，都以此为准
    const hash = window.location.hash;
    const isRecoveryFlow = hash && hash.includes('type=recovery');

    if (isRecoveryFlow) {
        console.log("🔒 检测到重置密码流程，已锁定跳转逻辑。");
    }

    // 状态变量
    let currentEmail = '';

    // DOM 元素引用
    const steps = {
        email: document.getElementById('step-email'),
        password: document.getElementById('step-password'),
        otp: document.getElementById('step-otp'),
        register: document.getElementById('step-register'),
        forgot: document.getElementById('step-forgot'), // 请求邮件页
        update: document.getElementById('step-update-password'), // 设置新密码页
        registerSuccess: document.getElementById('step-register-success') // 注册成功激活提示页
    };

    const elements = {
        inputEmail: document.getElementById('input-email'),
        regEmail: document.getElementById('reg-email'),
        forgotEmail: document.getElementById('forgot-email'),
        displayEmail: document.getElementById('display-email'),
        displayOtpEmail: document.getElementById('display-otp-email'),
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
            if (redirect.startsWith('moely://')) return redirect;
            if (redirect.includes('moely.link')) return "https://user.moely.link/callback/?redirect=" + redirect;
            if (redirect.startsWith('/')) return "https://user.moely.link" + redirect;
        }
        return 'https://user.moely.link/';
    }

    // 设置按钮加载中状态（转圈动画）
    function setButtonLoading(button, isLoading) {
        if (!button) return;
        if (isLoading) {
            button.classList.add('btn-loading');
            button.disabled = true;
        } else {
            button.classList.remove('btn-loading');
            button.disabled = false;
        }
    }

    // 切换步骤 UI
    function switchStep(stepName) {
        Object.values(steps).forEach(el => { if (el) el.classList.remove('active'); });
        if (steps[stepName]) steps[stepName].classList.add('active');

        // 步骤切换时重置主要按钮的加载状态，避免跨步骤状态残留
        const btnLogin = document.getElementById('btn-login');
        const btnRegister = document.getElementById('btn-register');
        const btnVerifyOtp = document.getElementById('btn-verify-otp');
        const btnOtpLogin = document.getElementById('btn-otp-login');
        const btnSendReset = document.getElementById('btn-send-reset-link');
        const btnSaveNewPwd = document.getElementById('btn-save-new-password');
        if (btnLogin) setButtonLoading(btnLogin, false);
        if (btnRegister) setButtonLoading(btnRegister, false);
        if (btnVerifyOtp) setButtonLoading(btnVerifyOtp, false);
        if (btnOtpLogin) setButtonLoading(btnOtpLogin, false);
        if (btnSendReset) setButtonLoading(btnSendReset, false);
        if (btnSaveNewPwd) setButtonLoading(btnSaveNewPwd, false);

        // 动态更新标题
        if (stepName === 'email') {
            elements.title.textContent = '登录';
            elements.subtitle.textContent = '使用您的 萌哩 账号';
        } else if (stepName === 'password') {
            elements.title.textContent = '欢迎回来';
            elements.subtitle.textContent = '请输入密码以继续';
            if (elements.displayEmail) elements.displayEmail.textContent = currentEmail;
        } else if (stepName === 'otp') {
            elements.title.textContent = '输入验证码';
            elements.subtitle.textContent = '验证码已发送，请输入以继续';
            if (elements.displayOtpEmail) elements.displayOtpEmail.textContent = currentEmail;
            // 自动聚焦第一个 OTP 输入框
            setTimeout(() => {
                const firstInput = document.querySelector('.otp-input[data-index="0"]');
                if (firstInput) firstInput.focus();
            }, 100);
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
        } else if (stepName === 'forgot') {
            elements.title.textContent = '重置密码';
            elements.subtitle.textContent = '通过邮箱找回账号';
        } else if (stepName === 'update') {
            elements.title.textContent = '重置密码';
            elements.subtitle.textContent = '请输入新的安全密码';
        } else if (stepName === 'registerSuccess') {
            elements.title.textContent = '验证您的邮箱';
            elements.subtitle.textContent = '已发送激活邮件';
        }
    }


    // ============================================================
    // 监听 Auth 状态
    // ============================================================
    client.auth.onAuthStateChange(async (event, session) => {
        // 调试日志
        console.log("Auth Event:", event);

        // 情况 1: 明确捕获到 RECOVERY 事件 (最理想情况)
        if (event === 'PASSWORD_RECOVERY') {
            switchStep('update');
            Notifications.show('验证成功，请设置新密码', 'success');
            return;
        }

        // 情况 2: 捕获到 SIGNED_IN 事件 (Supabase 恢复链接或新登录成功)
        if (event === 'SIGNED_IN') {
            // >>> 关键修改：检查我们在页面加载初期捕获的变量 <<<
            if (isRecoveryFlow) {
                console.log("拦截自动跳转，进入重置密码界面");
                switchStep('update');

                // 只有当 session 存在时才显示提示，避免误报
                if (session) {
                    Notifications.show('请设置您的新密码', 'info');
                }
            } else {
                // 只有在【非】重置模式下，才执行自动跳转
                setTimeout(() => {
                    let targetUrl = getRedirectUrl();
                    if (targetUrl.startsWith('moely://') && session) {
                        targetUrl = targetUrl + `#access_token=${session.access_token}&refresh_token=${session.refresh_token}`;
                    }
                    if (typeof window.redirectToApp === 'function' && targetUrl.startsWith('moely://')) {
                        window.redirectToApp(targetUrl);
                    } else {
                        window.location.href = targetUrl;
                    }
                }, 500);
            }
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


    function isPasskeySupported() {
        return window.isSecureContext &&
            typeof window.PublicKeyCredential !== 'undefined' &&
            navigator.credentials &&
            typeof navigator.credentials.get === 'function' &&
            typeof client.auth.signInWithPasskey === 'function';
    }

    function isPasskeyCancellation(error) {
        return error && (error.name === 'NotAllowedError' || error.code === 'webauthn_operation_cancelled');
    }

    const passkeyLoginButton = document.getElementById('btn-passkey-login');
    if (passkeyLoginButton) {
        if (!isPasskeySupported()) {
            passkeyLoginButton.disabled = true;
            passkeyLoginButton.title = '当前浏览器不支持通行密钥登录';
        }

        passkeyLoginButton.addEventListener('click', async () => {
            if (!isPasskeySupported()) {
                Notifications.show('当前浏览器不支持通行密钥，请使用密码、验证码或第三方登录。', 'warning');
                return;
            }

            setButtonLoading(passkeyLoginButton, true);
            try {
                const token = await executeCaptcha();
                const { error } = await client.auth.signInWithPasskey({
                    options: { captchaToken: token }
                });
                if (error) throw error;
                Notifications.show('登录成功', 'success');
            } catch (err) {
                setButtonLoading(passkeyLoginButton, false);
                if (err !== 'Captcha closed' && !isPasskeyCancellation(err)) {
                    console.error('Passkey sign-in failed:', err);
                    Notifications.show('通行密钥登录未完成，请使用密码、验证码或第三方登录重试。', 'error');
                }
            }
        });
    }

    // 2. 去注册
    document.getElementById('btn-to-register').addEventListener('click', () => {
        if (elements.inputEmail.value) currentEmail = elements.inputEmail.value;
        switchStep('register');
    });

    // 3. 返回修改邮箱
    document.getElementById('btn-back-email').addEventListener('click', () => switchStep('email'));
    const userChip = document.getElementById('user-chip');
    if (userChip) userChip.addEventListener('click', () => switchStep('email'));

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
    const btnLogin = document.getElementById('btn-login');
    btnLogin.addEventListener('click', async () => {
        const password = document.getElementById('input-password').value;
        if (!password) return Notifications.show('请输入密码', 'warning');

        setButtonLoading(btnLogin, true);
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
            setButtonLoading(btnLogin, false);
            if (err !== 'Captcha closed') Notifications.show(err.message || '登录失败', 'error');
        }
    });

    // 6. OTP 登录
    let resendTimer = null;
    function startResendCountdown() {
        const btnResend = document.getElementById('btn-otp-resend');
        if (!btnResend) return;
        
        let seconds = 60;
        btnResend.disabled = true;
        btnResend.textContent = `重新发送 (${seconds}s)`;
        
        if (resendTimer) clearInterval(resendTimer);
        resendTimer = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                clearInterval(resendTimer);
                btnResend.disabled = false;
                btnResend.textContent = '重新发送';
            } else {
                btnResend.textContent = `重新发送 (${seconds}s)`;
            }
        }, 1000);
    }

    async function sendOtpCode() {
        const btnOtpLogin = document.getElementById('btn-otp-login');
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log("Localhost mock mode: Skipping backend OTP send, showing OTP UI.");
            Notifications.show('[本地模拟] 验证码已发送至您的邮箱 (已自动模拟为 123456)', 'info');
            switchStep('otp');
            startResendCountdown();
            return;
        }

        setButtonLoading(btnOtpLogin, true);
        try {
            const token = await executeCaptcha();
            const { error } = await client.auth.signInWithOtp({
                email: currentEmail,
                options: {
                    captchaToken: token
                }
            });
            if (error) throw error;
            Notifications.show('验证码已发送至您的邮箱', 'success');
            switchStep('otp');
            startResendCountdown();
        } catch (err) {
            if (err !== 'Captcha closed') Notifications.show(err.message || '发送验证码失败', 'error');
        } finally {
            setButtonLoading(btnOtpLogin, false);
        }
    }

    document.getElementById('btn-otp-login').addEventListener('click', sendOtpCode);

    const btnOtpResend = document.getElementById('btn-otp-resend');
    if (btnOtpResend) {
        btnOtpResend.addEventListener('click', sendOtpCode);
    }

    // OTP 输入框联动逻辑
    const otpInputs = document.querySelectorAll('.otp-input');
    otpInputs.forEach((input, index) => {
        // 限制只能输入数字
        input.addEventListener('input', (e) => {
            const val = e.target.value;
            // 如果不是数字，清空
            if (!/^[0-9]$/.test(val)) {
                e.target.value = '';
                return;
            }
            // 聚焦到下一个框
            if (index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            } else {
                // 最后一个输入框，且全部已填满，自动校验
                checkAndSubmitOtp();
            }
        });

        // 监听退格键 (Backspace)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                if (input.value === '') {
                    // 如果当前框为空，聚焦到上一个框并清除内容
                    if (index > 0) {
                        otpInputs[index - 1].focus();
                        otpInputs[index - 1].value = '';
                    }
                } else {
                    // 当前框有值，直接清空（原生行为）
                    input.value = '';
                }
                e.preventDefault();
            }
        });

        // 监听粘贴事件
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const clipboardData = e.clipboardData || window.clipboardData;
            const pastedText = clipboardData.getData('Text').trim();
            
            // 提取前6位数字
            const digits = pastedText.replace(/\D/g, '').slice(0, 6);
            
            // 依次填入框中
            for (let i = 0; i < digits.length && i < otpInputs.length; i++) {
                otpInputs[i].value = digits[i];
            }
            
            // 聚焦到填写的最后一个框或保持聚焦
            const focusIndex = Math.min(digits.length, otpInputs.length - 1);
            if (focusIndex >= 0) {
                otpInputs[focusIndex].focus();
            }
            
            if (digits.length === 6) {
                checkAndSubmitOtp();
            }
        });
    });

    // 检查并自动提交 OTP
    function getOtpCode() {
        let code = '';
        otpInputs.forEach(input => code += input.value);
        return code;
    }

    function checkAndSubmitOtp() {
        const code = getOtpCode();
        if (code.length === 6) {
            submitOtpVerification(code);
        }
    }

    // 校验 OTP 并登录
    async function submitOtpVerification(code) {
        if (!code || code.length !== 6) {
            return Notifications.show('请输入6位验证码', 'warning');
        }
        
        const btnVerify = document.getElementById('btn-verify-otp');
        setButtonLoading(btnVerify, true);
        
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            setTimeout(() => {
                if (code === '123456') {
                    Notifications.show('[本地模拟] 登录成功！正在跳转...', 'success');
                    setTimeout(() => {
                        window.location.href = getRedirectUrl();
                    }, 1000);
                } else {
                    setButtonLoading(btnVerify, false);
                    Notifications.show('[本地模拟] 验证码错误，请输入 123456', 'error');
                    otpInputs.forEach(input => input.value = '');
                    if (otpInputs[0]) otpInputs[0].focus();
                }
            }, 800);
            return;
        }

        try {
            const { error } = await client.auth.verifyOtp({
                email: currentEmail,
                token: code,
                type: 'email'
            });
            if (error) throw error;
            Notifications.show('登录成功', 'success');
        } catch (err) {
            setButtonLoading(btnVerify, false);
            Notifications.show(err.message || '验证码错误或已失效', 'error');
            // 清空输入框并重新聚焦第一格
            otpInputs.forEach(input => input.value = '');
            if (otpInputs[0]) otpInputs[0].focus();
        }
    }

    // 手动点击验证按钮
    document.getElementById('btn-verify-otp').addEventListener('click', () => {
        submitOtpVerification(getOtpCode());
    });

    // 从 OTP 页面返回
    document.getElementById('btn-back-otp').addEventListener('click', () => {
        if (resendTimer) {
            clearInterval(resendTimer);
            resendTimer = null;
        }
        switchStep('password');
    });

    // 7. 第三方登录
    document.querySelectorAll('.social-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const provider = e.currentTarget.getAttribute('data-provider');
            try {
                const token = await executeCaptcha();
                await client.auth.signInWithOAuth({
                    provider: provider,
                    options: { 
                        captchaToken: token, 
                        redirectTo: getRedirectUrl(),
                        scopes: provider === 'azure' ? 'openid profile email' : undefined
                    }
                });
            } catch (err) { if (err !== 'Captcha closed') Notifications.show(err.message, 'error'); }
        });
    });

    // 8. 注册
    const btnRegister = document.getElementById('btn-register');
    btnRegister.addEventListener('click', async () => {
        const email = elements.regEmail.value.trim();
        const pwd = document.getElementById('reg-password').value;
        const pwdR = document.getElementById('reg-password-repeat').value;

        if (!email) return Notifications.show('请输入电子邮箱', 'warning');
        if (!/^\S+@\S+\.\S+$/.test(email)) return Notifications.show('邮箱格式不正确', 'warning');
        if (pwd.length < 8) return Notifications.show('密码长度需大于8位', 'warning');
        if (pwd !== pwdR) return Notifications.show('两次密码输入不一致', 'warning');

        setButtonLoading(btnRegister, true);
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
            currentEmail = email;
            const successEmailEl = document.getElementById('register-success-email');
            if (successEmailEl) successEmailEl.textContent = email;
            switchStep('registerSuccess');
        } catch (err) {
            if (err !== 'Captcha closed') Notifications.show(err.message, 'error');
        } finally {
            setButtonLoading(btnRegister, false);
        }
    });

    // 8.5 已激活，去登录
    const btnSuccessLogin = document.getElementById('btn-success-login');
    if (btnSuccessLogin) {
        btnSuccessLogin.addEventListener('click', () => {
            if (currentEmail) {
                elements.inputEmail.value = currentEmail;
                switchStep('password');
            } else {
                switchStep('email');
            }
        });
    }

    // ============================================================
    // 重置密码逻辑
    // ============================================================

    // A. 点击"忘记密码" -> 进入邮箱输入页
    document.getElementById('btn-forgot-pwd').addEventListener('click', () => {
        if (currentEmail) elements.forgotEmail.value = currentEmail;
        switchStep('forgot');
    });

    // B. 返回登录
    document.getElementById('btn-cancel-forgot').addEventListener('click', () => switchStep('email'));

    // C. 发送重置邮件
    const btnSendReset = document.getElementById('btn-send-reset-link');
    btnSendReset.addEventListener('click', async () => {
        const email = elements.forgotEmail.value.trim();
        if (!email) return Notifications.show('请输入注册邮箱', 'warning');

        setButtonLoading(btnSendReset, true);
        try {
            const token = await executeCaptcha();
            const { error } = await client.auth.resetPasswordForEmail(email, {
                captchaToken: token,
                redirectTo: "https://user.moely.link/login/" // 强制跳回登录页处理
            });
            if (error) throw error;
            Notifications.show('重置邮件已发送，请查收', 'success');
            // 可以选择跳回登录页，或者停留在当前页提示
            setTimeout(() => switchStep('email'), 2000);
        } catch (err) {
            if (err !== 'Captcha closed') Notifications.show(err.message, 'error');
        } finally {
            setButtonLoading(btnSendReset, false);
        }
    });

    // D. 提交新密码 (用户从邮件回来后)
    const btnSaveNewPwd = document.getElementById('btn-save-new-password');
    btnSaveNewPwd.addEventListener('click', async () => {
        const newPwd = elements.newPwd.value;
        const confirmPwd = elements.newPwdConfirm.value;

        if (newPwd.length < 8) return Notifications.show('新密码长度需大于8位', 'warning');
        if (newPwd !== confirmPwd) return Notifications.show('两次密码输入不一致', 'warning');

        setButtonLoading(btnSaveNewPwd, true);
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
            setButtonLoading(btnSaveNewPwd, false);
            Notifications.show('修改失败: ' + err.message, 'error');
        }
    });
});
