document.addEventListener('DOMContentLoaded', async () => {
    // ----------------------------------------------------------------
    // 0. 样式注入 (确保弹窗样式存在)
    // ----------------------------------------------------------------
    if (!document.getElementById('injected-modal-styles')) {
        const fixedStyles = document.createElement('style');
        fixedStyles.id = 'injected-modal-styles';
        fixedStyles.textContent = `
            .modal-overlay { position: fixed !important; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 2147483647; display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; transition: 0.3s; backdrop-filter: blur(2px); }
            .modal-overlay.active { opacity: 1; visibility: visible; }
            .modal-card { background: #fff; width: 90%; max-width: 360px; padding: 24px; border-radius: 16px; text-align: center; transform: scale(0.9); transition: 0.3s; color: #333; }
            [data-theme="dark"] .modal-card { background: #2c2c2c; color: #eee; }
            .modal-overlay.active .modal-card { transform: scale(1); }
            .modal-icon.warning { color: #ff4d4f; margin-bottom: 16px; } .modal-icon .material-icons-round { font-size: 48px; }
            .modal-actions { display: flex; gap: 12px; margin-top: 24px; }
            .modal-btn { flex: 1; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
            .btn-cancel { background: #f5f5f5; color: #666; }
            [data-theme="dark"] .btn-cancel { background: #3a3a3a; color: #aaa; }
            .btn-confirm { background: #ff4d4f; color: white; }
        `;
        document.head.appendChild(fixedStyles);
    }

    // 1. 初始化
    if (typeof client === 'undefined') return;

    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
        window.location.href = '/login/?redirect=/anime/';
        return;
    }
    const userId = session.user.id;

    // 2. 状态管理
    const itemsPerPage = 20;
    let itemToDelete = null;

    const params = new URLSearchParams(window.location.search);
    let currentPage = parseInt(params.get('page')) || 1;
    let currentSort = params.get('sort') === '2' ? 'asc' : 'desc';

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) sortSelect.value = params.get('sort') || '1';
    
    document.getElementById('current-page').textContent = currentPage;

    // 3. 加载数据
    async function loadAnimes() {
        const listContainer = document.getElementById('anime-list');
        const loading = document.getElementById('loading-state');
        const empty = document.getElementById('empty-state');
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');

        loading.classList.remove('hidden');
        empty.classList.add('hidden');
        pagination.classList.add('hidden');
        listContainer.innerHTML = '';

        try {
            const from = (currentPage - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            const [dataRes, countRes] = await Promise.all([
                client
                    .from('anime_favorites')
                    .select('id, title, url, created_at')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: currentSort === 'asc' })
                    .range(from, to),
                
                client
                    .from('anime_favorites')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', userId)
            ]);

            if (dataRes.error) throw dataRes.error;
            
            const animes = dataRes.data;
            const totalCount = countRes.count || 0;
            const totalPages = Math.ceil(totalCount / itemsPerPage);

            document.getElementById('total-count').textContent = `共 ${totalCount} 部`;
            loading.classList.add('hidden');

            if (animes.length === 0) {
                empty.classList.remove('hidden');
                return;
            }

            // 渲染列表
            const fragment = document.createDocumentFragment();
            animes.forEach(item => {
                const date = new Date(item.created_at).toLocaleDateString();
                const div = document.createElement('div');
                div.className = 'article-item';
                div.setAttribute('data-id', item.id);
                
                // 处理链接：自动添加前缀（如果只是相对路径）
                const cleanPath = item.url.startsWith('/') ? item.url.substring(1) : item.url;
                // 如果已经是 http 开头则不加前缀
                const targetUrl = item.url.startsWith('http') ? item.url : `https://anime.moely.link/${cleanPath}`;
                
                div.innerHTML = `
                    <a href="${targetUrl}" target="_blank" class="article-link" title="${item.title}">
                        <span class="material-icons-round article-icon">play_circle_outline</span>
                        ${escapeHtml(item.title)}
                    </a>
                    <div class="article-meta">
                        <span class="article-date">
                            <span class="material-icons-round" style="font-size:16px">event</span>
                            ${date}
                        </span>
                        <button class="btn-icon-danger" onclick="window.openDeleteModal('${item.id}')" title="删除">
                            <span class="material-icons-round">delete_outline</span>
                        </button>
                    </div>
                `;
                fragment.appendChild(div);
            });
            listContainer.appendChild(fragment);

            // 分页
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

    // URL 更新辅助函数
    function updateUrl(key, value) {
        const url = new URL(window.location);
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
        if (key === 'sort') url.searchParams.set('page', 1);
        window.location.href = url.toString();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 排序事件
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

    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!itemToDelete) return;

            try {
                const { error } = await client
                    .from('anime_favorites') // 删除表
                    .delete()
                    .eq('id', itemToDelete);

                if (error) throw error;

                // 移除 DOM
                const itemEl = document.querySelector(`.article-item[data-id="${itemToDelete}"]`);
                if (itemEl) itemEl.remove();

                Notifications.show('已取消收藏', 'success');
                closeModal();
                
                // 更新总数 (可选)
                const totalCountEl = document.getElementById('total-count');
                if (totalCountEl) {
                    const num = parseInt(totalCountEl.textContent.match(/\d+/)) - 1;
                    totalCountEl.textContent = `共 ${num} 部`;
                }

                // 如果删空了显示 empty state
                if (document.getElementById('anime-list').children.length === 0) {
                    location.reload(); 
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

    loadAnimes();
});
