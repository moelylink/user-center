const client = window.supabaseClient;
const HCAPTCHA_SITE_KEY = '8f124646-ac04-496c-85b6-6396e8b8da3c'; 

document.addEventListener('DOMContentLoaded', () => {
    M.Tabs.init(document.querySelectorAll('.tabs'));
    checkAuthStatus();
    bindAuthEvents();
});

async function checkAuthStatus() {
    const { data: { session } } = await client.auth.getSession();
    // 如果已登录且当前在登录页，尝试跳转
    if (session && window.location.pathname.includes('login.html')) {
        handleLoginSuccess();
    }
}

/**
 * 获取跳转目标地址
 * 逻辑：URL中有 redirect 参数则跳转该参数，否则跳转到 / (根目录)
 */
function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    return redirect ? redirect : '/';
}

/**
 * 统一处理登录成功跳转
 */
function handleLoginSuccess() {
    const target = getRedirectTarget();
    window.location.href = target;
}

/**
 * 获取用于 Supabase OAuth/OTP 的完整回调 URL
 * Supabase 的 redirectTo 参数必须是完整的 URL (包含 http/https)
 */
function getFullRedirectUrl() {
    const target = getRedirectTarget();
    // 如果 target 已经是 http 开头的绝对路径，直接返回
    if (target.startsWith('http')) {
        return target;
    }
    // 否则将其拼接为当前域名的完整路径
    return new URL(target, window.location.origin).href;
}

/**
 * 通用 hCaptcha 执行器
 */
function executeCaptcha(onSuccess) {
    if (document.querySelector('.captcha-container')) return;

    const captchaContainer = document.createElement('div');
    captchaContainer.className = 'captcha-container';
    
    const captchaWrapper = document.createElement('div');
    captchaWrapper.className = 'captcha-wrapper';
    
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '<i class="material-icons grey-text" style="cursor:pointer; float:right;">close</i>';
    closeBtn.onclick = () => document.body.removeChild(captchaContainer);
    captchaWrapper.appendChild(closeBtn);

    const hcaptchaDiv = document.createElement('div');
    hcaptchaDiv.className = 'h-captcha';
    captchaWrapper.appendChild(hcaptchaDiv);
    captchaContainer.appendChild(captchaWrapper);
    document.body.appendChild(captchaContainer);

    if (window.hcaptcha) {
        window.hcaptcha.render(hcaptchaDiv, {
            sitekey: HCAPTCHA_SITE_KEY,
            callback: (token) => {
                document.body.removeChild(captchaContainer);
                onSuccess(token);
            },
            'error-callback': () => {
                window.showMessage('验证服务连接失败', 'error');
                document.body.removeChild(captchaContainer);
            }
        });
    } else {
        window.showMessage('hCaptcha 脚本未加载，请刷新页面', 'error');
        document.body.removeChild(captchaContainer);
    }
}

function bindAuthEvents() {
    // 1. 账号密码登录
    const loginBtn = document.getElementById('btn-login');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            
            if (!email || !password) return window.showMessage('请输入邮箱和密码', 'warning');

            executeCaptcha(async (token) => {
                const { data, error } = await client.auth.signInWithPassword({ 
                    email, 
                    password,
                    options: { captchaToken: token }
                });
                if (error) {
                    window.showMessage(error.message, 'error');
                } else {
                    // 登录成功，执行跳转逻辑
                    handleLoginSuccess();
                }
            });
        });
    }

    // 2. 注册账号
    const registerBtn = document.getElementById('btn-register');
    if (registerBtn) {
        registerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const confirmPassword = document.getElementById('reg-password-confirm').value;

            if (!email || !password) return window.showMessage('请填写完整信息', 'warning');
            if (password !== confirmPassword) return window.showMessage('两次密码不一致', 'warning');
            if (password.length < 6) return window.showMessage('密码长度至少6位', 'warning');

            executeCaptcha(async (token) => {
                const { data, error } = await client.auth.signUp({ 
                    email, 
                    password,
                    // 注册后的邮件确认链接也应该带上重定向逻辑
                    options: { 
                        captchaToken: token,
                        emailRedirectTo: getFullRedirectUrl()
                    }
                });
                if (error) window.showMessage(error.message, 'error');
                else window.showMessage('注册成功！请前往邮箱激活账号', 'success');
            });
        });
    }

    // 3. OTP (魔术链接) 登录
    const otpBtn = document.getElementById('btn-otp');
    if (otpBtn) {
        otpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            if(!email) return window.showMessage('请先填写邮箱', 'warning');

            executeCaptcha(async (token) => {
                const { error } = await client.auth.signInWithOtp({ 
                    email,
                    options: { 
                        captchaToken: token,
                        // 设置 OTP 邮件点击后的跳转地址
                        emailRedirectTo: getFullRedirectUrl() 
                    }
                });
                if (error) window.showMessage(error.message, 'error');
                else window.showMessage('验证码已发送至您的邮箱', 'success');
            });
        });
    }

    // 4. 第三方登录
    document.querySelectorAll('.social-login').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const provider = e.currentTarget.dataset.provider;
            
            executeCaptcha(async (token) => {
                const { error } = await client.auth.signInWithOAuth({
                    provider: provider,
                    options: { 
                        // OAuth 回调后跳转的地址
                        redirectTo: getFullRedirectUrl(),
                        captchaToken: token 
                    }
                });
                if (error) window.showMessage(error.message, 'error');
            });
        });
    });

    // 5. 找回密码
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const email = document.getElementById('login-email').value;
            if(!email) return window.showMessage('请先填写邮箱', 'warning');
            
            executeCaptcha(async (token) => {
                const { error } = await client.auth.resetPasswordForEmail(email, {
                    // 重置密码邮件点击后的跳转地址（通常跳回登录页或重置页，这里保持之前的逻辑跳到 reset-password.html）
                    // 如果需要根据参数跳，可以使用 getFullRedirectUrl()，但通常重置密码有固定流程
                    redirectTo: window.location.origin + '/reset-password.html',
                    captchaToken: token
                });
                if (error) window.showMessage(error.message, 'error');
                else window.showMessage('密码重置邮件已发送', 'success');
            });
        });
    }
}
