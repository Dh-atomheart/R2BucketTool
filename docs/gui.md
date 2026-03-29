# GUI 使用说明

## 1. 用途

GUI 用于在本地完成以下操作：

- 保存 R2 配置
- 选择图片文件夹
- 批量压缩与预览
- 上传到 R2
- 复制图片 URL、`srcset` 和 HTML
- 清理当前作业的本地临时文件

适合不希望频繁使用命令行的场景。

---

## 2. 启动方式

在项目根目录执行：

```bash
npm run gui
```

默认访问地址：

```text
http://127.0.0.1:4173
```

---

## 3. 界面结构

GUI 分为 4 个区域。

### Configuration

用于填写和保存 R2 配置。

主要字段：

- `Account ID`
- `Bucket`
- `Public base URL`
- `Access key ID`
- `Secret access key`
- `Key prefix`
- `Cache-Control`

说明：

- GUI 配置保存在 `.r2buckettool.gui.json`
- GUI 配置优先级高于 `.env`
- 密钥以本地明文保存，仅适合单机自用

### Import and Compress

用于设置压缩参数并导入图片文件夹。

可调参数：

- `Photo output format`
  - `JPEG`
  - `WebP`
- `Compression strength`

默认规则：

- 长边限制 `3200px`
- 照片支持 `JPEG` 或 `WebP`
- 透明图保留 `PNG`

### Results

用于查看压缩结果。

包含：

- 总文件数
- 原始体积
- 压缩后体积
- 节省比例
- 每张图的对象 key
- 原图 / 压缩后预览

可执行操作：

- `Download ZIP`
- 下载 `manifest.json`
- 下载 `uploaded-manifest.json`
- `Clean temp files`

### Publish

用于上传到 R2 并获取最终可用内容。

上传完成后可查看：

- `Source URL`
- `Transform template`
- `src`
- `srcset`
- `Recommended HTML`

---

## 4. 基本流程

1. 启动 GUI
2. 在 `Configuration` 中保存 R2 配置
3. 在 `Import and Compress` 中选择输出格式和压缩强度
4. 选择图片文件夹
5. 点击 `Start compression`
6. 在 `Results` 中检查压缩结果和预览
7. 如需本地备份，点击 `Download ZIP`
8. 点击 `Upload to R2`
9. 在 `Publish` 中复制 URL 或 HTML
10. 如不再需要临时文件，点击 `Clean temp files`

---

## 5. 压缩建议

### 输出格式

`JPEG`

- 更保守
- 更适合兼容性优先的场景

`WebP`

- 对照片通常更省体积
- 更适合追求高压缩率的场景

### 压缩强度

- 数值越高：质量越高，压缩越弱
- 数值越低：压缩越强，体积越小

建议顺序：

1. `WebP + Q72`
2. `WebP + Q60`
3. `WebP + Q50`

说明：

- `90%+` 的压缩率不是每张图都能达到
- 原图越大、越干净，通常越容易继续压缩

---

## 6. 下载与临时文件

### 下载压缩结果

`Download ZIP` 会把当前作业的压缩结果打包下载。  
保存位置由浏览器决定，通常是系统默认下载目录。

### 清理临时文件

`Clean temp files` 会删除当前作业的本地临时目录：

```text
.tmp/gui-jobs/<jobId>/
```

包括：

- `input/`
- `output/`
- `manifest.json`
- `uploaded-manifest.json`

该操作不会删除：

- R2 中已上传的对象
- 你手动下载到本地的 ZIP 文件

---

## 7. 注意事项

- GUI 同一时间只处理一个压缩作业和一个上传作业
- 没有压缩结果时，上传按钮不可用
- 当前作业正在处理时，不能清理临时文件
- 重新打开页面后，如本地仍保留当前 job，GUI 会继续读取该 job 状态

---

## 8. 相关文档

- 用户手册：[docs/user-manual.md](./user-manual.md)
- Cloudflare 设置：[docs/cloudflare-setup.md](./cloudflare-setup.md)
- 项目首页：[README.md](../README.md)
