// ----------------------------------------------------------------
// Supabase 配置与初始化
// ----------------------------------------------------------------
const supabaseUrl = 'https://fefckqwvcvuadiixvhns.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZmNrcXd2Y3Z1YWRpaXh2aG5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYzNDE5OTUsImV4cCI6MjA1MTkxNzk5NX0.-OUllwH7v2K-j4uIx7QQaV654R5Gz5_1jP4BGdkWWfg';

/**
 * 自定义存储适配器：将 Session 存入 Cookie 并设置根域名 (.moely.link)
 * 这样所有子域名 (user.moely.link, www.moely.link, anime.moely.link) 均可共享登录状态
 */
const rootDomainStorage = {
    getItem: (key) => {
        const name = key + "=";
        const decodedCookie = decodeURIComponent(document.cookie);
        const ca = decodedCookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) === 0) {
                return c.substring(name.length, c.length);
            }
        }
        return null;
    },
    setItem: (key, value) => {
        // 设置 Cookie 有效期 (例如 100 年，保持登录状态)
        const d = new Date();
        d.setTime(d.getTime() + (365*24*60*60*1000));
        const expires = "expires="+ d.toUTCString();
        // 关键：设置 domain 为 .moely.link (注意前面的点)
        // 这样所有子域名都能访问这个 Cookie
        // 同时也设置 path=/ 确保全站有效
        document.cookie = `${key}=${value};${expires};domain=.moely.link;path=/;SameSite=Lax;Secure`;
    },
    removeItem: (key) => {
        // 删除 Cookie (设置过期时间为过去)
        document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;domain=.moely.link;path=/;`;
    }
};

// 初始化 Client，传入自定义 auth.storage
const client = supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        storage: rootDomainStorage, // 使用我们定义的 Cookie 存储
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

// ----------------------------------------------------------------
// 通知系统
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
// 布局与主题 (Layout & Theme)
// ----------------------------------------------------------------
const AppLayout = {
    init() {
        this.initTheme();
        this.initSidebar();
    },

    initTheme() {
        const toggleBtn = document.getElementById('theme-toggle');
        // 某些页面可能没有 theme toggle 按钮，做个判断
        if (!toggleBtn) return;

        const icon = toggleBtn.querySelector('.material-icons-round');
        
        const savedTheme = localStorage.getItem('theme');
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        const applyTheme = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
            if(icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
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

        if(!menuBtn) return;

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

document.addEventListener('DOMContentLoaded', () => {
    AppLayout.init();
});
