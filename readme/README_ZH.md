<div align="center">
  <a href="https://github.com/ldrfy/atoms_viewer">
    <img alt="LDR Atoms Viewer Logo" width="200" src="../public/lav.svg">
  </a>
  <br>
  <br>

[![license](https://img.shields.io/github/license/ldrfy/atoms_viewer.svg)](LICENSE)

  <h1>LDR Atoms Viewer</h1>

[![CHI](https://img.shields.io/badge/CHI-中文-red?style=for-the-badge)](readme/README_ZH.md) [![ENG](https://img.shields.io/badge/ENG-English-blue?style=for-the-badge)](README.md)

</div>

![start](https://raw.githubusercontent.com/ldrfy/atoms_viewer_docs/refs/tags/v1.0.0/docs/site/public/img/zh/start.jpg)

## 🚀 开始使用

- 访问 [Web: Ldr-Atoms-Viewer](https://ldrfy.github.io/atoms_viewer/)
- 上传你自己的文件（支持格式详见 [多格式支持](#多格式支持)）


## 项目简介

本项目是一个基于 Web 的原子结构可视化工具。通过上传原子坐标文件，自动构建三维结构，可对显示效果进行精细调节（如旋转角度、原子大小、原子颜色、键粗细等），同时支持一键导出透明背景、自动裁剪的高分辨率 PNG 图片，也可以录制为视频。

项目以现代前端技术栈构建，交互流畅，渲染性能优先。

### 多图层

拖拽进入多个坐标文件时，可同时显示多个结构，也可根据需求显示或隐藏某个图层

### 录制视频

模型可根据不同对称轴自动旋转，您可录制转动过程，或模型运动轨迹，可自定义录制区域、不同颜色背景

### 文件导出

- 导出图片：可选透明背景与不同颜色背景、可调整输出分辨率、自动裁剪到紧凑内容边界框
- 格式转换：已经支持的导入的格式，导出为 `xyz` 等
- 模型打包：整体打包，包括模型文件本身以及各个图层的所有设置，可以直接导出分享给其他人恢复当前状态
- 设置导出：各个图层、背景、视角、视距等所有设置一次导出，便于恢复

### 流畅与多设备支持

支持数十万原子加载，支持手机、电脑等各种平台使用

### 多格式支持

目前支持 `lammps-data`, `lammps-dump`, `pdb`, `mol`, `sdf`, `xyz`，其中 `xyz` 和 `lammps-dump` 支持轨迹播放。

以上支持的模型文件，如果有多个（或一个），也可以压缩为一个 `zip` 文件，直接拖拽入网页，这将会一次载入多个模型


### 丰富的自定义

多语言，深色/浅色主题，精确旋转控制，原子大小、原子颜色，键粗细、显示与否，坐标轴显示与否等


## 🏗️ 开发测试

### 环境要求

- node25
- pnpm10

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

## 参考与致谢

本项目在交互设计与功能目标上参考了以下在线查看器，但实现方式更现代化，性能与流畅性更优：

[openmx-viewer](https://www.openmx-square.org/viewer/index.html)
