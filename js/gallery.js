// gallery.js
// 暴露给 dashboard-core.js 调用
window.initGallery = async function() {
    const params = new URLSearchParams(window.location.search);
    const currentPage = parseInt(params.get('page')) || 1;
    const sortType = params.get('sort') || '1'; // 默认 1 (新到旧)
    const isAscending = sortType === '2'; // 2 (旧到新)

    // 更新排序按钮链接
    document.getElementById('sort-new').href = `?view=favorites&page=1&sort=1`;
    document.getElementById('sort-old').href = `?view=favorites&page=1&sort=2`;

    await loadFavorites(currentPage, isAscending);
    setupPagination(currentPage, sortType);
};

const ITEMS_PER_PAGE = 20;

async function loadFavorites(page, isAscending) {
    const client = window.supabaseClient;
    const container = document.getElementById('gallery-container');
    
    // 显示 Loading
    container.innerHTML = `
        <div class="center-align" style="width:100%; padding:50px;">
            <div class="preloader-wrapper active">
                <div class="spinner-layer spinner-blue-only">
                    <div class="circle-clipper left"><div class="circle"></div></div>
                    <div class="gap-patch"><div class="circle"></div></div>
                    <div class="circle-clipper right"><div class="circle"></div></div>
                </div>
            </div>
        </div>`;

    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const { data: favorites, error } = await client
        .from('favorites')
        .select('*')
        .order('created_at', { ascending: isAscending })
        .range(from, to);

    container.innerHTML = ''; // 清除 Loading

    if (error) {
        window.toast('加载失败: ' + error.message, 'error');
        return;
    }

    if (favorites.length === 0) {
        container.innerHTML = '<p class="center-align grey-text" style="width:100%">暂无收藏内容</p>';
        return;
    }

    favorites.forEach(item => {
        const div = document.createElement('div');
        div.className = 'gallery-item card hoverable';
        // 假设 item 有 image_url 和 title 字段
        div.innerHTML = `
            <div class="card-image">
                <img src="${item.image_url}" loading="lazy" style="width:100%; display:block;">
            </div>
            <div class="card-content">
                <p class="truncate black-text">${item.title || '无标题'}</p>
                <small class="grey-text">${new Date(item.created_at).toLocaleDateString()}</small>
            </div>
        `;
        container.appendChild(div);
    });
}

function setupPagination(currentPage, currentSort) {
    const prevBtn = document.getElementById('page-prev');
    const nextBtn = document.getElementById('page-next');
    const currentDisplay = document.getElementById('page-current');
    
    const sortParam = `&sort=${currentSort}`;
    const viewParam = `?view=favorites`;

    currentDisplay.textContent = currentPage;

    // 上一页
    if (currentPage > 1) {
        prevBtn.classList.remove('disabled');
        prevBtn.querySelector('a').href = `${viewParam}&page=${currentPage - 1}${sortParam}`;
    } else {
        prevBtn.classList.add('disabled');
        prevBtn.querySelector('a').href = "#!";
    }

    // 下一页 (简化逻辑：总是允许下一页，直到 Supabase 返回空数组，实际生产环境应先 count)
    nextBtn.classList.remove('disabled');
    nextBtn.querySelector('a').href = `${viewParam}&page=${currentPage + 1}${sortParam}`;
}
