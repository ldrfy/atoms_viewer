# Ldr-Atoms-Viewer

<div align="center">

[![CHI](https://img.shields.io/badge/CHI-中文-red?style=for-the-badge)](readme/README_ZH.md) [![ENG](https://img.shields.io/badge/ENG-English-blue?style=for-the-badge)](README.md)

</div>

## 🚀 开始使用

- 下载 xyz 文件: [cnt.xyz](./samples/cnt.xyz) or [mos2.xyz](./samples/mos2.xyz)
- 访问 [Web: Ldr-Atoms-Viewer](https://ldrfy.github.io/atoms_viewer/)
- 上传你自己的 xyz 文件（或刚你下载的）

| 0      | CNT                          | MoS2_NT                        |
| ------ | ---------------------------- | ------------------------------ |
| 透视   | ![](images/cnt1.png)         | ![](images/mos2_nt1.png)       |
| 正交   | ![](images/cnt0.png)         | ![](images/mos2_nt0.png)       |
| \*.xyz | [cnt.xyz](./samples/cnt.xyz) | [mos2.xyz](./samples/mos2.xyz) |

## 项目简介

本项目是一个基于 Web 的原子结构可视化与导出工具。用户可通过上传 `.xyz` 文件在浏览器中构建并查看原子结构，并对显示效果进行精细调节（如旋转角度、原子大小等），同时支持一键导出透明背景、自动裁剪的高分辨率 PNG 图片。

项目以现代前端技术栈构建，交互流畅，渲染性能优先。

## 功能特性

- **三维结构构建（单帧）**

  - 支持 **LAMMPS data（lammps-data）**、**XYZ 单帧**、**PDB** 的解析与渲染，用于构建并展示静态三维结构。

- **三维动画播放（多帧）**

  - 支持 **LAMMPS dump（lammps-dump）** 与 **XYZ 多帧** 的解析与时间序列三维动画播放。

- **显示与视图控制**

  - 深色/浅色主题
  - 多语言（i18n）
  - 精确旋转控制（X/Y/Z）
  - 原子尺寸缩放
  - 坐标轴与键的显示开关

- **PNG 导出**

  - 支持透明背景
  - 可配置输出分辨率（自定义缩放因子）
  - 自动裁剪到紧凑内容边界框（tight bounding box）

- **流畅的交互体验**

  - 相比常见结构可视化工具，更注重响应速度与交互流畅性

## 📦 技术栈

- Vue3
- Vite
- TypeScript
- Ant Design Vue
- three.js
- pnpm

## 🏗️ 开发测试

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
