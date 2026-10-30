/**
 * 边界：通用平台注册数据到导航状态的纯函数；不包含平台名称或业务判断。
 * 叶子只选中最具体的一项，避免平台根路径同时高亮所有子模块。
 */
export function normalizedPath(path) {
  return path.replace(/\/+$/, '') || '/';
}

export function ownsPath(base, path) {
  const parent = normalizedPath(base);
  const target = normalizedPath(path);
  return target === parent || target.startsWith(`${parent}/`);
}

export function platformModules(platform) {
  return platform.navigation || [{ label: platform.label, path: platform.path }];
}

export function findActivePlatform(platforms, path) {
  return platforms.filter((platform) => ownsPath(platform.path, path))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

export function findActiveModule(platform, path) {
  if (!platform) return undefined;
  return platformModules(platform).filter((item) => ownsPath(item.path, path))
    .sort((left, right) => right.path.length - left.path.length)[0];
}
