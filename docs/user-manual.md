# R2 Bucket Tool 用户手册

## 1. 用途

本工具用于完成以下流程：

1. 选择本地图片文件夹
2. 压缩并标准化图片
3. 上传到 Cloudflare R2
4. 生成可直接使用的图片 URL、`srcset` 和 HTML

适用场景：

- 个人网站图片托管
- Markdown 图片链接生成
- Cloudflare R2 + 自定义域名图片分发

---

## 2. 使用前准备

需要先准备：

- Node.js `22.12.0` 或更高版本
- 一个 Cloudflare R2 Bucket
- 一个绑定到该 Bucket 的自定义域名
- 一组 R2 API 凭证

首次使用先执行：

```bash
npm install
```

---

## 3. 需要填写的字段

### 必填字段

`Account ID`  
Cloudflare 账户 ID。用于连接到正确的 Cloudflare 账户。

`Bucket`  
R2 Bucket 名称。

`Public base URL`  
图片访问域名。格式必须是完整 URL，例如：

```text
https://img.example.com
```

要求：

- 必须带 `https://`
- 末尾不要加 `/`

`Access key ID`  
R2 API 凭证中的 Access Key ID。

`Secret access key`  
R2 API 凭证中的 Secret Access Key。

### 可选字段

`Key prefix`  
上传对象的目录前缀。默认建议使用：

```text
photos
```

`Cache-Control`  
上传对象的缓存头。默认建议使用：

```text
public, max-age=31536000, immutable
```

这表示：

- 图片可长期缓存
- 只要你不删除对象，R2 中的文件会一直存在

---

## 4. 这些值去哪里找

### `Account ID`

Cloudflare 控制台中可直接查看账户 ID。

### `Bucket`

进入 `R2 Object Storage`，复制目标 Bucket 名称。

### `Access key ID` 和 `Secret access key`

进入 Cloudflare：

1. 打开 `R2 Object Storage`
2. 打开 `Manage R2 API tokens`
3. 点击 `Create API token`
4. 权限选择 `Object Read & Write`
5. 范围选择你的图片 Bucket
6. 创建后保存：
   - `Access Key ID`
   - `Secret Access Key`

注意：

- `Secret Access Key` 通常只显示一次
- 关闭页面后如果未保存，需要重新创建

---

## 5. 启动 GUI

在项目根目录执行：

```bash
npm run gui
```

浏览器打开：

```text
http://127.0.0.1:4173
```

---

## 6. 基本操作流程

### 第一步：保存配置

在 `Configuration` 区域填写配置并点击 `Save configuration`。

说明：

- GUI 配置保存在项目根目录的 `.r2buckettool.gui.json`
- 该文件为本地明文文件
- 不要提交到 Git 仓库

### 第二步：选择压缩参数

在 `Import and Compress` 区域可设置：

- `Photo output format`
  - `JPEG`：更保守
  - `WebP`：通常更省体积
- `Compression strength`
  - 数值越高：质量越高，压缩越弱
  - 数值越低：压缩越强，体积越小

### 第三步：选择文件夹并压缩

1. 选择图片文件夹
2. 点击 `Start compression`

压缩完成后，在 `Results` 区域可查看：

- 文件数量
- 原始体积
- 压缩后体积
- 节省比例
- 每张图的对象 key
- 原图 / 压缩后预览

### 第四步：如需本地保存，下载 ZIP

点击 `Download ZIP`，浏览器会按默认下载设置保存到本机下载目录。

### 第五步：上传到 R2

点击 `Upload to R2`。

上传完成后可在 `Publish` 区域查看：

- `Source URL`
- `Transform template`
- `src`
- `srcset`
- `Recommended HTML`

### 第六步：清理本地临时文件

点击 `Clean temp files` 可删除当前作业的本地临时目录，包括：

- 原始导入文件
- 压缩后文件
- `manifest.json`
- `uploaded-manifest.json`

该操作不会删除 R2 中已上传的图片。

---

## 7. 日常推荐流程

1. `npm run gui`
2. 打开本地页面
3. 检查配置
4. 选择 `JPEG` 或 `WebP`
5. 调整压缩滑块
6. 选择文件夹
7. 点击 `Start compression`
8. 抽查预览结果
9. 点击 `Upload to R2`
10. 复制 URL 或 HTML
11. 如不再需要本地临时文件，点击 `Clean temp files`

---

## 8. 压缩建议

如果目标是进一步压缩体积：

- 优先尝试 `WebP`
- 先试 `Q72`
- 再试 `Q60`
- 追求更高压缩率时再试 `Q50`

注意：

- `90%+` 节省比例不是每张图都能达到
- 原图越大、越干净，通常越容易继续压缩
- 已经压缩过的原图，继续压缩空间通常更小

---

## 9. 常见问题

### 上传按钮不可用

常见原因：

- 当前作业还没压缩完成
- 配置未填写完整
- 正在执行其他上传任务

### 图片会不会过期

不会。  
只要你不手动删除 R2 对象，图片会一直存在。

### 为什么界面不回显已保存的密钥

这是正常行为。  
GUI 不会直接显示已保存的敏感值。

### `srcset` 为什么没有更大的宽度

如果原图本身不够大，工具不会生成更大的变换尺寸，避免放大小图。

---

## 10. 相关文档

- GUI 说明：[docs/gui.md](./gui.md)
- Cloudflare 设置：[docs/cloudflare-setup.md](./cloudflare-setup.md)
- 项目首页：[README.md](../README.md)
