/**
 * Boundary: validate route ownership before a platform enters the shared Vue Router.
 * Names and absolute paths stay under the platform id; nested relative paths inherit it.
 * This is a trusted-code contract, not a sandbox for arbitrary plugin JavaScript.
 */
export function validatePanelRegistration(registration, manifest) {
  if (!registration || registration.id !== manifest.id || registration.path !== manifest.path
    || typeof registration.label !== 'string' || !registration.label.trim()
    || !Array.isArray(registration.routes) || !registration.routes.length) throw new Error('平台注册信息不完整');
  const prefix = manifest.path;
  const names = new Set();
  const owns = path => typeof path === 'string' && (path === prefix || path.startsWith(`${prefix}/`))
    && !path.includes('..') && !path.includes('\\');
  function visit(routes, nested = false) {
    for (const route of routes) {
      if (!route || typeof route.path !== 'string') throw new Error('路由缺少路径');
      if ((!nested || route.path.startsWith('/')) && !owns(route.path)) throw new Error('平台路由越界');
      if (route.path.includes('..') || route.path.includes('\\')) throw new Error('平台路由路径无效');
      if (route.name != null) {
        if (typeof route.name !== 'string' || !route.name.startsWith(`${manifest.id}.`) || names.has(route.name)) throw new Error('平台路由名称越界或重复');
        names.add(route.name);
      }
      const aliases = route.alias == null ? [] : Array.isArray(route.alias) ? route.alias : [route.alias];
      if (aliases.some(alias => !owns(alias))) throw new Error('路由别名越界');
      if (route.redirect != null) throw new Error('平台入口应直接声明页面路由');
      if (route.children) visit(route.children, true);
    }
  }
  visit(registration.routes);
  return registration;
}
