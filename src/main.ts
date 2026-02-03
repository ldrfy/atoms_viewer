import { createApp, watch } from 'vue';
import { ConfigProvider } from 'antdv-next';
import App from './App.vue';
import { i18n, t as i18nT } from './i18n';
import { APP_DISPLAY_NAME } from './lib/appMeta';

import 'antdv-next/dist/reset.css';
import './style.css';

const app = createApp(App);
app.use(i18n);
// 让静态方法使用当前应用上下文（含语言/主题）
// Allow static methods to use current app context (locale/theme)
ConfigProvider.config({ appContext: app._context });

function updateDocumentTitle(): void {
  document.title = i18nT(APP_DISPLAY_NAME);
}

updateDocumentTitle();
watch(() => i18n.global.locale.value, () => updateDocumentTitle());

app.mount('#app');
