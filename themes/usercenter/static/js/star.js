document.addEventListener('DOMContentLoaded', async () => {
    // ----------------------------------------------------------------
    // 1. 初始化
    // ----------------------------------------------------------------
    if (typeof client === 'undefined') {
        console.error('Supabase client not initialized.');
        return;
    }

    let session = null;
    try {
        const { data } = await client.auth.getSession();
        session = data?.session;
    } catch (e) {
        console.warn(e);
    }
    if (!session) {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            session = {
                user: {
                    id: 'mock-user-id-12345',
                    email: 'test@example.com'
                }
            };
        } else {
            window.location.href = '/login/?redirect=/star/';
            return;
        }
    }
    const userId = session.user.id;

    // ----------------------------------------------------------------
    // 2. 逻辑变量
    // ----------------------------------------------------------------
    const itemsPerPage = 20;
    let masonryInstance = null;
    let itemToDelete = null;

    const params = new URLSearchParams(window.location.search);
    let currentPage = parseInt(params.get('page')) || 1;
    let currentSort = params.get('sort') === '2' ? 'asc' : 'desc';

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) sortSelect.value = params.get('sort') || '1';

    // ----------------------------------------------------------------
    // 3. 加载数据
    // ----------------------------------------------------------------
    async function loadImages() {
        const grid = document.getElementById('star-grid');
        const loading = document.getElementById('loading-state');
        const empty = document.getElementById('empty-state');
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        const pageInfo = document.getElementById('current-page');

        if (pageInfo) pageInfo.textContent = currentPage;
        if (loading) loading.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');
        if (pagination) pagination.classList.add('hidden');
        
        if (masonryInstance) {
            masonryInstance.destroy();
            masonryInstance = null;
        }
        if (grid) grid.innerHTML = '';

        try {
            const from = (currentPage - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            let bookmarks = [];
            let totalCount = 0;
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                bookmarks = [
                    { id: '1', url: 'https://example.com', image: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=500', created_at: new Date().toISOString() },
                    { id: '2', url: 'https://example.com', image: 'https://images.unsplash.com/photo-1579783928621-7a13d66a62d1?w=500', created_at: new Date().toISOString() },
                    { id: '3', url: 'https://example.com', image: 'https://images.unsplash.com/photo-1580136579312-94651dfd596d?w=500', created_at: new Date().toISOString() }
                ];
                totalCount = bookmarks.length;
            } else {
                const [dataRes, countRes] = await Promise.all([
                    client
                        .from('bookmarks')
                        .select('id, url, image, created_at')
                        .eq('user_id', userId)
                        .order('created_at', { ascending: currentSort === 'asc' })
                        .range(from, to),
                    
                    client
                        .from('bookmarks')
                        .select('id', { count: 'exact', head: true })
                        .eq('user_id', userId)
                ]);

                if (dataRes.error) throw dataRes.error;
                
                bookmarks = dataRes.data;
                totalCount = countRes.count || 0;
            }
            const totalPages = Math.ceil(totalCount / itemsPerPage);

            const totalCountEl = document.getElementById('total-count');
            if (totalCountEl) totalCountEl.textContent = `共 ${totalCount} 张`;

            if (loading) loading.classList.add('hidden');

            if (bookmarks.length === 0) {
                if (empty) empty.classList.remove('hidden');
                return;
            }

            // --- 渲染卡片 ---
            const fragment = document.createDocumentFragment();
            bookmarks.forEach(item => {
                const date = new Date(item.created_at).toLocaleDateString();
                const div = document.createElement('div');
                div.className = 'grid-item';
                div.setAttribute('data-id', item.id);
                
                const cleanPath = item.url.startsWith('/') ? item.url.substring(1) : item.url;
                const targetUrl = `https://www.moely.link/${cleanPath}`;
                
                // >>>>> 修复 1：将 .item-overlay 放入 <a> 标签内部 <<<<<
                // 这样无论点击遮罩层还是图片，实际上点击的都是 <a> 标签
                div.innerHTML = `
                    <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="img-link">
                        <img src="${item.image}" alt="收藏图片" loading="lazy">
                        <div class="item-overlay">
                            <div class="item-info">
                                <span class="item-date">
                                    <span class="material-icons-round" style="font-size:14px">schedule</span>
                                    ${date}
                                </span>
                            </div>
                        </div>
                    </a>
                    <button class="delete-btn" title="删除" onclick="window.openDeleteModal('${item.id}')">
                        <span class="material-icons-round">delete</span>
                    </button>
                `;
                fragment.appendChild(div);
            });
            grid.appendChild(fragment);

            // 初始化瀑布流
            if (typeof imagesLoaded !== 'undefined' && typeof Masonry !== 'undefined') {
                imagesLoaded(grid, function() {
                    masonryInstance = new Masonry(grid, {
                        itemSelector: '.grid-item',
                        percentPosition: true,
                        gutter: 16,
                        transitionDuration: '0.3s'
                    });
                    masonryInstance.layout();
                });
            }

            // 分页按钮
            if (totalPages > 1 && pagination) {
                pagination.classList.remove('hidden');
                if (prevBtn) {
                    prevBtn.disabled = currentPage <= 1;
                    prevBtn.onclick = () => updateUrl('page', currentPage - 1);
                }
                if (nextBtn) {
                    nextBtn.disabled = currentPage >= totalPages;
                    nextBtn.onclick = () => updateUrl('page', currentPage + 1);
                }
            }

        } catch (err) {
            console.error(err);
            if (loading) loading.classList.add('hidden');
            Notifications.show('加载失败: ' + err.message, 'error');
        }
    }

    function updateUrl(key, value) {
        const url = new URL(window.location);
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
        if (key === 'sort') url.searchParams.set('page', 1);
        window.location.href = url.toString();
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const val = e.target.value === '1' ? null : '2';
            updateUrl('sort', val);
        });
    }

    // ----------------------------------------------------------------
    // 4. 删除逻辑
    // ----------------------------------------------------------------
    const modal = document.getElementById('delete-modal');
    const cancelBtn = document.getElementById('cancel-delete');
    const confirmBtn = document.getElementById('confirm-delete');

    window.openDeleteModal = (id) => {
        itemToDelete = id;
        if (modal) modal.classList.add('active');
    };

    const closeModal = () => {
        if (modal) modal.classList.remove('active');
        itemToDelete = null;
    };

    // 绑定事件
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!itemToDelete) return;

            try {
                const { error } = await client
                    .from('bookmarks')
                    .delete()
                    .eq('id', itemToDelete);

                if (error) throw error;

                const itemEl = document.querySelector(`.grid-item[data-id="${itemToDelete}"]`);
                if (itemEl && masonryInstance) {
                    masonryInstance.remove(itemEl);
                    masonryInstance.layout();
                }

                Notifications.show('删除成功', 'success');
                closeModal();
                
                // 刷新计数
                const totalCountEl = document.getElementById('total-count');
                if (totalCountEl) {
                    const txt = totalCountEl.textContent;
                    const num = parseInt(txt.match(/\d+/)) - 1;
                    totalCountEl.textContent = `共 ${num} 张`;
                }

            } catch (err) {
                Notifications.show('删除失败: ' + err.message, 'error');
                closeModal();
            }
        });
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    loadImages();
});
