<div align="center">
  <a href="https://github.com/ldrfy/atoms_viewer">
    <img alt="LDR Atoms Viewer Logo" width="200" src="./public/lav.svg">
  </a>
  <br>
  <br>

[![license](https://img.shields.io/github/license/ldrfy/atoms_viewer.svg)](LICENSE)

  <h1>LDR Atoms Viewer</h1>

[![CHI](https://img.shields.io/badge/CHI-%E4%B8%AD%E6%96%87-red?style=for-the-badge)](readme/README_ZH.md) [![ENG](https://img.shields.io/badge/ENG-English-blue?style=for-the-badge)](README.md)

</div>

![start](https://raw.githubusercontent.com/ldrfy/atoms_viewer_docs/refs/heads/main/docs/site/public/img/en/start.jpg)

## 🚀 Get Started

- Visit [Web: Ldr-Atoms-Viewer](https://ldrfy.github.io/atoms_viewer/)
- Upload your own model file (formats listed in [Multi-Format Support](#multi-format-support))

## Overview

LDR Atoms Viewer is a web-based atomic structure visualization tool. Upload atomic coordinate files to generate 3D structures, then fine-tune the display (rotation, atom size, atom color, bond thickness, etc.). It supports one-click export of transparent or colored, auto-cropped high-resolution PNGs, and can record animations.

Built with a modern front-end stack, the experience is smooth and performance-focused.

## Features

### Multi-Layer

Drag in multiple coordinate files to display multiple structures at once, and show or hide layers as needed.

### Video Recording

Models can auto-rotate around different symmetry axes. Record the rotation process or motion trajectory, with customizable recording regions and background colors.

### File Export

- Image export: transparent or colored background, adjustable resolution, auto-cropped bounding box
- Format conversion: export to formats such as `xyz` from supported inputs
- Project package: bundle models plus all layer settings for sharing and restoring
- Settings export: export layers, background, view, and camera distance in one file

### Smooth Performance & Multi-Device Support

Supports loading hundreds of thousands of atoms, and works on mobile and desktop.

### Multi-Format Support

Supported formats: `lammps-data`, `lammps-dump`, `pdb`, `mol`, `sdf`, `xyz`. Both `xyz` and `lammps-dump` support trajectory playback.

Multiple model files can also be packaged into a single `zip` and dragged into the viewer for batch loading.

### Rich Customization

Multi-language, dark/light themes, precise rotation control, atom size, atom color, bond thickness, visibility toggles, axes display, and more.

## 🏗️ Development Testing

### Prerequisites

- node24
- pnpm10

### Install & Run

```bash
pnpm install
pnpm dev
```

### Build

```bash
pnpm build
pnpm preview
```

## Reference & Credits

This project is inspired by the following online viewer in interaction design and goals, but is more modern in implementation, with better performance and smoother interaction:

[openmx-viewer](https://www.openmx-square.org/viewer/index.html)
