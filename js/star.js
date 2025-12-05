document.addEventListener('DOMContentLoaded', async () => {
    // 检查 Supabase 客户端是否在 common.js 中初始化
    if (typeof client === 'undefined') {
        console.error('Supabase client not initialized.');
        return;
    }

    // 1. 验证登录状态
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
        window.location.href = '/user/login/';
        return;
    }
    const userId = session.user.id;

    // 2. 状态变量管理
    const itemsPerPage = 20; // 每页显示20张
    let masonryInstance = null; // Masonry 实例
    let itemToDelete = null; // 待删除的图片ID

    // 解析 URL 参数
    const params = new URLSearchParams(window.location.search);
    let currentPage = parseInt(params.get('page')) || 1;
    // sort=2 代表从旧到新 (asc)，默认或 sort=1 代表从新到旧 (desc)
    let currentSort = params.get('sort') === '2' ? 'asc' : 'desc';

    // 初始化 UI 控件状态
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.value = params.get('sort') || '1';
    }
    const currentPageEl = document.getElementById('current-page');
    if (currentPageEl) {
        currentPageEl.textContent = currentPage;
    }

    // 3. 核心函数：加载数据并渲染
    async function loadImages() {
        const grid = document.getElementById('star-grid');
        const loading = document.getElementById('loading-state');
        const empty = document.getElementById('empty-state');
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');

        // 重置页面状态
        if (loading) loading.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');
        if (pagination) pagination.classList.add('hidden');
        
        // 销毁旧的 Masonry 实例，防止布局混乱
        if (masonryInstance) {
            masonryInstance.destroy();
            masonryInstance = null;
        }
        if (grid) grid.innerHTML = '';

        try {
            // 计算分页范围 (Supabase Range 是基于 0 索引的)
            const from = (currentPage - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            // 并行执行查询：获取当前页数据 + 获取总数量
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

            // 更新总数显示
            const totalCountEl = document.getElementById('total-count');
            if (totalCountEl) totalCountEl.textContent = `共 ${totalCount} 张`;

            if (loading) loading.classList.add('hidden');

            // 处理空数据情况
            if (bookmarks.length === 0) {
                if (empty) empty.classList.remove('hidden');
                return;
            }

            // 4. 生成 HTML 结构
            const fragment = document.createDocumentFragment();
            bookmarks.forEach(item => {
                const date = new Date(item.created_at).toLocaleDateString();
                const div = document.createElement('div');
                div.className = 'grid-item';
                div.setAttribute('data-id', item.id);
                
                // --- 关键修改：点击图片跳转到 https://www.moely.link/{url} ---
                const targetUrl = `https://www.moely.link/${item.url}`;
                
                div.innerHTML = `
                    <a href="${targetUrl}" target="_blank" rel="noopener noreferrer">
                        <img src="${item.image}" alt="收藏图片" loading="lazy">
                    </a>
                    <div class="item-overlay">
                        <div class="item-info">
                            <span class="item-date">
                                <span class="material-icons-round" style="font-size:14px">schedule</span>
                                ${date}
                            </span>
                        </div>
                    </div>
                    <button class="delete-btn" title="删除" onclick="openDeleteModal('${item.id}')">
                        <span class="material-icons-round">delete</span>
                    </button>
                `;
                fragment.appendChild(div);
            });
            grid.appendChild(fragment);

            // 5. 初始化 Masonry 布局
            // 使用 imagesLoaded 插件，确保所有图片下载完毕后再计算布局，防止重叠
            if (typeof imagesLoaded !== 'undefined' && typeof Masonry !== 'undefined') {
                imagesLoaded(grid, function() {
                    masonryInstance = new Masonry(grid, {
                        itemSelector: '.grid-item',
                        percentPosition: true,
                        gutter: 16, // 对应 CSS 中的间隙
                        transitionDuration: '0.3s'
                    });
                    // 强制触发布局更新
                    masonryInstance.layout();
                });
            } else {
                console.warn('Masonry or imagesLoaded library is missing.');
            }

            // 6. 更新分页按钮状态
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
            console.error('Load error:', err);
            if (loading) loading.classList.add('hidden');
            Notifications.show('加载收藏失败: ' + err.message, 'error');
        }
    }

    // 辅助函数：更新 URL 参数并刷新页面
    function updateUrl(key, value) {
        const url = new URL(window.location);
        if (value) {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
        
        // 如果改变了排序方式，重置页码回第一页
        if (key === 'sort') {
            url.searchParams.set('page', 1);
        }
        
        window.location.href = url.toString();
    }

    // 监听排序下拉框变化
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            // value="1" 为默认(新到旧)，不需要参数；value="2" 为旧到新
            const val = e.target.value === '1' ? null : '2';
            updateUrl('sort', val);
        });
    }

    // =========================================
    // 删除功能逻辑
    // =========================================
    const modal = document.getElementById('delete-modal');
    const cancelBtn = document.getElementById('cancel-delete');
    const confirmBtn = document.getElementById('confirm-delete');
    
    // 暴露给全局，以便 HTML 中的 onclick="openDeleteModal(...)" 调用
    window.openDeleteModal = (id) => {
        itemToDelete = id;
        if (modal) modal.classList.add('active');
    };

    // 关闭弹窗
    const closeModal = () => {
        if (modal) modal.classList.remove('active');
        itemToDelete = null;
    };

    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    // 确认删除
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!itemToDelete) return;

            try {
                // 数据库删除操作
                const { error } = await client
                    .from('bookmarks')
                    .delete()
                    .eq('id', itemToDelete);

                if (error) throw error;

                // 界面移除元素 (避免刷新页面)
                const itemEl = document.querySelector(`.grid-item[data-id="${itemToDelete}"]`);
                if (itemEl && masonryInstance) {
                    masonryInstance.remove(itemEl);
                    masonryInstance.layout(); // 重新计算布局
                }

                Notifications.show('删除成功', 'success');
                closeModal();

                // 更新总数显示（可选优化：重新获取 count 或手动 -1）
                const totalCountEl = document.getElementById('total-count');
                if (totalCountEl) {
                    const currentText = totalCountEl.textContent;
                    const countMatch = currentText.match(/\d+/);
                    if (countMatch) {
                        const newCount = parseInt(countMatch[0]) - 1;
                        totalCountEl.textContent = `共 ${newCount} 张`;
                    }
                }

            } catch (err) {
                console.error('Delete error:', err);
                Notifications.show('删除失败: ' + err.message, 'error');
                closeModal();
            }
        });
    }

    // 点击遮罩层关闭弹窗
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // 页面加载时执行
    loadImages();
});
