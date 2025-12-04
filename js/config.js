// config.js

// 1. Supabase 配置
const supabaseUrl = 'https://fefckqwvcvuadiixvhns.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZmNrcXd2Y3Z1YWRpaXh2aG5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYzNDE5OTUsImV4cCI6MjA1MTkxNzk5NX0.-OUllwH7v2K-j4uIx7QQaV654R5Gz5_1jP4BGdkWWfg';
window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// 2. 注入自定义通知样式 (保留你原本的设计)
const notificationStyle = document.createElement('style');
notificationStyle.textContent = `
    .notification { position: fixed; bottom: 16px; right: 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: transform 0.3s cubic-bezier(0.645, 0.045, 0.355, 1); z-index: 10000; width: 300px; height: 48px; backdrop-filter: blur(10px); transform: translateX(calc(100% + 32px)); overflow: hidden; background: white; }
    .notification.show { transform: translateX(0); }
    .notification-wrapper { width: 100%; height: 100%; display: flex; align-items: center; }
    .notification-content { flex: 1; padding: 0 16px; z-index: 2; height: 100%; display: flex; align-items: center; }
    .notification-content p { margin: 0; padding: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; }
    .notification-icon { width: 48px; display: flex; align-items: center; justify-content: center; z-index: 1; height: 100%; }
    .notification-icon .material-icons { font-size: 20px; color: white; }
    
    .notification.error .notification-icon { background: #ff4d4f; }
    .notification.error .notification-content p { color: #cf1322; }
    .notification.success .notification-icon { background: #52c41a; }
    .notification.success .notification-content p { color: #389e0d; }
    .notification.warning .notification-icon { background: #faad14; }
    .notification.warning .notification-content p { color: #d48806; }

    /* 深色模式适配 */
    body.dark-mode .notification { background: #333; border: 1px solid #444; }
    body.dark-mode .notification-content p { color: #eee; }
    body.dark-mode .notification.error .notification-content p { color: #ff7875; }
    body.dark-mode .notification.success .notification-content p { color: #73d13d; }
    body.dark-mode .notification.warning .notification-content p { color: #ffc069; }

    /* 验证码容器样式 */
    .captcha-container { display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); z-index: 9999; justify-content: center; align-items: center; backdrop-filter: blur(4px); }
    .captcha-wrapper { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
    body.dark-mode .captcha-wrapper { background: #1e1e1e; }
`;
document.head.appendChild(notificationStyle);

const notifications = new Set();

// 全局通知函数
window.showMessage = (message, type = 'info') => {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'warning';
    
    notification.innerHTML = `
        <div class="notification-wrapper">
            <div class="notification-icon">
                <span class="material-icons">${icon}</span>
            </div>
            <div class="notification-content">
                <p>${message}</p>
            </div>
        </div>
    `;

    document.body.appendChild(notification);
    notifications.add(notification);
    updateNotificationsPosition();
    
    // 动画逻辑
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notifications.delete(notification);
            notification.remove();
            updateNotificationsPosition();
        }, 300);
    }, 3000);
};

function updateNotificationsPosition() {
    const arr = Array.from(notifications);
    for (let i = arr.length - 1; i >= 0; i--) {
        const offset = 16 + (arr.length - 1 - i) * 60;
        arr[i].style.bottom = `${offset}px`;
    }
}

// 3. 深色模式管理
const ThemeManager = {
    init() {
        const savedTheme = localStorage.getItem('app-theme');
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        this.updateIcon();
    },
    toggle() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('app-theme', isDark ? 'dark' : 'light');
        this.updateIcon();
    },
    updateIcon() {
        const isDark = document.body.classList.contains('dark-mode');
        document.querySelectorAll('.theme-icon-text').forEach(icon => {
            icon.textContent = isDark ? 'light_mode' : 'dark_mode';
        });
    }
};

document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
window.toggleTheme = () => ThemeManager.toggle();
