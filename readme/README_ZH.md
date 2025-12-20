# Ldr-Atoms-Viewer

<div align="center">

[![CHI](https://img.shields.io/badge/CHI-中文-red?style=for-the-badge)](readme/README_ZH.md) [![ENG](https://img.shields.io/badge/ENG-English-blue?style=for-the-badge)](README.md)

</div>

| 0    | CNT                  | MoS2_NT                  |
| ---- | -------------------- | ------------------------ |
| 透视 | ![](images/cnt1.png) | ![](images/mos2_nt1.png) |
| 正交 | ![](images/cnt0.png) | ![](images/mos2_nt0.png) |

## 项目简介

本项目是一个基于 Web 的原子结构可视化与导出工具。用户可通过上传 `.xyz` 文件在浏览器中构建并查看原子结构，并对显示效果进行精细调节（如旋转角度、原子大小等），同时支持一键导出透明背景、自动裁剪的高分辨率 PNG 图片。

项目以现代前端技术栈构建，交互流畅，渲染性能优先。

## 功能特性

- **XYZ 原子结构加载与渲染**

  - 目前支持 `.xyz` 文件解析与可视化

- **显示与视图控制**

  - 深色/浅色主题切换
  - 多语言（i18n）
  - 精确调节旋转角度（X/Y/Z）
  - 原子大小（缩放）调节
  - 坐标轴、键（bonds）显示开关

- **图片导出**

  - 导出 PNG（支持透明背景）
  - 支持指定导出分辨率（自定义缩放倍数）
  - **自动裁剪**到合适的内容边界，减少空白区域

- **更流畅的交互体验**

  - 相比同类结构查看器，更注重渲染与交互流畅性

## 技术栈

- Vue3
- Vite
- TypeScript
- Ant Design Vue
- three.js
- pnpm

## 开发测试

### 环境要求

- Node.js（建议使用较新的 LTS 版本）
- pnpm

### 安装与运行

```bash
pnpm install
pnpm dev
```

### 构建

```bash
pnpm build
pnpm preview
```

## 使用说明

1. 打开网页后上传 `.xyz` 文件；
2. 在设置面板中调节显示参数（旋转角度、原子大小、显示开关等）；
3. 使用导出功能生成透明背景 PNG，可选择导出分辨率，并自动裁剪到合适尺寸。

## 参考与致谢

本项目在交互设计与功能目标上参考了以下在线查看器，但实现方式更现代化，性能与流畅性更优：

[openmx-viewer](https://www.openmx-square.org/viewer/index.html)

## 路线图

- [ ] 支持更多结构文件格式（如 CIF、POSCAR/CONTCAR、PDB 等）
- [ ] 更完善的键（bonds）识别与显示策略
- [ ] 更丰富的渲染样式与展示选项（如测量、截面、标注等）
