/**
 * 认证中间件
 * 用于保护需要登录才能访问的路由
 */

/**
 * 检查用户是否已认证
 * 如果未认证，重定向到登录页面
 */
function isAuthenticated(req, res, next) {
  console.log('认证检查:');
  console.log('- 请求路径:', req.path);
  console.log('- 会话 ID:', req.session?.id);
  console.log('- 会话认证状态:', req.session?.isAuthenticated);
  console.log('- Cookie 认证状态:', req.cookies?.auth);
  console.log('- 认证功能启用:', req.app.locals.config.authEnabled);

  // 如果认证功能未启用，直接通过
  if (!req.app.locals.config.authEnabled) {
    console.log('- 认证功能未启用，直接通过');
    return next();
  }

  // 检查会话中是否有认证标记
  if (req.session && req.session.isAuthenticated) {
    console.log('- 会话认证成功，允许访问');
    return next();
  }

  // 检查 Cookie 中是否有认证标记
  if (req.cookies && req.cookies.auth === 'true') {
    console.log('- Cookie 认证成功，允许访问');
    // 如果只有 Cookie 认证成功，同步到会话
    req.session.isAuthenticated = true;
    return next();
  }

  // 未认证，重定向到登录页面
  console.log('- 未认证，重定向到登录页面');
  res.redirect('/login');
}

/**
 * 检查用户是否为管理员
 * 如果不是管理员,返回403错误
 */
function requireAdmin(req, res, next) {
  console.log('管理员权限检查:');
  console.log('- 请求路径:', req.path);
  console.log('- 会话管理员状态:', req.session?.isAdmin);
  console.log('- Cookie 管理员状态:', req.cookies?.isAdmin);

  // 检查会话中的管理员标记
  const isAdmin = req.session?.isAdmin === true || req.cookies?.isAdmin === 'true';

  if (isAdmin) {
    console.log('- 管理员权限验证通过');
    return next();
  }

  // 不是管理员，返回403错误
  console.log('- 权限不足，拒绝访问');
  res.status(403).render('error', {
    title: '权限不足',
    message: '您没有权限访问此页面，请使用管理员账号登录'
  });
}

module.exports = {
  isAuthenticated,
  requireAdmin
};
