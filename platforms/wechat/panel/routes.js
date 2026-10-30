/** 边界：微信平台独立路由表；页面按需加载，无其他平台依赖。 */
export default [
  {
    path: '/wechat',
    name: 'wechat.instances',
    component: () => import('./pages/InstancesPage.vue'),
    meta: { title: '微信多进程' },
  },
];
