// 微信公众号数据抓取工具 - 后台脚本

// 扩展安装或启动时的初始化
chrome.runtime.onInstalled.addListener((details) => {
    console.log('微信公众号数据抓取工具已安装/更新', details);
    
    // 设置默认配置
    chrome.storage.local.set({
        version: '1.0.0',
        installTime: new Date().toISOString(),
        settings: {
            autoSave: true,
            dataFormat: 'json',
            maxStorageItems: 100
        }
    });
});

// 处理扩展图标点击，打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
    // 检查是否在微信公众号页面
    if (tab.url && tab.url.includes('mp.weixin.qq.com')) {
        // 打开侧边栏
        await chrome.sidePanel.open({ tabId: tab.id });
    } else {
        // 如果不在正确页面，显示通知
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon_128x128.png',
            title: '微信公众号数据抓取工具',
            message: '请在微信公众号后台页面使用此工具'
        });
    }
});

// 监听来自content script和popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('后台脚本收到消息:', request);
    
    switch (request.action) {
        case 'dataExtracted':
            handleDataExtracted(request, sender);
            break;
            
        case 'saveData':
            saveExtractedData(request.data, request.metadata)
                .then(result => sendResponse({ success: true, result }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // 异步响应
            
        case 'getStoredData':
            getStoredData(request.options)
                .then(data => sendResponse({ success: true, data }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // 异步响应
            
        case 'exportData':
            exportData(request.format, request.data)
                .then(result => sendResponse({ success: true, result }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // 异步响应
            
        case 'clearData':
            clearStoredData()
                .then(() => sendResponse({ success: true }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // 异步响应
    }
});

// 处理抓取到的数据
async function handleDataExtracted(request, sender) {
    try {
        const { data, type, timestamp } = request;
        
        // 验证数据
        if (!data || typeof data !== 'object') {
            throw new Error('无效的数据格式');
        }
        
        // 添加元数据
        const enrichedData = {
            ...data,
            extractionInfo: {
                timestamp: timestamp || new Date().toISOString(),
                type: type || 'unknown',
                tabId: sender.tab?.id,
                url: sender.tab?.url,
                version: '1.0.0'
            }
        };
        
        // 自动保存数据（如果启用）
        const settings = await getSettings();
        if (settings.autoSave) {
            await saveExtractedData(enrichedData);
        }
        
        // 更新扩展图标状态
        updateExtensionIcon('success', sender.tab?.id);
        
        console.log('数据处理完成:', enrichedData);
        
    } catch (error) {
        console.error('处理抓取数据时出错:', error);
        updateExtensionIcon('error', sender.tab?.id);
    }
}

// 保存抓取的数据
async function saveExtractedData(data, metadata = {}) {
    try {
        const timestamp = new Date().toISOString();
        const dataId = `wx_data_${Date.now()}`;
        
        const storageData = {
            id: dataId,
            data: data,
            metadata: {
                ...metadata,
                saveTime: timestamp,
                size: JSON.stringify(data).length
            }
        };
        
        // 保存到本地存储
        await chrome.storage.local.set({ [dataId]: storageData });
        
        // 更新数据索引
        await updateDataIndex(dataId, storageData.metadata);
        
        // 清理旧数据（如果超过限制）
        await cleanupOldData();
        
        console.log('数据保存成功:', dataId);
        return { id: dataId, size: storageData.metadata.size };
        
    } catch (error) {
        console.error('保存数据失败:', error);
        throw error;
    }
}

// 获取存储的数据
async function getStoredData(options = {}) {
    try {
        const { limit = 10, offset = 0, sortBy = 'saveTime' } = options;
        
        // 获取数据索引
        const result = await chrome.storage.local.get('dataIndex');
        const index = result.dataIndex || [];
        
        // 排序和分页
        const sortedIndex = index.sort((a, b) => {
            if (sortBy === 'saveTime') {
                return new Date(b.saveTime) - new Date(a.saveTime);
            }
            return 0;
        });
        
        const paginatedIndex = sortedIndex.slice(offset, offset + limit);
        
        // 获取实际数据
        const dataKeys = paginatedIndex.map(item => item.id);
        const storedData = await chrome.storage.local.get(dataKeys);
        
        const results = paginatedIndex.map(indexItem => {
            const data = storedData[indexItem.id];
            return data ? {
                ...indexItem,
                data: data.data,
                fullMetadata: data.metadata
            } : null;
        }).filter(Boolean);
        
        return {
            items: results,
            total: index.length,
            hasMore: offset + limit < index.length
        };
        
    } catch (error) {
        console.error('获取存储数据失败:', error);
        throw error;
    }
}

// 更新数据索引
async function updateDataIndex(dataId, metadata) {
    try {
        const result = await chrome.storage.local.get('dataIndex');
        const index = result.dataIndex || [];
        
        // 添加新的索引条目
        index.push({
            id: dataId,
            saveTime: metadata.saveTime,
            size: metadata.size,
            url: metadata.url || '',
            type: metadata.type || 'unknown'
        });
        
        // 保存更新后的索引
        await chrome.storage.local.set({ dataIndex: index });
        
    } catch (error) {
        console.error('更新数据索引失败:', error);
        throw error;
    }
}

// 清理旧数据
async function cleanupOldData() {
    try {
        const settings = await getSettings();
        const maxItems = settings.maxStorageItems || 100;
        
        const result = await chrome.storage.local.get('dataIndex');
        const index = result.dataIndex || [];
        
        if (index.length > maxItems) {
            // 按时间排序，删除最旧的数据
            const sortedIndex = index.sort((a, b) => new Date(a.saveTime) - new Date(b.saveTime));
            const itemsToDelete = sortedIndex.slice(0, index.length - maxItems);
            
            // 删除数据
            const keysToDelete = itemsToDelete.map(item => item.id);
            await chrome.storage.local.remove(keysToDelete);
            
            // 更新索引
            const newIndex = sortedIndex.slice(index.length - maxItems);
            await chrome.storage.local.set({ dataIndex: newIndex });
            
            console.log(`清理了 ${itemsToDelete.length} 个旧数据项`);
        }
        
    } catch (error) {
        console.error('清理旧数据失败:', error);
    }
}

// 导出数据
async function exportData(format = 'json', data = null) {
    try {
        let exportData;
        
        if (data) {
            exportData = data;
        } else {
            // 导出所有存储的数据
            const storedData = await getStoredData({ limit: 1000 });
            exportData = storedData.items;
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `wx_data_export_${timestamp}`;
        
        let blob;
        let mimeType;
        let fileExtension;
        
        switch (format) {
            case 'json':
                blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                mimeType = 'application/json';
                fileExtension = 'json';
                break;
                
            case 'csv':
                const csvData = convertToCSV(exportData);
                blob = new Blob([csvData], { type: 'text/csv' });
                mimeType = 'text/csv';
                fileExtension = 'csv';
                break;
                
            default:
                throw new Error('不支持的导出格式');
        }
        
        // 创建下载
        const url = URL.createObjectURL(blob);
        await chrome.downloads.download({
            url: url,
            filename: `${filename}.${fileExtension}`,
            saveAs: true
        });
        
        // 清理URL
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        return { filename: `${filename}.${fileExtension}`, size: blob.size };
        
    } catch (error) {
        console.error('导出数据失败:', error);
        throw error;
    }
}

// 清除所有存储的数据
async function clearStoredData() {
    try {
        const result = await chrome.storage.local.get('dataIndex');
        const index = result.dataIndex || [];
        
        // 删除所有数据项
        const keysToDelete = index.map(item => item.id);
        keysToDelete.push('dataIndex'); // 也删除索引
        
        await chrome.storage.local.remove(keysToDelete);
        
        console.log('所有数据已清除');
        
    } catch (error) {
        console.error('清除数据失败:', error);
        throw error;
    }
}

// 获取设置
async function getSettings() {
    try {
        const result = await chrome.storage.local.get('settings');
        return result.settings || {
            autoSave: true,
            dataFormat: 'json',
            maxStorageItems: 100
        };
    } catch (error) {
        console.error('获取设置失败:', error);
        return {};
    }
}

// 更新扩展图标状态
function updateExtensionIcon(status, tabId) {
    try {
        let iconPath;
        let title;
        
        switch (status) {
            case 'success':
                iconPath = 'icons/icon_32x32.png';
                title = '数据抓取成功';
                break;
            case 'error':
                iconPath = 'icons/icon_32x32.png';
                title = '数据抓取失败';
                break;
            default:
                iconPath = 'icons/icon_32x32.png';
                title = '微信公众号数据抓取工具';
        }
        
        chrome.action.setIcon({ path: iconPath, tabId });
        chrome.action.setTitle({ title, tabId });
        
    } catch (error) {
        console.error('更新图标状态失败:', error);
    }
}

// 简单的CSV转换函数
function convertToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) {
        return '';
    }
    
    // 提取文章信息
    const articles = [];
    data.forEach(item => {
        if (item.data && item.data.publish_list) {
            item.data.publish_list.forEach(publish => {
                if (publish.appmsg_info) {
                    publish.appmsg_info.forEach(article => {
                        articles.push({
                            title: article.title || '',
                            read_num: article.read_num || 0,
                            like_num: article.like_num || 0,
                            comment_num: article.comment_num || 0,
                            share_num: article.share_num || 0,
                            content_url: article.content_url || '',
                            publish_time: publish.view?.publishDate || '',
                            extract_time: item.saveTime || ''
                        });
                    });
                }
            });
        }
    });
    
    if (articles.length === 0) {
        return '';
    }
    
    // 生成CSV头部
    const headers = Object.keys(articles[0]);
    const csvRows = [headers.join(',')];
    
    // 生成CSV数据行
    articles.forEach(article => {
        const row = headers.map(header => {
            const value = article[header];
            // 处理包含逗号或引号的值
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
}

console.log('微信公众号数据抓取工具后台脚本已加载');
