# R2 Bucket Tool

用于本地批量压缩图片、预览结果、上传到 Cloudflare R2，并生成 Cloudflare Transform URL、`srcset` 与 HTML 片段。

## 功能

- 本地 GUI：配置、导入、压缩、预览、上传、复制链接
- CLI：适合脚本化批处理
- 照片支持 `JPEG` / `WebP`
- 透明图保留 `PNG`
- 生成 `manifest.json` 和 `uploaded-manifest.json`
- 支持清理 GUI 临时作业目录

## 环境要求

- Node.js `22.12.0` 或更高版本
- 一个 Cloudflare R2 Bucket
- 一个绑定到该 Bucket 的自定义域名
- 一组 R2 API 凭证

## 快速开始

### 1. 从 GitHub 获取仓库

```bash
git clone https://github.com/Dh-atomheart/R2BucketTool.git
cd R2BucketTool
```

如果不使用 Git，也可以在 GitHub 页面点击 `Code` -> `Download ZIP`，解压后进入项目目录。

### 2. 安装依赖

```bash
npm install
```

### 3. 准备 Cloudflare 信息

至少需要这些字段：

- `Account ID`
- `Bucket`
- `Public base URL`
- `Access key ID`
- `Secret access key`

说明：

- `Public base URL` 填你的图片自定义域名，例如 `https://img.example.com`
- 末尾不要加 `/`
- 如果希望图片长期缓存，可使用 `Cache-Control: public, max-age=31536000, immutable`

### 4. 启动本地 GUI

```bash
npm run gui
```

浏览器打开：

```text
http://127.0.0.1:4173
```

### 5. 完成一次处理流程

1. 在 `Configuration` 中保存 R2 配置
2. 在 `Import and Compress` 中选择输出格式和压缩强度
3. 选择图片文件夹
4. 点击 `Start compression`
5. 在 `Results` 中检查预览、体积变化和对象 key
6. 点击 `Upload to R2`
7. 在 `Publish` 中复制 `sourceUrl`、Transform URL、`srcset` 或推荐 HTML

## 配置方式

### GUI

- 启动命令：`npm run gui`
- GUI 配置文件：`.r2buckettool.gui.json`
- 配置优先级：GUI 配置 > `.env` > 进程环境变量
- GUI 配置为本地明文，只适合单机自用

### CLI

复制环境变量模板：

```bash
cp .env.example .env
```

Windows：

```powershell
copy .env.example .env
```

`.env.example` 包含以下字段：

```env
R2_ACCOUNT_ID=your-account-id
R2_BUCKET=your-public-bucket-name
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_PUBLIC_BASE_URL=https://img.example.com
R2_KEY_PREFIX=photos
R2_CACHE_CONTROL=public, max-age=31536000, immutable
```

## 常用命令

```bash
npm run gui
npm run optimize -- --input ./input --output ./dist/images
npm run upload:r2 -- --env-file .env --manifest ./dist/images/manifest.json
npm test
```

## 输出与清理

- CLI 压缩结果默认写入 `dist/images/`
- GUI 临时作业目录位于 `.tmp/gui-jobs/<jobId>/`
- `Download ZIP` 会将当前作业的压缩结果打包下载到浏览器默认下载目录
- `Clean temp files` 会删除当前 GUI 作业目录中的临时文件，不会删除已上传到 R2 的对象

## 文档

- [用户手册](./docs/user-manual.md)
- [GUI 说明](./docs/gui.md)
- [Cloudflare 配置说明](./docs/cloudflare-setup.md)

## 安全

- 不要提交 `.env`
- 不要提交 `.r2buckettool.gui.json`
- 不要提交 `.tmp/`
- 如果凭证曾进入公开仓库，应立即在 Cloudflare 侧轮换

## License

MIT
