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

// 导出一些函数供调试使用
window.wxExtractor = {
    checkData: checkWxData,
    captureCurrentPage: captureCurrentPageData,
    captureAll: captureAllData,
    captureDataPage: captureDataPageInfo,
    getMetadata: getPageMetadata,
    formatForExport: formatDataForExport
};
