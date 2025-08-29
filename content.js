// 微信公众号数据抓取内容脚本

// 等待页面完全加载
let isReady = false;
let wxData = null;

// 初始化
function init() {
    // 等待页面数据加载
    const checkInterval = setInterval(() => {
        if (checkWxData()) {
            clearInterval(checkInterval);
            isReady = true;
        }
    }, 1000);
    
    // 10秒后停止检查
    setTimeout(() => {
        clearInterval(checkInterval);
    }, 10000);
}

// 检查是否存在微信数据
function checkWxData() {
    try {
        // 检查 window.wx.cgiData
        if (window.wx && window.wx.cgiData) {
            wxData = window.wx.cgiData;
            return true;
        }
        
        // 检查 window.cgiData
        if (window.cgiData) {
            wxData = window.cgiData;
            return true;
        }
        
        // 检查页面上的其他可能数据源
        if (window.__INITIAL_STATE__) {
            wxData = window.__INITIAL_STATE__;
            return true;
        }
        
        // 检查 React 或 Vue 应用数据
        const scripts = document.querySelectorAll('script');
        for (let script of scripts) {
            const content = script.textContent || '';
            if (content.includes('publish_list') || content.includes('appmsg_info') || content.includes('share_imageinfo')) {
                try {
                    // 尝试提取JSON数据
                    const matches = content.match(/({.*publish_list.*})/);
                    if (matches) {
                        wxData = JSON.parse(matches[1]);
                        return true;
                    }
                } catch (e) {
                    // 解析失败，继续尝试其他方式
                }
            }
        }
        
        // 检查页面中的表格数据或列表
        const tables = document.querySelectorAll('table');
        const lists = document.querySelectorAll('[class*="list"], [class*="item"]');
        
        if (tables.length > 0 || lists.length > 0) {
            
            // 尝试从DOM中提取数据
            const extractedData = extractDataFromDOM();
            if (extractedData) {
                wxData = extractedData;
                return true;
            }
        }
        
        // 检查是否是特定的发布页面
        if (window.location.href.includes('appmsgpublish')) {
            // 对于发布页面，可能需要等待数据加载
            return false; // 暂时返回false，让定时器继续检查
        }
        
        return false;
    } catch (error) {
        console.error('检查微信数据时出错:', error);
        return false;
    }
}

// 抓取当前页数据
function captureCurrentPageData() {
    try {
        if (!checkWxData()) {
            throw new Error('未找到微信数据');
        }
        
        // 返回当前页的数据
        const currentData = {
            ...wxData,
            timestamp: new Date().toISOString(),
            captureType: 'current_page',
            pageUrl: window.location.href
        };
        
        return currentData;
        
    } catch (error) {
        console.error('抓取当前页数据失败:', error);
        throw error;
    }
}

// 抓取全部数据
function captureAllData() {
    try {
        const dataCheck = checkWxData();
        
        if (!dataCheck) {
            throw new Error('未找到微信数据');
        }
        
        // 获取所有可用的数据
        const allData = {
            cgiData: wxData,
            pageInfo: {
                url: window.location.href,
                title: document.title,
                timestamp: new Date().toISOString()
            },
            captureType: 'all_data'
        };
        
        // 尝试获取页面上的其他相关数据
        try {
            // 检查是否有其他全局数据
            if (window.wx && window.wx.data) {
                allData.additionalWxData = window.wx.data;
            }
            
            // 检查是否有用户信息
            if (window.wx && window.wx.data && window.wx.data.user_name) {
                allData.accountInfo = {
                    user_name: window.wx.data.user_name,
                    nick_name: window.wx.data.nick_name || ''
                };
            }
        } catch (e) {
            // 获取额外数据时出错，继续使用基础数据
        }
        
        return allData;
        
    } catch (error) {
        console.error('抓取全部数据失败:', error);
        throw error;
    }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    try {
        switch (request.action) {
            case 'checkData':
                const hasData = checkWxData();
                sendResponse({ hasData, isReady });
                break;
                
            case 'captureCurrentPage':
                const currentData = captureCurrentPageData();
                sendResponse({ success: true, data: currentData });
                break;
                
            case 'captureAllData':
                const allData = captureAllData();
                sendResponse({ success: true, data: allData });
                break;
                
            case 'captureDataPageInfo':
                const dataPageInfo = captureDataPageInfo(request.msgid);
                sendResponse({ success: true, data: dataPageInfo });
                break;
                
            case 'getToken':
                const token = getTokenFromPage();
                sendResponse({ success: true, token: token });
                break;
                
            // 分页抓取相关操作
            case 'detectPagination':
                const paginationInfo = detectPagination();
                sendResponse({ success: true, pagination: paginationInfo });
                break;
                
            case 'startPaginationCapture':
                // 立即响应启动请求
                sendResponse({ success: true, message: '分页抓取已启动' });
                
                // 异步处理分页抓取
                setTimeout(async () => {
                    try {
                        await startPaginationCapture({
                            onProgress: (progress) => {
                                // 发送进度更新到sidebar
                                chrome.runtime.sendMessage({
                                    action: 'paginationProgress',
                                    progress: progress
                                }).catch(err => console.warn('发送进度消息失败:', err));
                            },
                            onComplete: (data) => {
                                // 发送完成通知到sidebar
                                chrome.runtime.sendMessage({
                                    action: 'paginationComplete',
                                    data: data
                                }).catch(err => console.warn('发送完成消息失败:', err));
                            },
                            onError: (error) => {
                                // 发送错误通知到sidebar
                                chrome.runtime.sendMessage({
                                    action: 'paginationError',
                                    error: error.message
                                }).catch(err => console.warn('发送错误消息失败:', err));
                            }
                        });
                    } catch (error) {
                        console.error('分页抓取执行失败:', error);
                        chrome.runtime.sendMessage({
                            action: 'paginationError',
                            error: error.message
                        }).catch(err => console.warn('发送错误消息失败:', err));
                    }
                }, 100);
                break;
                
            case 'stopPaginationCapture':
                const stoppedData = stopPaginationCapture();
                sendResponse({ success: true, data: stoppedData });
                break;
                
            case 'getPaginationStatus':
                const status = getPaginationStatus();
                sendResponse({ success: true, status: status });
                break;
                
            default:
                sendResponse({ error: '未知的操作' });
        }
    } catch (error) {
        console.error('处理消息时出错:', error);
        sendResponse({ 
            success: false, 
            error: error.message || '操作失败' 
        });
    }
    
    // 返回true表示异步响应
    return true;
});

// 向background script发送数据
function sendDataToBackground(data, type) {
    chrome.runtime.sendMessage({
        action: 'dataExtracted',
        data: data,
        type: type,
        timestamp: new Date().toISOString()
    });
}

// 自动检测数据变化
let lastDataStr = '';
function watchDataChanges() {
    setInterval(() => {
        if (checkWxData()) {
            const currentDataStr = JSON.stringify(wxData);
            if (currentDataStr !== lastDataStr) {
                lastDataStr = currentDataStr;
                
                // 可以在这里发送通知给background script
                sendDataToBackground(wxData, 'auto_detected');
            }
        }
    }, 5000); // 每5秒检查一次
}

// 页面工具函数
function getPageMetadata() {
    return {
        title: document.title,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        domain: window.location.hostname
    };
}

// 数据验证函数
function validateWxData(data) {
    if (!data) return false;
    
    // 检查必要的字段
    const requiredFields = ['publish_list'];
    for (const field of requiredFields) {
        if (!(field in data)) {
            console.warn(`数据中缺少必要字段: ${field}`);
            return false;
        }
    }
    
    return true;
}

// 格式化数据用于导出
function formatDataForExport(data, type = 'json') {
    const metadata = getPageMetadata();
    
    const exportData = {
        metadata,
        extractedData: data,
        extractionTime: new Date().toISOString(),
        version: '1.0.0'
    };
    
    switch (type) {
        case 'json':
            return JSON.stringify(exportData, null, 2);
        case 'csv':
            // 如果需要CSV格式，可以在这里实现
            return convertToCSV(exportData);
        default:
            return exportData;
    }
}

// 从DOM中提取数据
function extractDataFromDOM() {
    try {
        // 检查是否有文章列表
        const articleElements = document.querySelectorAll('[class*="article"], [class*="msg"], [class*="item"]');
        
        if (articleElements.length === 0) {
            return null;
        }
        
        const extractedData = {
            source: 'DOM_EXTRACTION',
            publish_list: [],
            total_count: articleElements.length,
            extract_time: new Date().toISOString(),
            page_url: window.location.href
        };
        
        articleElements.forEach((element, index) => {
            try {
                const titleElement = element.querySelector('[class*="title"], h1, h2, h3, .title, .subject');
                const title = titleElement ? titleElement.textContent.trim() : `文章 ${index + 1}`;
                
                // 尝试提取数字数据
                const textContent = element.textContent || '';
                const numbers = textContent.match(/\d+/g) || [];
                
                const article = {
                    type: 9,
                    msgid: 1000000000 + index,
                    appmsg_info: [{
                        title: title,
                        content_url: '',
                        read_num: 0,
                        like_num: 0,
                        comment_num: 0,
                        share_num: 0,
                        extractedFromDOM: true,
                        domIndex: index
                    }]
                };
                
                // 尝试从文本中提取数字（阅读量、点赞数等）
                if (numbers.length > 0) {
                    article.appmsg_info[0].read_num = parseInt(numbers[0]) || 0;
                    if (numbers.length > 1) {
                        article.appmsg_info[0].like_num = parseInt(numbers[1]) || 0;
                    }
                    if (numbers.length > 2) {
                        article.appmsg_info[0].comment_num = parseInt(numbers[2]) || 0;
                    }
                }
                
                extractedData.publish_list.push(article);
            } catch (e) {
                // 提取失败，跳过该文章
            }
        });
        
        return extractedData;
        
    } catch (error) {
        console.error('DOM数据提取失败:', error);
        return null;
    }
}

// 简单的CSV转换函数（可选）
function convertToCSV(data) {
    // 这里可以实现JSON到CSV的转换
    // 暂时返回JSON字符串
    return JSON.stringify(data, null, 2);
}

// 初始化脚本
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// 开始监控数据变化
setTimeout(watchDataChanges, 3000);

// 抓取数据页面信息
function captureDataPageInfo(msgid) {
    try {
        
        // 检查是否在数据页面
        if (!window.location.href.includes('mp.weixin.qq.com')) {
            throw new Error('不在正确的页面');
        }
        
        // 等待页面加载完成
        const maxWaitTime = 5000; // 最多等待5秒
        const startTime = Date.now();
        
        const checkData = () => {
            // 尝试查找包含统计数据的元素
            // 这里需要根据实际页面结构来查找数据
            
            // 查找可能包含数据的元素
            const dataElements = document.querySelectorAll([
                '.weui-desktop-mass-media__opr__meta',
                '[class*="data"]',
                '[class*="stat"]',
                '[class*="count"]',
                '[class*="number"]'
            ].join(','));
            
            if (dataElements.length > 0) {
                // 提取数据
                const extractedData = extractDataFromPage();
                return extractedData;
            }
            
            // 如果没有找到数据元素，但时间还没到，继续等待
            if (Date.now() - startTime < maxWaitTime) {
                setTimeout(checkData, 500);
                return null;
            }
            
            throw new Error('未找到数据元素');
        };
        
        return checkData();
        
    } catch (error) {
        console.error('抓取数据页面信息失败:', error);
        throw error;
    }
}

// 从数据页面提取信息
function extractDataFromPage() {
    try {
        const pageData = {
            url: window.location.href,
            title: document.title,
            extractTime: new Date().toISOString()
        };
        
        // 查找具体的数据元素
        // 这里需要根据您提供的页面结构来实现具体的数据提取
        
        // 查找阅读量、点赞数等统计数据
        const numberElements = document.querySelectorAll('[class*="number"], [class*="count"], [class*="stat"]');
        // 处理数字元素和统计按钮
        numberElements.forEach((element, index) => {
            const text = element.textContent || element.innerText;
            const numbers = text.match(/[\d,]+/g);
            // 这里可以添加数据处理逻辑
        });
        
        // 查找包含统计图标的按钮
        const statButtons = document.querySelectorAll('.weui-desktop-mass-media__opr__meta button');
        statButtons.forEach((button, index) => {
            const tooltip = button.querySelector('.weui-desktop-tooltip');
            // 这里可以添加按钮处理逻辑
        });
        
        // 临时返回基础页面信息，等待您提供具体的数据抓取逻辑
        return pageData;
        
    } catch (error) {
        console.error('提取页面数据失败:', error);
        throw error;
    }
}

// 从页面获取token
function getTokenFromPage() {
    try {
        // 方法1: 从URL参数中获取
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken) {
            return urlToken;
        }
        
        // 方法2: 从全局变量中获取
        if (window.wx && window.wx.data && window.wx.data.token) {
            return window.wx.data.token;
        }
        
        // 方法3: 从script标签中提取
        const scripts = document.querySelectorAll('script');
        for (let script of scripts) {
            const content = script.textContent || '';
            const tokenMatch = content.match(/token['"]*:\s*['"]*(\d+)['"]*/) || 
                              content.match(/token['"]*=['"]*(\d+)['"]*/) ||
                              content.match(/['"]*token['"]*['"]*(\d+)['"]*/) ||
                              content.match(/token.*?(\d{8,})/);
            if (tokenMatch && tokenMatch[1]) {
                return tokenMatch[1];
            }
        }
        
        // 方法4: 从页面元素的data属性中获取
        const elements = document.querySelectorAll('[data-token]');
        for (let element of elements) {
            const token = element.dataset.token;
            if (token) {
                return token;
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('获取token失败:', error);
        return null;
    }
}

// 分页抓取相关功能
let paginationState = {
    isRunning: false,
    currentPage: 1,
    totalPages: 0,
    collectedData: [],
    startTime: null,
    onProgress: null,
    onComplete: null,
    onError: null
};

// 检测分页元素
function detectPagination() {
    try {
        // 检测微信后台的分页结构
        const paginationContainer = document.querySelector('.weui-desktop-pagination');
        if (!paginationContainer) {
            console.log('未找到分页容器');
            return null;
        }
        
        // 获取当前页码
        const currentPageElement = paginationContainer.querySelector('.weui-desktop-pagination__num_current');
        const currentPage = currentPageElement ? parseInt(currentPageElement.textContent) : 1;
        
        // 获取所有页码
        const pageNumbers = paginationContainer.querySelectorAll('.weui-desktop-pagination__num');
        let totalPages = 1;
        
        if (pageNumbers.length > 0) {
            const pageNums = Array.from(pageNumbers).map(el => parseInt(el.textContent) || 0).filter(num => num > 0);
            totalPages = pageNums.length > 0 ? Math.max(...pageNums) : 1;
        }
        
        // 检测下一页按钮 - 更严格的检测
        const nextButtons = paginationContainer.querySelectorAll('.weui-desktop-btn');
        let nextButton = null;
        let hasNextPage = false;
        
        for (const btn of nextButtons) {
            const btnText = btn.textContent.trim();
            if (btnText.includes('下一页')) {
                nextButton = btn;
                // 检查按钮是否被禁用
                hasNextPage = !btn.classList.contains('weui-desktop-btn_disabled') && 
                             !btn.disabled && 
                             btn.style.display !== 'none';
                break;
            }
        }
        
        console.log('分页检测结果:', {
            currentPage,
            totalPages,
            hasNextPage,
            nextButtonFound: !!nextButton
        });
        
        return {
            currentPage,
            totalPages,
            hasNextPage,
            nextButton,
            paginationContainer
        };
        
    } catch (error) {
        console.error('分页检测失败:', error);
        return null;
    }
}

// 点击下一页
function clickNextPage() {
    return new Promise((resolve, reject) => {
        try {
            const pagination = detectPagination();
            if (!pagination || !pagination.hasNextPage) {
                reject(new Error('没有下一页或分页按钮不可用'));
                return;
            }
            
            // 点击下一页按钮
            pagination.nextButton.click();
            
            // 等待页面开始加载
            setTimeout(() => {
                resolve(true);
            }, 500);
            
        } catch (error) {
            reject(error);
        }
    });
}

// 等待页面数据加载完成
function waitForPageLoad(timeout = 15000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let checkCount = 0;
        
        const checkLoad = () => {
            checkCount++;
            const elapsed = Date.now() - startTime;
            
            // 发送加载状态到UI
            if (paginationState.onProgress) {
                paginationState.onProgress({
                    currentPage: paginationState.currentPage,
                    totalPages: paginationState.totalPages,
                    collectedCount: paginationState.collectedData.length,
                    currentPageCount: 0,
                    isLoading: true,
                    loadingMessage: `等待第 ${paginationState.currentPage} 页数据加载... (${Math.round(elapsed/1000)}s)`
                });
            }
            
            // 检查是否有数据
            if (checkWxData()) {
                console.log(`第 ${paginationState.currentPage} 页数据加载完成，检查次数: ${checkCount}, 耗时: ${elapsed}ms`);
                resolve(true);
                return;
            }
            
            // 检查是否超时
            if (elapsed > timeout) {
                reject(new Error(`页面加载超时，已尝试 ${checkCount} 次，耗时 ${Math.round(elapsed/1000)} 秒`));
                return;
            }
            
            // 更频繁的检查 - 每500ms检查一次
            setTimeout(checkLoad, 500);
        };
        
        checkLoad();
    });
}

// 开始分页抓取
async function startPaginationCapture(options = {}) {
    try {
        if (paginationState.isRunning) {
            throw new Error('分页抓取已在运行中');
        }
        
        // 初始化状态
        paginationState.isRunning = true;
        paginationState.collectedData = [];
        paginationState.startTime = new Date();
        paginationState.onProgress = options.onProgress;
        paginationState.onComplete = options.onComplete;
        paginationState.onError = options.onError;
        
        // 检测初始分页状态
        const initialPagination = detectPagination();
        if (!initialPagination) {
            throw new Error('未检测到分页结构');
        }
        
        paginationState.currentPage = initialPagination.currentPage;
        paginationState.totalPages = initialPagination.totalPages;
        
        console.log(`开始分页抓取，当前第 ${paginationState.currentPage} 页，共 ${paginationState.totalPages} 页`);
        
        // 抓取当前页数据
        await captureCurrentPageInPagination();
        
        // 继续抓取后续页面
        await captureRemainingPages();
        
        // 完成抓取
        completePaginationCapture();
        
    } catch (error) {
        console.error('分页抓取失败:', error);
        paginationState.isRunning = false;
        if (paginationState.onError) {
            paginationState.onError(error);
        }
        throw error;
    }
}

// 抓取当前页数据
async function captureCurrentPageInPagination() {
    try {
        // 等待数据加载
        await waitForPageLoad();
        
        // 抓取数据
        const pageData = captureCurrentPageData();
        let articles = [];
        
        // 处理不同的数据结构
        if (pageData && pageData.cgiData) {
            articles = pageData.cgiData.publish_list || [];
        } else if (pageData && pageData.publish_list) {
            articles = pageData.publish_list;
        } else if (pageData && Array.isArray(pageData)) {
            articles = pageData;
        }
        
        if (articles.length > 0) {
            paginationState.collectedData.push(...articles);
            
            console.log(`第 ${paginationState.currentPage} 页抓取完成，获取 ${articles.length} 条数据`);
            
            // 报告进度
            if (paginationState.onProgress) {
                paginationState.onProgress({
                    currentPage: paginationState.currentPage,
                    totalPages: paginationState.totalPages,
                    collectedCount: paginationState.collectedData.length,
                    currentPageCount: articles.length
                });
            }
        } else {
            console.warn(`第 ${paginationState.currentPage} 页未找到有效数据，页面数据结构:`, pageData);
            
            // 即使没有数据也要报告进度
            if (paginationState.onProgress) {
                paginationState.onProgress({
                    currentPage: paginationState.currentPage,
                    totalPages: paginationState.totalPages,
                    collectedCount: paginationState.collectedData.length,
                    currentPageCount: 0
                });
            }
        }
        
    } catch (error) {
        console.error(`第 ${paginationState.currentPage} 页抓取失败:`, error);
        throw error;
    }
}

// 抓取剩余页面
async function captureRemainingPages() {
    while (paginationState.isRunning) {
        // 检查是否还有下一页
        const pagination = detectPagination();
        if (!pagination || !pagination.hasNextPage) {
            console.log('已到达最后一页，抓取完成');
            break;
        }
        
        try {
            // 发送翻页状态
            if (paginationState.onProgress) {
                paginationState.onProgress({
                    currentPage: paginationState.currentPage,
                    totalPages: paginationState.totalPages,
                    collectedCount: paginationState.collectedData.length,
                    currentPageCount: 0,
                    isNavigating: true,
                    loadingMessage: `正在翻到第 ${paginationState.currentPage + 1} 页...`
                });
            }
            
            // 点击下一页
            await clickNextPage();
            
            // 更新当前页码
            paginationState.currentPage++;
            
            console.log(`已点击下一页，当前第 ${paginationState.currentPage} 页，等待数据加载...`);
            
            // 发送等待状态
            if (paginationState.onProgress) {
                paginationState.onProgress({
                    currentPage: paginationState.currentPage,
                    totalPages: paginationState.totalPages,
                    collectedCount: paginationState.collectedData.length,
                    currentPageCount: 0,
                    isNavigating: false,
                    isLoading: true,
                    loadingMessage: `第 ${paginationState.currentPage} 页切换完成，等待数据加载...`
                });
            }
            
            // 短暂等待页面开始切换
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 抓取当前页数据（内部会等待数据加载）
            await captureCurrentPageInPagination();
            
        } catch (error) {
            console.error(`翻页或抓取第 ${paginationState.currentPage} 页失败:`, error);
            
            // 如果是因为没有下一页，正常结束
            if (error.message.includes('没有下一页')) {
                console.log('检测到无下一页，结束抓取');
                break;
            }
            
            // 其他错误，发送错误状态并重试一次
            if (paginationState.onProgress) {
                paginationState.onProgress({
                    currentPage: paginationState.currentPage,
                    totalPages: paginationState.totalPages,
                    collectedCount: paginationState.collectedData.length,
                    currentPageCount: 0,
                    hasError: true,
                    loadingMessage: `第 ${paginationState.currentPage} 页出错，正在重试...`
                });
            }
            
            console.log('等待3秒后重试当前页...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            try {
                await captureCurrentPageInPagination();
            } catch (retryError) {
                console.error('重试失败，跳过当前页:', retryError);
                
                if (paginationState.onProgress) {
                    paginationState.onProgress({
                        currentPage: paginationState.currentPage,
                        totalPages: paginationState.totalPages,
                        collectedCount: paginationState.collectedData.length,
                        currentPageCount: 0,
                        hasError: true,
                        loadingMessage: `第 ${paginationState.currentPage} 页重试失败，跳过该页`
                    });
                }
                
                // 等待一下再继续下一页
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
}

// 完成分页抓取
function completePaginationCapture() {
    const endTime = new Date();
    const duration = Math.round((endTime - paginationState.startTime) / 1000);
    
    console.log(`分页抓取完成！共抓取 ${paginationState.collectedData.length} 条数据，耗时 ${duration} 秒`);
    
    // 构造完整数据结构
    const completeData = {
        publish_list: paginationState.collectedData,
        total_count: paginationState.collectedData.length,
        pages_captured: paginationState.currentPage,
        capture_time: endTime.toISOString(),
        duration_seconds: duration
    };
    
    paginationState.isRunning = false;
    
    if (paginationState.onComplete) {
        paginationState.onComplete(completeData);
    }
}

// 停止分页抓取
function stopPaginationCapture() {
    if (paginationState.isRunning) {
        console.log('用户手动停止分页抓取');
        paginationState.isRunning = false;
        
        // 返回已抓取的数据
        const partialData = {
            publish_list: paginationState.collectedData,
            total_count: paginationState.collectedData.length,
            pages_captured: paginationState.currentPage,
            capture_time: new Date().toISOString(),
            stopped_manually: true
        };
        
        if (paginationState.onComplete) {
            paginationState.onComplete(partialData);
        }
        
        return partialData;
    }
    
    return null;
}

// 获取分页抓取状态
function getPaginationStatus() {
    return {
        isRunning: paginationState.isRunning,
        currentPage: paginationState.currentPage,
        totalPages: paginationState.totalPages,
        collectedCount: paginationState.collectedData.length,
        startTime: paginationState.startTime
    };
}

// 导出一些函数供调试使用
window.wxExtractor = {
    checkData: checkWxData,
    captureCurrentPage: captureCurrentPageData,
    captureAll: captureAllData,
    captureDataPage: captureDataPageInfo,
    getMetadata: getPageMetadata,
    formatForExport: formatDataForExport,
    // 分页功能
    detectPagination: detectPagination,
    startPaginationCapture: startPaginationCapture,
    stopPaginationCapture: stopPaginationCapture,
    getPaginationStatus: getPaginationStatus
};
