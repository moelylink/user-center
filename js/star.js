document.addEventListener('DOMContentLoaded', async () => {
    // 依赖 common.js
    if (typeof client === 'undefined') return;

    // 1. 验证登录
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
        window.location.href = '/login';
        return;
    }
    const userId = session.user.id;

    // 2. 状态管理
    const itemsPerPage = 20;
    let masonryInstance = null;
    let itemToDelete = null;

    // 获取 URL 参数
    const params = new URLSearchParams(window.location.search);
    let currentPage = parseInt(params.get('page')) || 1;
    let currentSort = params.get('sort') === '2' ? 'asc' : 'desc'; // 1=desc(default), 2=asc

    // 初始化 UI 状态
    document.getElementById('sort-select').value = params.get('sort') || '1';
    document.getElementById('current-page').textContent = currentPage;

    // 3. 加载数据
    async function loadImages() {
        const grid = document.getElementById('star-grid');
        const loading = document.getElementById('loading-state');
        const empty = document.getElementById('empty-state');
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');

        // 重置状态
        loading.classList.remove('hidden');
        empty.classList.add('hidden');
        pagination.classList.add('hidden');
        if (masonryInstance) {
            masonryInstance.destroy(); // 销毁旧实例
        }
        grid.innerHTML = ''; // 清空内容

        try {
            // 计算分页范围
            const from = (currentPage - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            // 并行查询：数据 + 总数
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

            document.getElementById('total-count').textContent = `共 ${totalCount} 张`;

            loading.classList.add('hidden');

            if (bookmarks.length === 0) {
                empty.classList.remove('hidden');
                return;
            }

            // 4. 渲染卡片
            const fragment = document.createDocumentFragment();
            bookmarks.forEach(item => {
                const date = new Date(item.created_at).toLocaleDateString();
                const div = document.createElement('div');
                div.className = 'grid-item';
                div.setAttribute('data-id', item.id);
                div.innerHTML = `
                    <a href="${item.url}" target="_blank">
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

            // 5. 初始化 Masonry
            // 使用 imagesLoaded 确保所有图片加载完毕后再进行布局计算
            imagesLoaded(grid, function() {
                masonryInstance = new Masonry(grid, {
                    itemSelector: '.grid-item',
                    percentPosition: true,
                    gutter: 16 // 对应 CSS 中的间隙控制
                });
                // 强制重绘一次以防万一
                masonryInstance.layout();
            });

            // 6. 更新分页 UI
            if (totalPages > 1) {
                pagination.classList.remove('hidden');
                prevBtn.disabled = currentPage <= 1;
                nextBtn.disabled = currentPage >= totalPages;

                prevBtn.onclick = () => updateUrl('page', currentPage - 1);
                nextBtn.onclick = () => updateUrl('page', currentPage + 1);
            }

        } catch (err) {
            console.error(err);
            loading.classList.add('hidden');
            Notifications.show('加载失败: ' + err.message, 'error');
        }
    }

    // 辅助：更新 URL 并刷新
    function updateUrl(key, value) {
        const url = new URL(window.location);
        if (value) {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
        // 如果改变了排序，重置页码回 1
        if (key === 'sort') {
            url.searchParams.set('page', 1);
        }
        window.location.href = url.toString();
    }

    // 事件：排序改变
    document.getElementById('sort-select').addEventListener('change', (e) => {
        // 如果选的是默认(1)，则移除 sort 参数
        const val = e.target.value === '1' ? null : '2';
        updateUrl('sort', val);
    });

    // =========================================
    // 删除逻辑
    // =========================================
    const modal = document.getElementById('delete-modal');
    
    // 全局函数供 HTML onclick 调用
    window.openDeleteModal = (id) => {
        itemToDelete = id;
        modal.classList.add('active');
    };

    document.getElementById('cancel-delete').addEventListener('click', () => {
        modal.classList.remove('active');
        itemToDelete = null;
    });

    document.getElementById('confirm-delete').addEventListener('click', async () => {
        if (!itemToDelete) return;

        try {
            const { error } = await client
                .from('bookmarks')
                .delete()
                .eq('id', itemToDelete);

            if (error) throw error;

            // UI 移除
            const itemEl = document.querySelector(`.grid-item[data-id="${itemToDelete}"]`);
            if (itemEl && masonryInstance) {
                masonryInstance.remove(itemEl);
                masonryInstance.layout(); // 重新布局
            }

            Notifications.show('删除成功', 'success');
            modal.classList.remove('active');

            // 简单处理：如果当前页删空了，建议刷新页面或重新获取，这里不做复杂处理
        } catch (err) {
            Notifications.show('删除失败: ' + err.message, 'error');
        }
    });

    // 初始加载
    loadImages();
});
