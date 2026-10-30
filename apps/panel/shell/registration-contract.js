/**
 * Boundary: validate route ownership before a platform enters the shared Vue Router.
 * Names and absolute paths stay under the platform id; nested relative paths inherit it.
 * Optional navigation declares unique module entries pointing to registered routes.
 * This is a trusted-code contract, not a sandbox for arbitrary plugin JavaScript.
 */
export function validatePanelRegistration(registration, manifest) {
  if (!registration || registration.id !== manifest.id || registration.path !== manifest.path
    || typeof registration.label !== 'string' || !registration.label.trim()
    || !Array.isArray(registration.routes) || !registration.routes.length) throw new Error('平台注册信息不完整');
  const prefix = manifest.path;
  const names = new Set();
  const routePaths = new Set();
  const normalized = path => path.replace(/\/+$/, '') || '/';
  const owns = path => typeof path === 'string' && (path === prefix || path.startsWith(`${prefix}/`))
    && !path.includes('..') && !path.includes('\\');
  function visit(routes, parentPaths) {
    if (!Array.isArray(routes)) throw new Error('平台子路由无效');
    for (const route of routes) {
      if (!route || typeof route.path !== 'string') throw new Error('路由缺少路径');
      if ((parentPaths === undefined || route.path.startsWith('/')) && !owns(route.path)) throw new Error('平台路由越界');
      if (route.path.includes('..') || route.path.includes('\\')) throw new Error('平台路由路径无效');
      const fullPaths = route.path.startsWith('/') ? [normalized(route.path)]
        : parentPaths.map(parentPath => normalized(`${parentPath}/${route.path}`));
      for (const path of fullPaths) routePaths.add(path);
      if (route.name != null) {
        if (typeof route.name !== 'string' || !route.name.startsWith(`${manifest.id}.`) || names.has(route.name)) throw new Error('平台路由名称越界或重复');
        names.add(route.name);
      }
      const aliases = route.alias == null ? [] : Array.isArray(route.alias) ? route.alias : [route.alias];
      if (aliases.some(alias => !owns(alias))) throw new Error('路由别名越界');
      for (const alias of aliases) routePaths.add(normalized(alias));
      if (route.redirect != null) throw new Error('平台入口应直接声明页面路由');
      // Vue Router also inherits a parent's aliases for relative child routes.
      if (route.children) visit(route.children, [...new Set([...fullPaths, ...aliases.map(normalized)])]);
    }
  }
  visit(registration.routes);
  if (registration.navigation !== undefined) {
    if (!Array.isArray(registration.navigation) || !registration.navigation.length) throw new Error('平台导航无效');
    const ids = new Set();
    const labels = new Set();
    const paths = new Set();
    for (const item of registration.navigation) {
      if (!item || typeof item.label !== 'string' || !item.label.trim()) throw new Error('导航缺少名称');
      if (!owns(item.path)) throw new Error('平台导航越界');
      const path = normalized(item.path);
      if (!routePaths.has(path)) throw new Error('导航未对应已注册路由');
      const label = item.label.trim().toLocaleLowerCase();
      if (paths.has(path) || labels.has(label)) throw new Error('平台导航重复');
      paths.add(path);
      labels.add(label);
      if (item.id !== undefined) {
        if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id.trim())) throw new Error('导航标识无效或重复');
        ids.add(item.id.trim());
      }
    }
  }
  return registration;
}
