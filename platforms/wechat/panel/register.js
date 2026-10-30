/** 边界：微信面板的唯一发现入口；仅声明导航与本平台路由，不修改宿主。 */
import { MessagesSquare } from 'lucide-vue-next';
import routes from './routes.js';

export default {
  id: 'wechat',
  label: '微信',
  path: '/wechat',
  icon: MessagesSquare,
  routes,
};
