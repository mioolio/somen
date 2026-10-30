/** 边界：微信平台独立路由表；页面按需加载，无其他平台依赖。 */
export default [
  {
    path: '/wechat',
    name: 'wechat.instances',
    component: () => import('./pages/InstancesPage.vue'),
    meta: { title: '平台选择器' },
  },
  {
    path: '/wechat/workspace',
    name: 'wechat.workspace',
    component: () => import('./pages/WorkspacePage.vue'),
    meta: { title: '工作' },
  },
];
