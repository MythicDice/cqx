import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Astro 固定为 7.4.0：该版本要求 Node >=22.22.0，与当前环境一致。
// 若升级到 7.4.7，请先将 Node 升级到 >=22.23.4。
// GitHub Pages：组织站点的专用子路径，避免占用根路径。
const SITE = 'https://mythicdice.github.io';
const BASE = '/cqx/';

export default defineConfig({
  site: SITE,
  base: BASE,
  // 开发预览不显示 Astro 悬浮工具栏，保持页面干净
  devToolbar: { enabled: false },
  integrations: [
    starlight({
      title: 'CQX',
      description: 'CQX v0.3 规定消息的字符串格式、消息元素、原样围栏、抽象消息树与严格解析规则。',
      // Starlight 会自动套用 base，这里写站点根下的路径。
      favicon: '/favicon.svg',
      customCss: ['/src/styles/custom.css'],
      // Starlight 默认跟随系统主题且无偏好时用深色；此站以浅色为默认，
      // 仅在没有用户显式选择时写入，主题切换器仍可正常切换到深色或自动。
      head: [
        {
          tag: 'script',
          content:
            "try{if(!localStorage.getItem('starlight-theme')){localStorage.setItem('starlight-theme','light');document.documentElement.dataset.theme='light';}}catch(e){}",
        },
      ],
      locales: {
        root: { label: '简体中文', lang: 'zh-CN' },
      },
      sidebar: [
        {
          label: '文本格式',
          items: [
            { label: '范围与字符串格式', link: '/' },
            { label: '标签、名称与属性', link: '/format/' },
            { label: '正文、转义与空白', link: '/escaping/' },
          ],
        },
        {
          label: '消息元素',
          items: [
            { label: '内置消息元素', link: '/segments/' },
            { label: '合并转发与消息引用', link: '/forward/' },
            { label: '原样围栏', link: '/code/' },
          ],
        },
        {
          label: '实现',
          items: [
            { label: '数据模型与规范化序列化', link: '/model/' },
            { label: '严格解析与错误处理', link: '/parsing/' },
            { label: '测试向量与协议映射', link: '/vectors/' },
          ],
        },
        {
          label: '工具',
          items: [{ label: '在线尝试', link: '/try/' }],
        },
      ],
    }),
  ],
});
