const { run, get, query } = require('./db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

/**
 * 生成安全的随机ID（16位）
 * @returns {string} 返回16位随机字符串
 */
function generateSecureId() {
  return crypto.randomBytes(8).toString('hex'); // 16个字符
}

/**
 * 生成随机密码（6位数字+字母）
 * @returns {string} 返回6位随机密码
 */
function generateRandomPassword() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let password = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    password += chars[randomIndex];
  }
  return password;
}

/**
 * 创建新页面
 * @param {string} htmlContent HTML内容
 * @param {boolean} isProtected 是否启用密码保护
 * @param {string} codeType 代码类型（html, markdown, svg, mermaid）
 * @param {number} expiryDays 有效期天数（0表示永久）
 * @param {string} viewPassword 查看密码（可选）
 * @returns {Promise<Object>} 返回生成的URL ID和密码
 */
async function createPage(htmlContent, isProtected = false, codeType = 'html', expiryDays = 0, viewPassword = '') {
  try {
    // 生成安全的16位随机ID
    const urlId = generateSecureId();

    // 生成随机密码（6位字母+数字）
    const password = generateRandomPassword();
    console.log('生成密码:', password);

    // 使用bcrypt加密密码后存储
    const hashedPassword = await bcrypt.hash(password, 10);

    // 计算过期时间（如果设置了有效期）
    const expiresAt = expiryDays > 0 ? Date.now() + (expiryDays * 24 * 60 * 60 * 1000) : null;

    // 加密查看密码（如果设置了）
    const hashedViewPassword = viewPassword ? await bcrypt.hash(viewPassword, 10) : null;

    console.log('有效期:', expiryDays > 0 ? `${expiryDays}天` : '永久');
    console.log('查看密码:', viewPassword ? '已设置' : '未设置');

    // 保存到数据库
    await run(
      'INSERT INTO pages (id, html_content, created_at, password, is_protected, code_type, expires_at, view_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [urlId, htmlContent, Date.now(), hashedPassword, isProtected ? 1 : 0, codeType, expiresAt, hashedViewPassword]
    );

    return { urlId, password };
  } catch (error) {
    console.error('创建页面错误:', error);
    throw error;
  }
}

/**
 * 通过ID获取页面
 * @param {string} id 页面ID
 * @returns {Promise<Object|null>} 返回页面对象或null
 */
async function getPageById(id) {
  try {
    return await get('SELECT * FROM pages WHERE id = ?', [id]);
  } catch (error) {
    console.error('获取页面错误:', error);
    throw error;
  }
}

/**
 * 获取最近创建的页面列表
 * @param {number} limit 限制数量
 * @returns {Promise<Array>} 返回页面列表
 */
async function getRecentPages(limit = 10) {
  try {
    return await query(
      'SELECT id, created_at FROM pages ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  } catch (error) {
    console.error('获取最近页面错误:', error);
    throw error;
  }
}

/**
 * 获取所有页面（用于管理后台）
 * @returns {Promise<Array>} 返回所有页面列表
 */
async function getAllPages() {
  try {
    return await query(
      'SELECT id, code_type, is_protected, created_at, expires_at, view_password, LENGTH(html_content) as content_size FROM pages ORDER BY created_at DESC',
      []
    );
  } catch (error) {
    console.error('获取所有页面错误:', error);
    throw error;
  }
}

/**
 * 删除页面
 * @param {string} id 页面ID
 * @returns {Promise<boolean>} 返回是否删除成功
 */
async function deletePage(id) {
  try {
    await run('DELETE FROM pages WHERE id = ?', [id]);
    return true;
  } catch (error) {
    console.error('删除页面错误:', error);
    throw error;
  }
}

/**
 * 获取页面总数
 * @returns {Promise<number>} 返回页面总数
 */
async function getPageCount() {
  try {
    const result = await get('SELECT COUNT(*) as count FROM pages', []);
    return result ? result.count : 0;
  } catch (error) {
    console.error('获取页面数量错误:', error);
    throw error;
  }
}

/**
 * 清理过期页面
 * @returns {Promise<number>} 返回删除的页面数量
 */
async function cleanupExpiredPages() {
  try {
    const now = Date.now();
    const result = await run(
      'DELETE FROM pages WHERE expires_at IS NOT NULL AND expires_at < ?',
      [now]
    );
    const deletedCount = result.changes || 0;
    if (deletedCount > 0) {
      console.log(`[清理任务] 已删除 ${deletedCount} 个过期页面`);
    }
    return deletedCount;
  } catch (error) {
    console.error('清理过期页面错误:', error);
    throw error;
  }
}

module.exports = {
  createPage,
  getPageById,
  getRecentPages,
  getAllPages,
  deletePage,
  getPageCount,
  cleanupExpiredPages
};
