document.addEventListener('DOMContentLoaded', async () => {
    // ----------------------------------------------------------------
    // 0. 样式注入 (修复按钮样式 + 弹窗布局)
    // ----------------------------------------------------------------
    const fixedStyles = document.createElement('style');
    fixedStyles.textContent = `
        /* 强制覆盖全屏的遮罩层 */
        .modal-overlay {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.5) !important;
            z-index: 2147483647 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease;
            backdrop-filter: blur(2px);
        }
        .modal-overlay.active { opacity: 1; visibility: visible; }

        /* 弹窗卡片 */
        .modal-card {
            background: #ffffff;
            width: 90%; max-width: 360px;
            padding: 32px 24px 24px;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            text-align: center;
            position: relative;
            transform: scale(0.9);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            margin: auto;
            color: #333;
        }
        [data-theme="dark"] .modal-card { background: #2c2c2c; color: #eee; }
        .modal-overlay.active .modal-card { transform: scale(1); }

        /* 图标与文字 */
        .modal-icon {
            width: 64px; height: 64px; border-radius: 50%;
            margin: 0 auto 20px;
            display: flex; align-items: center; justify-content: center;
        }
        .modal-icon.warning { background: #fff1f0; color: #ff4d4f; }
        [data-theme="dark"] .modal-icon.warning { background: rgba(255, 77, 79, 0.2); }
        .modal-icon .material-icons-round { font-size: 32px; }
        
        .modal-card h3 { margin: 0 0 12px; font-size: 20px; font-weight: 600; }
        .modal-card p { margin: 0 0 24px; font-size: 14px; color: #666; line-height: 1.5; }
        [data-theme="dark"] .modal-card p { color: #aaa; }

        /* 按钮组 */
        .modal-actions { display: flex; gap: 12px; justify-content: center; }
        
        /* 通用按钮样式 */
        .modal-actions button {
            flex: 1;
            padding: 10px 0;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
            outline: none;
        }

        /* >>> 修复 2：强制指定 ID 的样式，确保取消按钮有外观 <<< */
        #cancel-delete {
            background: #f5f5f5;
            color: #666;
        }
        #cancel-delete:hover { background: #e0e0e0; }
        [data-theme="dark"] #cancel-delete { background: #3a3a3a; color: #ccc; }

        #confirm-delete {
            background: #ff4d4f;
            color: white;
            box-shadow: 0 4px 12px rgba(255, 77, 79, 0.3);
        }
        #confirm-delete:hover { background: #ff7875; }

        /* 链接修复辅助样式 */
        .img-link {
            display: block;
            position: relative;
            width: 100%;
            height: 100%;
            color: inherit;
            text-decoration: none;
        }
    `;
    document.head.appendChild(fixedStyles);

    // ----------------------------------------------------------------
    // 1. 初始化
    // ----------------------------------------------------------------
    if (typeof client === 'undefined') {
        console.error('Supabase client not initialized.');
        return;
    }

    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
        window.location.href = '/login/?redirect=/star/';
        return;
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
            
            const bookmarks = dataRes.data;
            const totalCount = countRes.count || 0;
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
