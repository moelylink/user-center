// ----------------------------------------------------------------
// Supabase 配置与初始化
// ----------------------------------------------------------------
const supabaseUrl = 'https://fefckqwvcvuadiixvhns.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZmNrcXd2Y3Z1YWRpaXh2aG5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYzNDE5OTUsImV4cCI6MjA1MTkxNzk5NX0.-OUllwH7v2K-j4uIx7QQaV654R5Gz5_1jP4BGdkWWfg';

const rootDomainStorage = {
    getItem: (key) => {
        const name = key + "=";
        const decodedCookie = decodeURIComponent(document.cookie);
        const ca = decodedCookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1);
            if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
        }
        return null;
    },
    setItem: (key, value) => {
        let cleanValue = value;
        try {
            if (value && (value.includes('provider_token') || value.includes('user_metadata'))) {
                const parsed = JSON.parse(value);
                // 1. 彻底剔除大体积的第三方 token
                if (parsed.provider_token) delete parsed.provider_token;
                if (parsed.provider_refresh_token) delete parsed.provider_refresh_token;

                // 2. 彻底瘦身 user 对象里的 user_metadata 和 identities (这些是主要大体积块)
                if (parsed.user) {
                    if (parsed.user.user_metadata) delete parsed.user.user_metadata;

                    // 仅保留 identities 中的 provider 字段以供设置页面高亮绑定状态，剔除超大体积的 identity_data
                    if (parsed.user.identities) {
                        parsed.user.identities = parsed.user.identities.map(id => ({
                            provider: id.provider
                        }));
                    }
                }
                cleanValue = JSON.stringify(parsed);
            }
        } catch (e) {
            console.error("Clean storage token failed:", e);
        }

        const d = new Date();
        d.setTime(d.getTime() + (365 * 24 * 60 * 60 * 1000));
        const expires = "expires=" + d.toUTCString();
        document.cookie = `${key}=${cleanValue};${expires};domain=.moely.link;path=/;SameSite=Lax;Secure`;
    },
    removeItem: (key) => {
        document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;domain=.moely.link;path=/;`;
    }
};

const client = supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        storage: rootDomainStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

// ----------------------------------------------------------------
// 全局未读消息管理器 (新增模块)
// ----------------------------------------------------------------
const UnreadBadge = {
    userId: null,

    async init() {
        // 获取当前用户
        const { data: { session } } = await client.auth.getSession();
        if (!session) return;
        this.userId = session.user.id;

        // 初次检查
        this.check();

        // 开启全局实时监听
        this.subscribe();
    },

    async check() {
        if (!this.userId) return;

        try {
            // 1. 查询系统通知未读数
            const { count: sysCount } = await client
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', this.userId)
                .eq('is_read', false);

            // 2. 查询私信未读数
            const { count: msgCount } = await client
                .from('private_messages')
                .select('id', { count: 'exact', head: true })
                .eq('receiver_id', this.userId)
                .eq('is_read', false);

            const total = (sysCount || 0) + (msgCount || 0);
            this.updateUI(total);

        } catch (err) {
            console.error('Check unread failed:', err);
        }
    },

    updateUI(count) {
        const dot = document.getElementById('sidebar-unread-dot');
        if (!dot) return;

        if (count > 0) {
            dot.classList.add('show');
        } else {
            dot.classList.remove('show');
        }
    },

    subscribe() {
        if (!this.userId) return;

        // 监听所有针对我的新插入消息
        const channel = client.channel('global_badge_listener')
            // 监听新私信
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'private_messages',
                filter: `receiver_id=eq.${this.userId}`
            }, () => {
                this.updateUI(1); // 只要有新的，肯定显示红点，不用重新查库
                Notifications.show('收到新私信', 'info');
            })
            // 监听新系统通知
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${this.userId}`
            }, () => {
                this.updateUI(1);
                Notifications.show('收到系统通知', 'info');
            })
            // 监听消息状态变为“已读” (UPDATE) -> 重新计算总数
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'private_messages',
                filter: `receiver_id=eq.${this.userId}`
            }, () => this.check())
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${this.userId}`
            }, () => this.check())
            .subscribe();
    }
};

// ----------------------------------------------------------------
// 通知系统 (Toast)
// ----------------------------------------------------------------
const Notifications = {
    list: new Set(),

    show(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        const icon = type === 'success' ? 'check_circle' :
            type === 'error' ? 'error' : 'warning';

        notification.innerHTML = `
            <div class="notification-wrapper">
                <div class="notification-icon">
                    <span class="material-icons-round">${icon}</span>
                </div>
                <div class="notification-content"><p>${message}</p></div>
            </div>
        `;

        document.body.appendChild(notification);
        this.list.add(notification);
        this.updatePosition();

        requestAnimationFrame(() => notification.classList.add('show'));

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                this.list.delete(notification);
                notification.remove();
                this.updatePosition();
            }, 300);
        }, 3000);
    },

    updatePosition() {
        const arr = Array.from(this.list);
        for (let i = arr.length - 1; i >= 0; i--) {
            const item = arr[i];
            const offset = 16 + (arr.length - 1 - i) * 70;
            item.style.bottom = `${offset}px`;
        }
    }
};

// ----------------------------------------------------------------
// 布局与主题
// ----------------------------------------------------------------
const AppLayout = {
    init() {
        // 清理旧 localStorage
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                localStorage.removeItem(key);
            }
        });

        this.initTheme();
        this.initSidebar();

        // >>> 启动全局未读检测 <<<
        UnreadBadge.init();
    },

    initTheme() {
        const toggleBtn = document.getElementById('theme-toggle');
        if (!toggleBtn) return;
        const icon = toggleBtn.querySelector('.material-icons-round');

        const savedTheme = localStorage.getItem('theme');
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        const applyTheme = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
            if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
        };

        if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
            applyTheme('dark');
        }

        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            localStorage.setItem('theme', next);
        });
    },

    initSidebar() {
        const menuBtn = document.getElementById('menu-btn');
        const closeBtn = document.getElementById('close-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const sidebar = document.getElementById('sidebar');

        if (!menuBtn) return;

        const toggleMenu = (show) => {
            if (show) {
                sidebar.classList.add('active');
                overlay.classList.add('active');
            } else {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            }
        };

        menuBtn.addEventListener('click', () => toggleMenu(true));
        closeBtn.addEventListener('click', () => toggleMenu(false));
        overlay.addEventListener('click', () => toggleMenu(false));
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    AppLayout.init();

    // 自动检测是否存在深度链接重定向与登录态，若有则自动唤起 App
    try {
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        if (redirect && redirect.startsWith('moely://')) {
            const { data: { session } } = await client.auth.getSession();
            if (session) {
                // 关键安全校验：向 Supabase 校验当前会话是否在服务端真实存在
                // 解决客户端手动登出（已通知 Supabase 销毁 session_id）但浏览器端 Cookie 残留导致“无限死循环重定向”的严重 Bug
                const { data: { user }, error: userError } = await client.auth.getUser();

                if (userError || !user) {
                    console.warn("Detected stale browser session, clearing cookies and local storage:", userError);
                    // 清理失效的本地登录态与 Cookie
                    await client.auth.signOut({ scope: 'local' });
                    // 如果当前在登录页面，刷新以重置界面并允许用户进行全新的登录
                    if (window.location.pathname.includes('/login/')) {
                        window.location.reload();
                    }
                    return;
                }

                let targetUrl = redirect;
                // 如果 hash 里没有 token，则手动拼接当前 session 中的 token
                if (!window.location.hash.includes('access_token') && !targetUrl.includes('access_token')) {
                    targetUrl = targetUrl + `#access_token=${session.access_token}&refresh_token=${session.refresh_token}`;
                } else if (window.location.hash) {
                    targetUrl = targetUrl + window.location.hash;
                }
                if (typeof window.redirectToApp === 'function') {
                    window.redirectToApp(targetUrl);
                } else {
                    window.location.href = targetUrl;
                }
            }
        }
    } catch (e) {
        console.error("Auto app redirect check failed:", e);
    }
});

// 将 UnreadBadge 暴露给全局，以便 message.js 在阅读后手动调用刷新
window.UnreadBadge = UnreadBadge;

// ----------------------------------------------------------------
// 人机验证 (Cloudflare Turnstile) - 全局共用
// ----------------------------------------------------------------
// 请在此处替换为您的 Cloudflare Turnstile Site Key
window.SITE_KEY = '0x4AAAAAADMDPBploX286xsn';

window.executeCaptcha = function () {
    return new Promise((resolve, reject) => {
        // 动态注入加载器样式
        if (!document.getElementById('captcha-loader-style')) {
            const style = document.createElement('style');
            style.id = 'captcha-loader-style';
            style.innerHTML = `
                .captcha-box-loading {
                    position: relative;
                    min-width: 320px;
                    min-height: 90px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .captcha-loader {
                    position: absolute;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 10px;
                    color: var(--text-secondary);
                    font-size: 13px;
                    pointer-events: none;
                }
                .captcha-loader .spinner {
                    width: 24px;
                    height: 24px;
                    border: 3px solid var(--border-color);
                    border-top-color: var(--primary-color);
                    border-radius: 50%;
                    animation: captcha-spin 0.8s linear infinite;
                }
                @keyframes captcha-spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        const overlay = document.createElement('div');
        overlay.className = 'captcha-overlay';
        const box = document.createElement('div');
        box.className = 'captcha-box captcha-box-loading';

        const loader = document.createElement('div');
        loader.className = 'captcha-loader';
        loader.innerHTML = `
            <div class="spinner"></div>
            <span>正在加载验证组件...</span>
        `;
        box.appendChild(loader);

        const captchaDiv = document.createElement('div');
        const uniqueId = 'turnstile-' + Date.now();
        captchaDiv.id = uniqueId;
        captchaDiv.style.position = 'relative';
        captchaDiv.style.zIndex = '2';
        box.appendChild(captchaDiv);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));

        // 点击遮罩层可以关闭验证
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 300);
                reject('Captcha closed');
            }
        });

        if (!window.turnstile) {
            Notifications.show('验证组件加载失败', 'error');
            overlay.remove(); reject('Captcha fail'); return;
        }

        try {
            window.turnstile.render(captchaDiv, {
                sitekey: window.SITE_KEY,
                'before-interactive-callback': () => {
                    loader.style.display = 'none';
                },
                callback: (token) => {
                    overlay.classList.remove('active');
                    setTimeout(() => overlay.remove(), 300);
                    resolve(token);
                },
                'error-callback': () => {
                    Notifications.show('验证失败', 'error');
                    overlay.classList.remove('active');
                    setTimeout(() => overlay.remove(), 300);
                    reject('Captcha error');
                },
                'expired-callback': () => {
                    Notifications.show('验证已过期，请重试', 'warning');
                    overlay.classList.remove('active');
                    setTimeout(() => overlay.remove(), 300);
                    reject('Captcha expired');
                }
            });
        } catch (e) {
            overlay.remove(); reject(e);
        }
    });
};

// ----------------------------------------------------------------
// 唤起 App 的通用拦截弹窗组件
// ----------------------------------------------------------------
window.redirectToApp = function(deepLinkUrl) {
    if (document.getElementById('redirect-overlay-modal')) return;
    // 1. 动态注入高级毛玻璃背景与卡片样式 (免去单独修改 CSS 的麻烦)
    if (!document.getElementById('redirect-modal-style')) {
        const style = document.createElement('style');
        style.id = 'redirect-modal-style';
        style.innerHTML = `
            .redirect-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.45);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            .redirect-overlay.active {
                opacity: 1;
            }
            .redirect-card {
                background: var(--card-bg, #ffffff);
                color: var(--text-primary, #1e293b);
                padding: 32px 28px;
                border-radius: 24px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05);
                text-align: center;
                max-width: 90%;
                width: 380px;
                transform: scale(0.9);
                transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                border: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
            }
            .redirect-overlay.active .redirect-card {
                transform: scale(1);
            }
            .redirect-title {
                font-size: 18px;
                font-weight: 700;
                margin-bottom: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
            }
            .redirect-spinner {
                width: 20px;
                height: 20px;
                border: 3px solid var(--border-color, rgba(0,0,0,0.1));
                border-top-color: var(--primary-color, #e11d48);
                border-radius: 50%;
                animation: redirect-spin 0.8s linear infinite;
            }
            .redirect-subtitle {
                font-size: 14px;
                color: var(--text-secondary, #64748b);
                line-height: 1.6;
            }
            .redirect-link {
                color: var(--primary-color, #e11d48);
                text-decoration: none;
                font-weight: 600;
                border-bottom: 2px solid transparent;
                transition: border-color 0.2s ease;
                padding: 2px 4px;
            }
            .redirect-link:hover {
                border-color: var(--primary-color, #e11d48);
            }
            @keyframes redirect-spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    // 2. 动态创建 DOM 结构
    const overlay = document.createElement('div');
    overlay.id = 'redirect-overlay-modal';
    overlay.className = 'redirect-overlay';
    
    const card = document.createElement('div');
    card.className = 'redirect-card';
    
    card.innerHTML = `
        <div class="redirect-title">
            <div class="redirect-spinner"></div>
            <span>正在唤起 App...</span>
        </div>
        <div class="redirect-subtitle">
            如果您的 App 没有被自动唤起，请点击 <a href="${deepLinkUrl}" class="redirect-link" id="manual-redirect-btn">此处</a> 手动跳转。
        </div>
    `;
    
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    
    // 触发淡入动画
    requestAnimationFrame(() => overlay.classList.add('active'));
    
    // 3. 点击弹窗遮罩外部可以关闭弹窗
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        }
    });

    // 4. 执行自动重定向唤起 App
    window.location.href = deepLinkUrl;
};
