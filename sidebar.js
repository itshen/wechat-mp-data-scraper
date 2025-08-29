// SaaS风格的微信数据抓取工具

// DOM 元素
const statusIndicator = document.getElementById('statusIndicator');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');
const captureBtn = document.getElementById('captureBtn');
const exportBtn = document.getElementById('exportBtn');
const statsSection = document.getElementById('statsSection');
const tableSection = document.getElementById('tableSection');
const emptyState = document.getElementById('emptyState');
const dataTable = document.getElementById('dataTable');
const tableBody = document.getElementById('tableBody');
const clearDataBtn = document.getElementById('clearDataBtn');
const refreshBtn = document.getElementById('refreshBtn');

// 统计元素
const totalArticles = document.getElementById('totalArticles');
const totalReads = document.getElementById('totalReads');
const totalLikes = document.getElementById('totalLikes');
const avgRead = document.getElementById('avgRead');
const avgLikeRatio = document.getElementById('avgLikeRatio');
const avgShareRatio = document.getElementById('avgShareRatio');

// 本月数据统计元素
const monthlyArticles = document.getElementById('monthlyArticles');
const monthlyReads = document.getElementById('monthlyReads');
const monthlyLikes = document.getElementById('monthlyLikes');
const monthlyAvgRead = document.getElementById('monthlyAvgRead');
const monthlyAvgLikeRatio = document.getElementById('monthlyAvgLikeRatio');
const monthlyAvgShareRatio = document.getElementById('monthlyAvgShareRatio');

// 最近10篇文章统计元素
const top10Articles = document.getElementById('top10Articles');
const top10AvgRead = document.getElementById('top10AvgRead');
const top10AvgLike = document.getElementById('top10AvgLike');
const top10LikeRatio = document.getElementById('top10LikeRatio');
const top10ShareRatio = document.getElementById('top10ShareRatio');

// 分页元素
const tablePagination = document.getElementById('tablePagination');
const paginationInfo = document.getElementById('paginationInfo');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');

// 数据存储
let currentData = [];
let originalData = []; // 保存原始数据顺序
let currentPage = 1;
const pageSize = 20;
let currentTab = null;

// 排序状态
let currentSort = {
    column: null,
    direction: null // 'asc' 或 'desc'
};

// 本地存储键名
const STORAGE_KEY = 'wx_publish_data';
const SETTINGS_KEY = 'wx_publish_settings';

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await initialize();
    bindEvents();
    loadStoredData();
    
    // 定期检查页面状态
    setInterval(checkPageStatus, 3000);
});

// 初始化应用
async function initialize() {
    try {
        [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await checkPageStatus();
    } catch (error) {
        console.error('初始化失败:', error);
        updateStatus('error', '初始化失败');
    }
}

// 绑定事件
function bindEvents() {
    captureBtn.addEventListener('click', captureData);
    exportBtn.addEventListener('click', exportData);
    clearDataBtn.addEventListener('click', clearAllData);
    refreshBtn.addEventListener('click', () => {
        updateStatus('checking', '刷新检测...');
        checkPageStatus();
    });
    
    prevPageBtn.addEventListener('click', () => changePage(currentPage - 1));
    nextPageBtn.addEventListener('click', () => changePage(currentPage + 1));
    
    // 绑定标签页切换事件
    bindStatsTabEvents();
    
    // 绑定排序事件
    bindSortEvents();
    
    // 绑定反馈问题按钮事件（显示模态框）
    const feedbackBtn = document.getElementById('feedbackBtn');
    const aboutModal = document.getElementById('aboutModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalOverlay = aboutModal?.querySelector('.modal-overlay');
    
    if (feedbackBtn && aboutModal) {
        feedbackBtn.addEventListener('click', () => {
            aboutModal.style.display = 'flex';
        });
    }
    
    if (closeModalBtn && aboutModal) {
        closeModalBtn.addEventListener('click', () => {
            aboutModal.style.display = 'none';
        });
    }
    
    // 点击遮罩层关闭模态框
    if (modalOverlay && aboutModal) {
        modalOverlay.addEventListener('click', () => {
            aboutModal.style.display = 'none';
        });
    }
    
    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && aboutModal && aboutModal.style.display === 'flex') {
            aboutModal.style.display = 'none';
        }
    });
    
    // 监听标签页变化
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        currentTab = await chrome.tabs.get(activeInfo.tabId);
        await checkPageStatus();
    });
}

// 检查页面状态
async function checkPageStatus() {
    try {
        if (!currentTab || !currentTab.url.includes('mp.weixin.qq.com')) {
            updateStatus('error', '请在微信公众号后台使用');
            return;
        }

        const result = await chrome.tabs.sendMessage(currentTab.id, { action: 'checkData' });
        
        if (result && result.hasData) {
            updateStatus('ready', '准备就绪');
            captureBtn.disabled = false;
        } else {
            updateStatus('error', '未检测到数据');
            captureBtn.disabled = true;
        }
    } catch (error) {
        console.error('检查页面状态失败:', error);
        updateStatus('error', '页面检查失败');
        captureBtn.disabled = true;
    }
}

// 更新状态
function updateStatus(type, message) {
    statusIndicator.className = `status-indicator ${type}`;
    statusText.textContent = message;
}

// 抓取数据
async function captureData() {
    try {
        updateStatus('checking', '抓取数据中...');
        captureBtn.disabled = true;
        
        // 先获取token
        const tokenResult = await chrome.tabs.sendMessage(currentTab.id, { action: 'getToken' });
        const token = tokenResult?.token || null;
        
        const result = await chrome.tabs.sendMessage(currentTab.id, { action: 'captureAllData' });
        
        if (result && result.data) {
            const processedData = processWeixinData(result.data, token);
            
            if (processedData.length > 0) {
                await saveDataToStorage(processedData);
                loadStoredData();
                updateStatus('ready', `成功抓取 ${processedData.length} 条数据`);
                exportBtn.disabled = false;
            } else {
                updateStatus('error', '未找到有效数据');
            }
        } else {
            throw new Error(result?.error || '抓取失败');
        }
    } catch (error) {
        console.error('抓取数据失败:', error);
        updateStatus('error', '抓取失败: ' + error.message);
    } finally {
        captureBtn.disabled = false;
    }
}

// 处理微信数据
function processWeixinData(rawData, token = null) {
    
    let publishList = [];
    
    // 处理不同的数据格式
    if (rawData.publish_list && Array.isArray(rawData.publish_list)) {
        publishList = rawData.publish_list;
    } else if (rawData.cgiData && rawData.cgiData.publish_list) {
        publishList = rawData.cgiData.publish_list;
    } else if (typeof rawData === 'string') {
        try {
            const parsed = JSON.parse(rawData);
            publishList = parsed.publish_list || [];
        } catch (e) {
            console.error('解析JSON失败:', e);
            return [];
        }
    }
    
    const processedData = [];
    
    publishList.forEach((item, index) => {
        try {
            // 处理可能的HTML转义数据
            let processedItem = item;
            if (item.publish_info && typeof item.publish_info === 'string') {
                // 解码HTML实体
                const decodedInfo = decodeHtmlEntities(item.publish_info);
                try {
                    processedItem = JSON.parse(decodedInfo);
                } catch (e) {
                    console.error('解析publish_info失败:', e);
                    processedItem = item;
                }
            }
            
            // 提取基础信息
            const type = getContentType(processedItem.type);
            const sentInfo = processedItem.sent_info || {};
            const sentStatus = processedItem.sent_status || {};
            const sentResult = processedItem.sent_result || {};
            
            // 处理appmsg_info数组
            const appmsgList = processedItem.appmsg_info || [];
            
            appmsgList.forEach((appmsg, appmsgIndex) => {
                
                const record = {
                    id: `${processedItem.msgid || index}_${appmsgIndex}`,
                    msgid: processedItem.msgid || 0,
                    title: decodeHtmlEntities(appmsg.title || '无标题'),
                    type: type,
                    contentUrl: appmsg.content_url || '',
                    
                    // 时间信息 - 优先使用 line_info.send_time，然后是 sent_info.time
                    publishTime: appmsg.line_info?.send_time ? formatTimestamp(appmsg.line_info.send_time) : 
                                (sentInfo.time ? formatTimestamp(sentInfo.time) : ''),
                    sendTime: appmsg.line_info?.send_time ? formatTimestamp(appmsg.line_info.send_time) : '',
                    publishDate: appmsg.line_info?.send_time ? formatDateForUrl(appmsg.line_info.send_time) :
                                (processedItem.view?.publishDate || (sentInfo.time ? formatDateForUrl(sentInfo.time) : '')),
                    publishTimestamp: appmsg.line_info?.send_time || sentInfo.time || 0,
                    
                    // 数据指标
                    readNum: parseInt(appmsg.read_num) || 0,
                    likeNum: parseInt(appmsg.old_like_num) || parseInt(appmsg.like_num) || 0,
                    commentNum: parseInt(appmsg.comment_num) || 0,
                    shareNum: parseInt(appmsg.share_num) || 0,
                    reprintNum: parseInt(appmsg.reprint_num) || 0,
                    recommendNum: parseInt(appmsg.like_num) || 0,
                    rewardMoney: parseFloat(appmsg.reward_money) || 0,
                    lineCount: parseInt(appmsg.line_info?.line_count) || 0,
                    
                    // 推送信息
                    totalPush: sentStatus.total || 0,
                    successPush: sentStatus.succ || 0,
                    failPush: sentStatus.fail || 0,
                    isAllPush: sentInfo.is_send_all || false,
                    
                    // 状态信息
                    isDeleted: appmsg.is_deleted || false,
                    msgStatus: sentResult.msg_status || 0,
                    failReason: sentResult.msg_fail_reason || sentResult.refuse_reason || '',
                    
                    // 其他信息
                    cover: appmsg.cover || '',
                    digest: decodeHtmlEntities(appmsg.digest || ''),
                    modifyStatus: appmsg.modify_status || 0,
                    
                    // 图文类型特有字段
                    shareImageCount: appmsg.share_imageinfo ? appmsg.share_imageinfo.length : 0,
                    hasMultiplePictures: appmsg.multi_picture_cover || 0,
                    
                    // 隐藏的完整数据（用于构造详情页URL）
                    appmsgid: parseInt(appmsg.appmsgid) || parseInt(appmsg.id) || 0,
                    itemidx: parseInt(appmsg.itemidx) || 1,
                    token: token || extractTokenFromCurrentPage(),
                    
                    // 保存原始数据
                    rawData: {
                        sentInfo: sentInfo,
                        sentStatus: sentStatus,
                        sentResult: sentResult,
                        appmsgInfo: appmsg,
                        publishItem: processedItem
                    },
                    
                    // 计算比率
                    likeReadRatio: 0,
                    shareReadRatio: 0,
                    recommendReadRatio: 0,
                    
                    // 时间戳
                    captureTime: new Date().toISOString()
                };
                
                // 计算比率
                if (record.readNum > 0) {
                    record.likeReadRatio = ((record.likeNum / record.readNum) * 100).toFixed(2);
                    record.shareReadRatio = ((record.shareNum / record.readNum) * 100).toFixed(2);
                    record.recommendReadRatio = ((record.recommendNum / record.readNum) * 100).toFixed(2);
                }
                
                processedData.push(record);
            });
            
        } catch (error) {
            console.error('处理数据项失败:', error, item);
        }
    });
    
    return processedData;
}

// 解码HTML实体
function decodeHtmlEntities(text) {
    if (typeof text !== 'string') return text;
    
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

// 获取内容类型
function getContentType(type) {
    switch (type) {
        case 9: return '文章';
        case 10002: return '图文';
        case 10: return '视频';
        case 63: return '音频';
        default: return '其他 (' + type + ')';
    }
}

// 格式化时间戳
function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 格式化日期用于URL
function formatDateForUrl(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 从当前页面提取token
function extractTokenFromCurrentPage() {
    try {
        // 从当前标签页的URL中提取token
        if (currentTab && currentTab.url) {
            const url = new URL(currentTab.url);
            const token = url.searchParams.get('token');
            if (token) {
                return token;
            }
        }
        
        // 备用方案：从页面全局变量中获取
        // 这部分需要在content script中实现
        return null;
    } catch (error) {
        console.error('提取token失败:', error);
        return null;
    }
}

// 保存数据到本地存储
async function saveDataToStorage(data) {
    try {
        const existingData = await getStoredData();
        const mergedData = [...existingData];
        
        data.forEach(newRecord => {
            const existingIndex = mergedData.findIndex(item => item.id === newRecord.id);
            if (existingIndex >= 0) {
                mergedData[existingIndex] = newRecord;
            } else {
                mergedData.push(newRecord);
            }
        });
        
        mergedData.sort((a, b) => new Date(b.captureTime) - new Date(a.captureTime));
        await chrome.storage.local.set({ [STORAGE_KEY]: mergedData });
    } catch (error) {
        console.error('保存数据失败:', error);
        throw error;
    }
}

// 从本地存储获取数据
async function getStoredData() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        return result[STORAGE_KEY] || [];
    } catch (error) {
        console.error('获取存储数据失败:', error);
        return [];
    }
}

// 加载存储的数据
async function loadStoredData() {
    try {
        const data = await getStoredData();
        originalData = [...data]; // 保存原始数据
        currentData = [...data];  // 当前显示的数据
        
        // 重置排序状态和分页
        currentSort.column = null;
        currentSort.direction = null;
        currentPage = 1;
        updateSortIndicators();
        
        if (data.length > 0) {
            showDataView();
            updateStatistics(data);
            renderTable();
        } else {
            showEmptyView();
        }
    } catch (error) {
        console.error('加载数据失败:', error);
        showEmptyView();
    }
}

// 显示数据视图
function showDataView() {
    emptyState.style.display = 'none';
    statsSection.style.display = 'block';
    tableSection.style.display = 'flex';
    exportBtn.disabled = false;
}

// 显示空状态
function showEmptyView() {
    statsSection.style.display = 'none';
    tableSection.style.display = 'none';
    emptyState.style.display = 'flex';
    exportBtn.disabled = true;
}

// 更新统计信息
function updateStatistics(data) {
    // 全部数据统计
    const stats = {
        totalArticles: data.length,
        totalReads: data.reduce((sum, item) => sum + item.readNum, 0),
        totalLikes: data.reduce((sum, item) => sum + item.likeNum, 0),
        totalShares: data.reduce((sum, item) => sum + item.shareNum, 0),
        avgRead: 0,
        avgLikeRatio: 0,
        avgShareRatio: 0
    };
    
    if (stats.totalArticles > 0) {
        stats.avgRead = Math.round(stats.totalReads / stats.totalArticles);
        
        // 计算平均点赞率
        const totalLikeRatio = data.reduce((sum, item) => sum + parseFloat(item.likeReadRatio || 0), 0);
        stats.avgLikeRatio = (totalLikeRatio / stats.totalArticles).toFixed(2);
        
        // 计算平均转发率
        const totalShareRatio = data.reduce((sum, item) => sum + parseFloat(item.shareReadRatio || 0), 0);
        stats.avgShareRatio = (totalShareRatio / stats.totalArticles).toFixed(2);
    }
    
    totalArticles.textContent = stats.totalArticles.toLocaleString();
    totalReads.textContent = stats.totalReads.toLocaleString();
    totalLikes.textContent = stats.totalLikes.toLocaleString();
    avgRead.textContent = stats.avgRead.toLocaleString();
    avgLikeRatio.textContent = stats.avgLikeRatio + '%';
    avgShareRatio.textContent = stats.avgShareRatio + '%';
    
    // 本月数据统计
    const monthlyStats = calculateMonthlyStats(data);
    updateMonthlyDisplay(monthlyStats);
    
    // 最近10篇文章统计（去掉最高最低）
    const top10Stats = calculateTop10Stats(data);
    updateTop10Display(top10Stats);
}

// 计算本月数据统计
function calculateMonthlyStats(data) {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    
    // 筛选本月数据
    const monthlyData = data.filter(item => {
        if (!item.publishTimestamp) return false;
        
        const publishDate = new Date(item.publishTimestamp * 1000);
        return publishDate.getFullYear() === currentYear && 
               publishDate.getMonth() === currentMonth;
    });
    
    const stats = {
        totalArticles: monthlyData.length,
        totalReads: monthlyData.reduce((sum, item) => sum + item.readNum, 0),
        totalLikes: monthlyData.reduce((sum, item) => sum + item.likeNum, 0),
        avgRead: 0,
        avgLikeRatio: 0,
        avgShareRatio: 0
    };
    
    if (stats.totalArticles > 0) {
        stats.avgRead = Math.round(stats.totalReads / stats.totalArticles);
        
        // 计算本月平均点赞率
        const totalLikeRatio = monthlyData.reduce((sum, item) => sum + parseFloat(item.likeReadRatio || 0), 0);
        stats.avgLikeRatio = (totalLikeRatio / stats.totalArticles).toFixed(2);
        
        // 计算本月平均转发率
        const totalShareRatio = monthlyData.reduce((sum, item) => sum + parseFloat(item.shareReadRatio || 0), 0);
        stats.avgShareRatio = (totalShareRatio / stats.totalArticles).toFixed(2);
    }
    
    return stats;
}

// 更新本月数据显示
function updateMonthlyDisplay(stats) {
    monthlyArticles.textContent = stats.totalArticles.toLocaleString();
    monthlyReads.textContent = stats.totalReads.toLocaleString();
    monthlyLikes.textContent = stats.totalLikes.toLocaleString();
    monthlyAvgRead.textContent = stats.avgRead.toLocaleString();
    monthlyAvgLikeRatio.textContent = stats.avgLikeRatio + '%';
    monthlyAvgShareRatio.textContent = stats.avgShareRatio + '%';
}

// 计算最近10篇文章统计（去掉最高最低阅读量）
function calculateTop10Stats(data) {
    // 按发布时间排序，取最近10篇
    const sortedData = [...data].sort((a, b) => {
        const timeA = a.publishTimestamp || 0;
        const timeB = b.publishTimestamp || 0;
        return timeB - timeA; // 降序排列，最新的在前
    });
    
    const recentArticles = sortedData.slice(0, 10);
    
    // 如果文章数少于3篇，无法去掉最高最低
    if (recentArticles.length < 3) {
        return {
            validArticles: recentArticles.length,
            avgRead: recentArticles.length > 0 ? 
                Math.round(recentArticles.reduce((sum, item) => sum + item.readNum, 0) / recentArticles.length) : 0,
            avgLike: recentArticles.length > 0 ? 
                Math.round(recentArticles.reduce((sum, item) => sum + item.likeNum, 0) / recentArticles.length) : 0,
            avgLikeRatio: recentArticles.length > 0 ? 
                (recentArticles.reduce((sum, item) => sum + parseFloat(item.likeReadRatio || 0), 0) / recentArticles.length).toFixed(2) : '0.00',
            avgShareRatio: recentArticles.length > 0 ? 
                (recentArticles.reduce((sum, item) => sum + parseFloat(item.shareReadRatio || 0), 0) / recentArticles.length).toFixed(2) : '0.00'
        };
    }
    
    // 按阅读量排序
    const sortedByReads = [...recentArticles].sort((a, b) => a.readNum - b.readNum);
    
    // 去掉最高和最低阅读量的文章
    const filteredArticles = sortedByReads.slice(1, -1);
    
    const stats = {
        validArticles: filteredArticles.length,
        avgRead: filteredArticles.length > 0 ? 
            Math.round(filteredArticles.reduce((sum, item) => sum + item.readNum, 0) / filteredArticles.length) : 0,
        avgLike: filteredArticles.length > 0 ? 
            Math.round(filteredArticles.reduce((sum, item) => sum + item.likeNum, 0) / filteredArticles.length) : 0,
        avgLikeRatio: filteredArticles.length > 0 ? 
            (filteredArticles.reduce((sum, item) => sum + parseFloat(item.likeReadRatio || 0), 0) / filteredArticles.length).toFixed(2) : '0.00',
        avgShareRatio: filteredArticles.length > 0 ? 
            (filteredArticles.reduce((sum, item) => sum + parseFloat(item.shareReadRatio || 0), 0) / filteredArticles.length).toFixed(2) : '0.00'
    };
    
    return stats;
}

// 更新最近10篇文章统计显示
function updateTop10Display(stats) {
    top10Articles.textContent = stats.validArticles.toLocaleString();
    top10AvgRead.textContent = stats.avgRead.toLocaleString();
    top10AvgLike.textContent = stats.avgLike.toLocaleString();
    top10LikeRatio.textContent = stats.avgLikeRatio + '%';
    top10ShareRatio.textContent = stats.avgShareRatio + '%';
}

// 绑定统计标签页事件
function bindStatsTabEvents() {
    const statsTabs = document.querySelectorAll('.stats-tab');
    const statsTabContents = document.querySelectorAll('.stats-tab-content');
    
    statsTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetTab = e.target.dataset.tab;
            
            // 移除所有活动状态
            statsTabs.forEach(t => t.classList.remove('active'));
            statsTabContents.forEach(content => content.classList.remove('active'));
            
            // 激活当前标签页
            e.target.classList.add('active');
            const targetContent = document.getElementById(targetTab + 'Stats');
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

// 渲染表格
function renderTable() {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageData = currentData.slice(startIndex, endIndex);
    
    tableBody.innerHTML = '';
    
    pageData.forEach(record => {
        const row = createTableRow(record);
        tableBody.appendChild(row);
    });
    
    // 绑定数据详情按钮事件
    bindDetailButtons();
    
    updatePagination();
}

// 创建表格行
function createTableRow(record) {
    const row = document.createElement('tr');
    
    const hasError = record.failReason || record.msgStatus === 8;
    const isDeleted = record.isDeleted;
    
    row.innerHTML = `
        <td><div class="cell-title" title="${record.title}">${record.title}</div></td>
        <td><span class="cell-type ${record.type === '文章' ? 'article' : record.type === '图文' ? 'media' : 'other'}">${record.type}</span></td>
        <td>${record.publishTime}</td>
        <td class="cell-number">${record.readNum.toLocaleString()}</td>
        <td class="cell-number">${record.likeNum.toLocaleString()}</td>
        <td class="cell-number">${record.commentNum.toLocaleString()}</td>
        <td class="cell-number">${record.shareNum.toLocaleString()}</td>
        <td class="cell-ratio">${record.likeReadRatio}%</td>
        <td class="cell-ratio">${record.shareReadRatio}%</td>
        <td class="cell-number">${record.recommendNum.toLocaleString()}</td>
        <td class="cell-ratio">${record.recommendReadRatio}%</td>
        <td class="cell-number">${record.totalPush.toLocaleString()}</td>
        <td><div class="cell-status"><div class="status-dot ${hasError ? 'error' : isDeleted ? 'warning' : 'success'}"></div><span>${hasError ? '异常' : isDeleted ? '已删除' : '正常'}</span></div></td>
        <td><div class="cell-actions">
            ${record.contentUrl ? `<a href="${record.contentUrl}" target="_blank" class="action-link">查看</a>` : ''}
            <button class="detail-btn" data-record='${JSON.stringify(record).replace(/'/g, "&#39;")}' title="查看数据详情">详情</button>
        </div></td>
    `;
    
    return row;
}

// 更新分页
function updatePagination() {
    const totalPages = Math.ceil(currentData.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, currentData.length);
    
    paginationInfo.textContent = `显示 ${startIndex}-${endIndex} 条，共 ${currentData.length} 条记录`;
    
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
    
    tablePagination.style.display = totalPages > 1 ? 'flex' : 'none';
}

// 切换页面
function changePage(page) {
    const totalPages = Math.ceil(currentData.length / pageSize);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderTable();
    }
}

// 清空所有数据
async function clearAllData() {
    if (!confirm('确定要清空所有数据吗？此操作不可恢复。')) {
        return;
    }
    
    try {
        await chrome.storage.local.remove([STORAGE_KEY]);
        currentData = [];
        currentPage = 1;
        showEmptyView();
        updateStatus('ready', '数据已清空');
    } catch (error) {
        console.error('清空数据失败:', error);
        updateStatus('error', '清空失败');
    }
}



// 导出数据
async function exportData() {
    try {
        if (currentData.length === 0) {
            alert('暂无数据可导出');
            return;
        }
        
        const csv = convertToCSV(currentData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = `微信公众号数据_${timestamp}.csv`;
        
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(link.href);
        
        updateStatus('ready', `已导出 ${currentData.length} 条数据`);
    } catch (error) {
        console.error('导出失败:', error);
        updateStatus('error', '导出失败');
    }
}

// 转换为CSV格式
function convertToCSV(data) {
    const headers = [
        '标题', '类型', '发布时间', '阅读量', '点赞数', '评论数', '转发数',
        '点赞率(%)', '转发率(%)', '在看数', '推阅比(%)', '推送人数',
        '成功推送', '失败推送', '是否全员推送', '状态', '失败原因',
        '赞赏金额', '划线数', '图片数量', '多图封面', '内容链接', '抓取时间'
    ];
    
    const rows = data.map(record => [
        `"${record.title.replace(/"/g, '""')}"`,
        record.type,
        record.publishTime,
        record.readNum,
        record.likeNum,
        record.commentNum,
        record.shareNum,
        record.likeReadRatio,
        record.shareReadRatio,
        record.recommendNum,
        record.recommendReadRatio,
        record.totalPush,
        record.successPush,
        record.failPush,
        record.isAllPush ? '是' : '否',
        record.isDeleted ? '已删除' : (record.failReason ? '异常' : '正常'),
        `"${record.failReason.replace(/"/g, '""')}"`,
        record.rewardMoney,
        record.lineCount,
        record.shareImageCount || 0,
        record.hasMultiplePictures ? '是' : '否',
        record.contentUrl,
        record.captureTime
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    // 添加BOM以支持中文
    return '\uFEFF' + csvContent;
}

// 绑定数据详情按钮事件
function bindDetailButtons() {
    const detailBtns = document.querySelectorAll('.detail-btn');
    detailBtns.forEach((btn, index) => {
        btn.addEventListener('click', handleViewDetail);
    });
}

// 处理查看数据详情
async function handleViewDetail(event) {
    const btn = event.currentTarget;
    
    try {
        const recordData = JSON.parse(btn.dataset.record);
        
        // 如果没有token，先从当前页面获取
        if (!recordData.token) {
            try {
                const tokenResult = await chrome.tabs.sendMessage(currentTab.id, { action: 'getToken' });
                if (tokenResult && tokenResult.token) {
                    recordData.token = tokenResult.token;
                }
            } catch (error) {
                console.warn('从页面获取token失败:', error);
            }
        }
        
        // 构造数据详情页面URL
        const detailUrl = constructDetailPageUrl(recordData);
        
        if (!detailUrl) {
            const missingInfo = [];
            if (!recordData.appmsgid) missingInfo.push('appmsgid');
            if (!recordData.publishDate) missingInfo.push('publishDate');  
            if (!recordData.token) missingInfo.push('token');
            
            updateStatus('error', `无法构造详情页面链接 - 缺少: ${missingInfo.join(', ')}`);
            return;
        }
        
        // 在新标签页中打开数据详情页面
        chrome.tabs.create({ 
            url: detailUrl,
            active: true // 激活新标签页
        });
        
        updateStatus('ready', '已打开数据详情页面');
        
    } catch (error) {
        console.error('查看数据详情失败:', error);
        updateStatus('error', '打开详情页面失败: ' + error.message);
    }
}

// 构造数据详情页面URL
function constructDetailPageUrl(record) {
    try {
        
        // 从多个来源获取必要参数
        let appmsgid = record.appmsgid;
        let publishDate = record.publishDate;
        let token = record.token;
        let itemidx = record.itemidx || 1;
        
        // 如果没有appmsgid，尝试从其他字段获取
        if (!appmsgid) {
            appmsgid = record.msgid || 
                      (record.rawData?.appmsgInfo?.appmsgid) ||
                      (record.rawData?.appmsgInfo?.id) || 0;
        }
        
        // 如果没有publishDate，尝试从多个来源生成
        if (!publishDate) {
            if (record.publishTimestamp) {
                publishDate = formatDateForUrl(record.publishTimestamp);
            } else if (record.rawData?.publishItem?.view?.publishDate) {
                publishDate = record.rawData.publishItem.view.publishDate;
            } else if (record.rawData?.sentInfo?.time) {
                publishDate = formatDateForUrl(record.rawData.sentInfo.time);
            }
        }
        
        // 如果没有token，尝试从当前页面获取
        if (!token) {
            console.warn('缺少token，尝试从页面获取...');
        }
        
        const missingParams = [];
        if (!appmsgid) missingParams.push('appmsgid');
        if (!publishDate) missingParams.push('publishDate');
        if (!token) missingParams.push('token');
        
        if (missingParams.length > 0) {
            console.error(`缺少必要参数: ${missingParams.join(', ')}`);
            console.error('可用的原始数据:', record);
            return null;
        }
        
        // 构造msgid参数
        const msgidParam = `${appmsgid}_${itemidx}`;
        
        // 构造完整的数据详情页面URL
        const detailUrl = `https://mp.weixin.qq.com/misc/appmsganalysis?action=detailpage&msgid=${msgidParam}&publish_date=${publishDate}&type=int&token=${token}&lang=zh_CN`;
        
        return detailUrl;
        
    } catch (error) {
        console.error('构造详情页面URL失败:', error);
        return null;
    }
}

// 从文章URL中提取参数
function extractUrlParams(url) {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        const sn = urlObj.searchParams.get('sn') || pathParts[pathParts.length - 1];
        
        if (!sn) {
            return null;
        }
        
        return {
            sn: sn,
            host: urlObj.host,
            protocol: urlObj.protocol
        };
    } catch (error) {
        console.error('解析URL失败:', error);
        return null;
    }
}

// 构造数据页面URL
function constructDataPageUrl(urlParams, msgid) {
    // 这里构造进入数据页面的URL
    // 具体URL结构需要根据实际的微信公众号后台页面来确定
    // 暂时使用一个基础的构造方式
    const baseUrl = `${urlParams.protocol}//${urlParams.host}`;
    
    // 尝试构造数据页面URL，这个需要根据实际页面结构调整
    return `${baseUrl}/cgi-bin/appmsg?action=list_ex&begin=0&count=5&fakeid=&type=9&query=&token=&lang=zh_CN&f=json&ajax=1&msgid=${msgid}`;
}

// 更新存储中的记录
async function updateStoredRecord(msgid, newData) {
    try {
        const existingData = await getStoredData();
        const updatedData = existingData.map(record => {
            if (record.msgid == msgid) {
                return {
                    ...record,
                    ...newData,
                    lastUpdateTime: new Date().toISOString()
                };
            }
            return record;
        });
        
        await chrome.storage.local.set({ [STORAGE_KEY]: updatedData });
    } catch (error) {
        console.error('更新记录失败:', error);
        throw error;
    }
}

// 绑定排序事件
function bindSortEvents() {
    const sortableHeaders = document.querySelectorAll('.data-table th.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', handleSort);
    });
}

// 处理排序
function handleSort(event) {
    const header = event.currentTarget;
    const column = header.dataset.sort;
    
    // 确定新的排序方向
    let direction = 'asc';
    if (currentSort.column === column) {
        if (currentSort.direction === 'asc') {
            direction = 'desc';
        } else if (currentSort.direction === 'desc') {
            // 如果当前是降序，再次点击则取消排序
            direction = null;
        }
    }
    
    // 更新排序状态
    currentSort.column = direction ? column : null;
    currentSort.direction = direction;
    
    // 执行排序
    if (direction) {
        sortData(column, direction);
    } else {
        // 恢复原始顺序
        currentData = [...originalData];
    }
    
    // 重置到第一页
    currentPage = 1;
    
    // 更新UI
    updateSortIndicators();
    renderTable();
}

// 排序数据
function sortData(column, direction) {
    currentData.sort((a, b) => {
        let aValue = a[column];
        let bValue = b[column];
        
        // 处理不同类型的数据
        if (column === 'publishTimestamp') {
            aValue = aValue || 0;
            bValue = bValue || 0;
        } else if (column.includes('Ratio')) {
            // 处理百分比字段
            aValue = parseFloat(aValue) || 0;
            bValue = parseFloat(bValue) || 0;
        } else if (typeof aValue === 'string' && !isNaN(aValue)) {
            // 数字字符串转换为数字
            aValue = parseFloat(aValue) || 0;
            bValue = parseFloat(bValue) || 0;
        }
        
        // 比较逻辑
        if (aValue < bValue) {
            return direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
            return direction === 'asc' ? 1 : -1;
        }
        return 0;
    });
}

// 更新排序指示器
function updateSortIndicators() {
    const sortableHeaders = document.querySelectorAll('.data-table th.sortable');
    
    sortableHeaders.forEach(header => {
        const column = header.dataset.sort;
        
        // 移除所有排序类
        header.classList.remove('sorted-asc', 'sorted-desc');
        
        // 添加当前排序类
        if (currentSort.column === column) {
            if (currentSort.direction === 'asc') {
                header.classList.add('sorted-asc');
            } else if (currentSort.direction === 'desc') {
                header.classList.add('sorted-desc');
            }
        }
    });
}

// 处理来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'dataUpdated') {
        loadStoredData();
    }
});
