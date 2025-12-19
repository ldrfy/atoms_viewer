import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n";
import Antd from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import "./style.css"; // 加上这一行（或改成你实际的全局css路径）

createApp(App).use(i18n).use(Antd).mount("#app");
