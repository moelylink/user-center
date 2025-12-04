// dashboard-core.js
const client = window.supabaseClient;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 初始化 Materialize 组件
    M.Sidenav.init(document.querySelectorAll('.sidenav'));
    M.Modal.init(document.querySelectorAll('.modal'));
    M.Dropdown.init(document.querySelectorAll('.dropdown-trigger'), { coverTrigger: false });

    // 2. 检查登录状态
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
        window.location.href = 'login.html'; // 假设登录页名为 login.html
        return;
    }
    currentUser = session.user;
    updateSidebarInfo(currentUser);

    // 3. 绑定退出登录
    document.getElementById('btn-logout').addEventListener('click', async () => {
        await client.auth.signOut();
        window.location.href = 'login.html';
    });

    // 4. 处理视图路由 (Settings vs Favorites)
    handleRouting();
});

function updateSidebarInfo(user) {
    document.getElementById('nav-email').textContent = user.email;
    document.getElementById('nav-created').textContent = 
        '注册于: ' + new Date(user.created_at).toLocaleDateString();
    // 使用 ui-avatars 生成基于邮箱首字母的头像
    const initial = user.email.charAt(0).toUpperCase();
    document.getElementById('user-avatar').src = `https://ui-avatars.com/api/?name=${initial}&background=random&color=fff`;
}

function handleRouting() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const page = params.get('page');

    // 获取 DOM 元素
    const settingsView = document.getElementById('view-settings');
    const galleryView = document.getElementById('view-gallery');
    const settingsLink = document.getElementById('link-settings').parentElement;
    const galleryLink = document.getElementById('link-favorites').parentElement;
    const pageTitle = document.getElementById('page-title');

    // 逻辑：如果 URL 中包含 page 参数 或者 view=favorites，则显示收藏页
    // 否则显示设置页
    if (view === 'favorites' || page) {
        // --- 切换到 收藏模式 ---
        settingsView.classList.remove('active');
        galleryView.classList.add('active');
        
        settingsLink.classList.remove('active');
        galleryLink.classList.add('active');
        
        pageTitle.textContent = '我的收藏';
        
        // 调用 gallery.js 中的加载函数 (如果存在)
        if (window.initGallery) {
            window.initGallery();
        }
    } else {
        // --- 切换到 设置模式 (默认) ---
        galleryView.classList.remove('active');
        settingsView.classList.add('active');
        
        galleryLink.classList.remove('active');
        settingsLink.classList.add('active');
        
        pageTitle.textContent = '账号设置';
        
        // 调用 settings.js 中的加载函数
        if (window.initSettings) {
            window.initSettings();
        }
    }
}
