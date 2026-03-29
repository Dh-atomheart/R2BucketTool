# R2 Bucket Tool

本工具用于管理网站图片的本地压缩、R2 上传和 Cloudflare Transform 分发。

默认方案：

- 本地离线压缩
- R2 只存一份母版图
- 页面使用 Cloudflare `/cdn-cgi/image/...` 按需输出
- 固定宽度白名单控制变换数量

## 快速开始

安装依赖：

```bash
npm install
```

启动本地 GUI：

```bash
npm run gui
```

打开浏览器访问：

```text
http://127.0.0.1:4173
```

完成以下操作：

1. 保存 R2 配置
2. 选择图片文件夹
3. 压缩并预览
4. 上传到 R2
5. 复制 URL 或 HTML

## 功能

- 批量压缩图片目录
- 自动生成对象 key 和 `manifest.json`
- 上传到 Cloudflare R2
- 生成固定预设的 Transform URL、`srcset` 和 HTML
- 提供本地 GUI，适合非命令行使用

## 环境要求

- Node.js `22.12.0` 或更高版本

## 安装

```bash
npm install
```

## 快速开始

### 方式一：GUI

适合日常使用。

1. 启动本地界面：

```bash
npm run gui
```

2. 打开浏览器访问：

```text
http://127.0.0.1:4173
```

3. 在界面中完成：

- 保存 R2 配置
- 选择图片文件夹
- 压缩并预览
- 上传到 R2
- 复制 URL / HTML

### 方式二：CLI

适合脚本化处理。

1. 复制环境变量模板并填写：

```bash
cp .env.example .env
```

Windows 可使用：

```powershell
copy .env.example .env
```

2. 执行图片压缩：

```bash
npm run optimize -- --input ./input --output ./dist/images
```

3. 上传到 R2：

```bash
npm run upload:r2 -- --env-file .env --manifest ./dist/images/manifest.json
```

## 常用命令

```bash
npm run gui
npm run optimize -- --input ./input --output ./dist/images
npm run upload:r2 -- --env-file .env --manifest ./dist/images/manifest.json
npm test
```

## 配置项

必填：

- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL`

可选：

- `R2_KEY_PREFIX`
- `R2_CACHE_CONTROL`

示例见 [`.env.example`](./.env.example)。

## 默认规则

### 离线处理

- 自动纠正 EXIF 方向
- 删除无用元数据
- 长边限制 `3200px`
- 照片默认输出 `JPEG`
- 透明图保留 `PNG`
- 支持 `WebP` 作为照片输出格式

### 上传规则

- 对象 key：`photos/YYYY/MM/<slug>-<contenthash>.<ext>`
- 默认缓存头：

```text
public, max-age=31536000, immutable
```

### 在线分发

Transform URL 统一格式：

```text
https://img.example.com/cdn-cgi/image/format=auto,metadata=none,fit=scale-down,width=<W>,quality=85/<object-key>
```

宽度白名单：

- `thumb`: `320, 640`
- `card`: `480, 960, 1440`
- `hero`: `768, 1280, 1920, 2560`

## 输出文件

压缩完成后默认生成：

- `dist/images/manifest.json`
- `dist/images/<object-key>`

上传完成后生成：

- `dist/images/uploaded-manifest.json`

GUI 临时文件位于：

- `.tmp/gui-jobs/<jobId>/`

## 前端接入

工具库可生成固定预设的图片属性：

```js
import { buildImageAttributes } from "./src/lib/cloudflare-images.js";

const attrs = buildImageAttributes({
  baseUrl: "https://img.example.com",
  key: "photos/2026/03/example-abc123def456.jpg",
  preset: "card",
  sizes: "(max-width: 768px) 100vw, 50vw",
  width: 1440,
  height: 960,
});

console.log(attrs.src);
console.log(attrs.srcset);
```

## 文档

- 使用手册：[docs/user-manual.md](./docs/user-manual.md)
- GUI 说明：[docs/gui.md](./docs/gui.md)
- Cloudflare 设置：[docs/cloudflare-setup.md](./docs/cloudflare-setup.md)

## 安全说明

- 不要提交 `.env`
- 不要提交 `.r2buckettool.gui.json`
- 不要提交 `.tmp/`
- 如果凭证曾进入公开仓库，必须立即在 Cloudflare 旋转
