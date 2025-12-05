// 初始化 Supabase
const supabaseUrl = 'https://fefckqwvcvuadiixvhns.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZmNrcXd2Y3Z1YWRpaXh2aG5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYzNDE5OTUsImV4cCI6MjA1MTkxNzk5NX0.-OUllwH7v2K-j4uIx7QQaV654R5Gz5_1jP4BGdkWWfg';
const client = supabase.createClient(supabaseUrl, supabaseKey);

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
        const icon = toggleBtn.querySelector('.material-icons-round');
        
        const savedTheme = localStorage.getItem('theme');
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        const applyTheme = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
            icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
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
