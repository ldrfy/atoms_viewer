import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n";

import "ant-design-vue/dist/reset.css";
import "./style.css";

import {
  ConfigProvider,
  Layout,
  Row,
  Col,
  Button,
  Space,
  Typography,
  Tag,
  Form,
  InputNumber,
  Checkbox,
  Switch,
  Radio,
  Select,
  Slider,
  Segmented,
  Spin,
  Empty,
  Alert,
  Modal,
  Drawer,
  Popover,
  Menu,
  Dropdown,
  Collapse,
  Descriptions,
  FloatButton,
} from "ant-design-vue";

const app = createApp(App);
app.use(i18n);

app
  .use(ConfigProvider)
  .use(Layout)
  .use(Row)
  .use(Col)
  .use(Button)
  .use(Space)
  .use(Typography)
  .use(Tag)
  .use(Form)
  .use(InputNumber)
  .use(Checkbox)
  .use(Switch)
  .use(Radio)
  .use(Select)
  .use(Slider)
  .use(Segmented)
  .use(Spin)
  .use(Empty)
  .use(Alert)
  .use(Modal)
  .use(Drawer)
  .use(Popover)
  .use(Menu)
  .use(Dropdown)
  .use(Collapse)
  .use(Descriptions)
  .use(FloatButton);

app.mount("#app");
