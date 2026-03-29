# Cloudflare 设置说明

## 1. R2 自定义域名

为公开图片桶绑定自定义域名，例如 `img.example.com`。

要求：

- 页面引用统一走自定义域名
- 不长期暴露 `r2.dev`

## 2. 只分发 Transform URL

页面不要直接使用原始对象地址，而是统一使用：

```text
https://img.example.com/cdn-cgi/image/format=auto,metadata=none,fit=scale-down,width=<W>,quality=85/<object-key>
```

## 3. 白名单尺寸

仅使用以下尺寸：

- `thumb`: `320, 640`
- `card`: `480, 960, 1440`
- `hero`: `768, 1280, 1920, 2560`

不要拼接任意宽度，避免 unique transformations 增长失控。

## 4. 页面规范

- 所有照片使用 `srcset`
- 首屏图片可使用 `loading="eager"` 和 `fetchpriority="high"`
- 非首屏图片使用 `loading="lazy"`
- 始终显式提供 `width` 和 `height`

## 5. 不使用 Polish 作为主链路

该仓库默认以 Transform URL 为主，不叠加 Polish 作为核心优化手段。

## 6. 验收建议

- 用 Chrome DevTools 检查不同浏览器是否协商到 AVIF/WebP/JPEG
- 抽样比对 `320 / 960 / 1920` 三档体积和画质
- 月度跟踪 unique transformations，若逼近免费额度再引入 Worker 白名单封装
