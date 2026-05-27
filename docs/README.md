# B 站 Banner 变迁历史

本文档记录了 Bilibili 网站（以下简称B站）首页 Banner 的技术演进历程，大部分内容均是通过逆向 [Wayback Machine][Wayback-Machine] 中的不同时期 B 站网页快照后整理得出。

## 一、B站 Banner 演变与脚本抓取模式概览

| 时间区间    | Banner 类型                 | 加载方式                                                            |
| :---------- | :-------------------------- | :------------------------------------------------------------------ |
| 2013 - 2014 | 静态单图                    | 内嵌在 `new_z.css` 文件中通过 background 属性加载                   |
| 2015        | 静态单图                    | 内嵌在 `new_z2.css` 文件中通过 background 属性加载                  |
| 2015 - 2016 | 静态单图                    | 通过 `widget/getHeader` 接口下发的脚本加载                          |
| 2016 - 2018 | 静态单图                    | 通过 `/x/web-show/res/loc` 接口下发                                 |
| 2018 - 2019 | 静态单图                    | 内嵌在 HTML 中                                                      |
| 2019 - 2020 | 静态单图、动态多图层        | 内嵌在 HTML 中                                                      |
| 2020 - 2021 | 动态多图层 + Canvas、视频 | 通过 js 内嵌或 `x/web-show/res/frontpage` 接口下发                  |
| 2022 - 至今 | 静态单图、视频、动态多图层  | 内嵌在 HTML 中或 `/x/web-show/page/header?resource_id=142` 接口下发 |

## 二、静态单图的资源加载方式

B站早期只有单张背景图和 Logo 的简单 Banner，其资源 url 大多硬编码在不同文件中。这里简要介绍不同时期资源加载方式。

### 2013 - 2014 后期

- **资源位置**：`http://static.hdslb.com/css/new_z.css`
- **参考链接**：[2014-06-17 快照](https://web.archive.org/web/20140617111305/http://www.bilibili.com/)
- **CSS [源码](https://web.archive.org/web/20140617111305cs_/http://static.hdslb.com/css/new_z.css)**：

  ```css
  .widescreen .header {
    background: url(/web/20140604140050im_/http://static.hdslb.com/images/header/201406-1170.jpg)
      no-repeat 0 0;
  }

  .widescreen .header .logo {
    position: absolute;
    width: 280px;
    height: 105px;
    left: 24px;
    top: 7px;
    background: url(/web/20140604140050im_/http://static.hdslb.com/images/header/201406-logo2.png)
      no-repeat left center;
  }
  ```

### 2015年

- **资源位置**：`http://static.hdslb.com/css/new_z2.css`
- **参考链接**：[2015-02-01 快照](https://web.archive.org/web/20150201172847/http://www.bilibili.com)
- **CSS [源码](https://web.archive.org/web/20150201172847cs_/http://static.hdslb.com/css/new_z2.css)示例**：

  ```css
  .header {
    height: 162px;
    background: url(/web/20150203125445im_/http://static.hdslb.com/images/header/2014_christmas.jpg)
      no-repeat center top transparent;
    position: relative;
    margin: 0 auto;
    *z-index: 100;
  }

  .header .logo {
    position: absolute;
    width: 220px;
    height: 105px;
    left: 24px;
    top: 7px;
    background: url(/web/20150203125445im_/http://static.hdslb.com/images/header/2014_christmas_logo.png)
      no-repeat left center;
  }
  ```

### 2015 后期 - 2016 中期

- **资源位置**：`http://www.bilibili.com/widget/getHeader?typeid=0&is_article=0` 接口返回的脚本内容。
- **参考链接**：[2016-03-14 快照](https://web.archive.org/web/20160314192028/http://www.bilibili.com:80/)
- **JavaScript [源码](https://web.archive.org/web/20160314192028cs_/http://static.hdslb.com/js/new_header_v3.js)示例**：

  ```javascript
  (function () {
    var bannerConfig = {
      background:
        "https:\/\/web.archive.org\/web\/20160316041329\/http:\/\/i0.hdslb.com\/headers\/b314d69ec7ba625d89a343366c045026.PNG",
      logo: "https:\/\/web.archive.org\/web\/20160316041329\/http:\/\/i0.hdslb.com\/u_user\/971d9c66d10c6c6396b36416568525db.png",
      url: "",
      title:
        "\u96ea\u5316\u540e\u662f\u4ec0\u4e48\u5462\uff1f\u662f\u6625\u5929\u5427\u2026",
      style: "white",
    };
    var box = getElementsByClassName("header")[0];
    var logo = getElementsByClassName("logo")[0];
    var mask = getElementsByClassName("b-header-mask-bg")[0];

    if (bannerConfig.background && box) {
      box.style.backgroundImage = "url(" + bannerConfig.background + ")";
      mask.style.backgroundImage = "url(" + bannerConfig.background + ")";
      box.setAttribute("data-title", bannerConfig.title);
    }
    if (bannerConfig.logo && logo) {
      logo.style.backgroundImage = "url(" + bannerConfig.logo + ")";
    }
    if (bannerConfig.url && box) {
      box.innerHTML =
        '<a class="header-link" href="' +
        bannerConfig.url +
        '" target="_blank" ></a>' +
        box.innerHTML;
    }
    if (bannerConfig.style == "black") {
      $(".z_top").addClass("b-header-blur-black");
    }

    function getElementsByClassName(className, tagName) {
      var ele = [],
        all = document.getElementsByTagName(tagName || "*");
      for (var i = 0; i < all.length; i++) {
        if (all[i].className == className) {
          ele[ele.length] = all[i];
        }
      }
      return ele;
    }
  })();
  ```

### 2016 后期 - 2018 中期

- **资源位置**： `https://api.bilibili.com/x/web-show/res/loc?pf=0&id=142` 接口返回的数据
- **参考链接**：[2018-07-08 快照](https://web.archive.org/web/20180708003100/https://www.bilibili.com/)
- **JavaScript [源码](view-source:https://web.archive.org/web/20180708033552js_/https://s1.hdslb.com/bfs/static/jinkela/home/home.7a168d96d4de458a577dd5dcf9c0727d5f227f77.js)示例**：
  ```javascript
  setBanner: function () {
      var t = this;
      (0, n.default)(
          {
              url: o.default.API + "/x/web-show/res/loc",
              data: { pf: 0, id: this.bid, jsonp: "jsonp" },
              dataType: "jsonp",
              timeout: 3e3,
          },
          !0,
      )
      .done(function (e) {
          if (e && 0 === e.code) {
          var i = e.data[0];
          i &&
              ((t.bannerImg = (0, s.trimHttp)(i.pic)),
              (t.logoImg = (0, s.trimHttp)(i.litpic)),
              (t.bannerLink = (0, s.trimHttp)(i.url) || null),
              (t.navClass = i.style && t.navState ? "blur-black" : ""),
              (t.bannerTitle = i.name || ""),
              t.bannerTitle || $(".head-title").remove());
          } else t.defaultBanner();
      })
      .fail(function () {
          t.defaultBanner();
      });
  }
  defaultBanner: function () {
      ((this.bannerImg =
      "//web.archive.org/web/20180708033552/https://i0.hdslb.com/bfs/activity-plat/static/20171220/68a052f664e8414bb594f9b00b176599/images/90w1lpp6ry.png"),
      (this.logoImg =
          "//web.archive.org/web/20180708033552/https://i0.hdslb.com/bfs/activity-plat/static/20171220/68a052f664e8414bb594f9b00b176599/images/j60lvxq9vy.png"),
      (this.bannerLink = "#"));
  }
  ```

### 2018 后期 - 2019 后期

- **资源位置**：首页 HTML 源码中的 `.banner_link` 或 `.head-banner` 元素
- **参考链接**：[2018-12-30 快照](https://web.archive.org/web/20181230013059/https://www.bilibili.com/)
- **HTML 源码示例**：
  ```html
  <div
    id="banner_link"
    class="head-banner report-wrap-module report-scroll-module"
    style="background-image:url(//web.archive.org/web/20181230013059im_/https://i0.hdslb.com/bfs/archive/9ad3428e21f42a15b6a1a8c279582ad4412b854c.png);"
  ></div>
  ```

### 2019 - 2020

- **资源位置**：首页 HTML 源码中的 `.bili-banner` 容器。
- **参考链接**：[2020-05-08 快照](https://web.archive.org/web/20200508030200/https://www.bilibili.com/)
- **HTML 源码示例**：

  ```html
  <div
    class="bili-banner"
    style="background-image:url(//web.archive.org/web/20200508030200im_/https://i0.hdslb.com/bfs/archive/ed92db305ae43c7fc8a59b1789934caa2636b876.png);"
    data-v-3120f830
  >
    <a
      href="//web.archive.org/web/20200508030200/https://www.bilibili.com/"
      class="head-logo"
      data-v-3120f830
      ><img
        src="//web.archive.org/web/20200508030200im_/https://i0.hdslb.com/bfs/archive/4de86ebf90b044bf9ba2becf042a8977062b3f99.png"
        class="logo-img"
        data-v-3120f830
    /></a>
  </div>
  ```


### 2022 - 至今

此时期的banner资源下发配置方式比较混杂，多种方式并存，**这里仅介绍 HTML 内嵌方式**，其他方式包括但不限于`/x/web-show/page/header?resource_id=142` 接口下发、内嵌在 HTML 中等。

- **资源位置**：首页 HTML 源码中 is_split_layer 附近字段
- **参考链接**：[2024-07-25 快照](https://web.archive.org/web/20240725005105/https://www.bilibili.com/)
- **HTML 源码示例**：
  ```json
  "response": {
        "name": "8周年生日快乐",
        "pic": "https://web.archive.org/web/20240725005105/http://i0.hdslb.com/bfs/archive/31dfb62aacebedd7a223629ad910120d6f66102a.png",
        "litpic": "https://web.archive.org/web/20240725005105/http://i0.hdslb.com/bfs/archive/0caecadf1aaac0a89cda831922915dd959374614.png",
        "url": "https://web.archive.org/web/20240725005105/https://b23.tv/w9KFuMa",
        "is_split_layer": 1,
        "split_layer": "{\"version\":\"1\",\"layers\":[{\"id\":0,\"name\":\"图层0\",\"resources\":[{\"src\":\"https://i0.hdslb.com/bfs/vc/504b2463fb2a2a1ac064e6f94e6d3348aa148514.mp4\",\"id\":0}],\"scale\":{\"initial\":0.8612}}]}",
        "request_id": "1721868666"
    }
  ```

## 三、官方渲染逻辑

通过逆向分析 JS 代码，B 站动态 Banner 实际上使用了一套复杂的渲染引擎，它通过资源预加载、统一布局计算、高精度贝塞尔曲线插值、自适应参数模型等方式，实现了流畅的动态交互效果。本项目参考该流程实现了 `official_2021` 渲染引擎，实现了与官方几乎完全一致的交互效果。

### 资源预加载

官方渲染器会先预加载每一层的图片资源：

- 图片资源直接创建 `img`，在支持 WebP 时会优先尝试追加 `@1c.webp` 后缀。
- 视频资源通过 `fetch -> Blob -> URL.createObjectURL` 预载，再交给 `video` 标签循环播放。

### 布局与初始尺寸

官方会先计算一个高度补偿系数：

$$ w = \frac{\text{bannerHeight}}{155} $$

然后对每一层创建 `.layer` 容器，按 `intrinsicSize * w * initialScale` 计算首帧宽高。

### 交互输入模型

官方把横向鼠标位移归一化为：

$$ b = \frac{\text{clientX} - \text{anchorX}}{\text{bannerWidth}} $$

鼠标离开或窗口失焦时，会用 `200ms` 的回弹动画把位移渐进恢复到 `0`。

### 曲线与属性插值

官方的关键是使用“对称三次贝塞尔曲线 + 统一属性模型”。若某个属性存在 `offsetCurve`，官方会构造一个关于原点镜像对称的曲线函数：

$$
curve(x) =
\begin{cases}
bezier(x), & x \ge 0 \\
-bezier(-x), & x < 0
\end{cases}
$$

大多数动态属性（scale, rotate, translate 等）都按统一公式 `current = initial + offset * curve(b)` 求值。

### `wrap` 的两种行为

`blur` 和 `opacity` 支持两种边界模式：

- `clamp`：超出范围后直接截断。
- `alternate`：做镜像折返，形成 `0 -> 1 -> 0` 的往返效果。

## 四、动态 banner 历史快照资源

由于 [Wayback Machine][Wayback-Machine] 的采集机制限制，B站快照质量参差不齐，这里仅收录经测试可还原完整动态 Banner 交互体验的快照链接。

| 快照链接 | 主题内容 |
| :--- | :--- |
| [2020-10-01](https://web.archive.org/web/20201010160645/https://www.bilibili.com/) | 2020 秋|
| [2020-12-20](https://web.archive.org/web/20201220013540/https://www.bilibili.com/) | 黄绿合战|
| [2021-02-17](https://web.archive.org/web/20210217142039/https://www.bilibili.com/) | 2021 冬-雪战|
| [2021-04-12](https://web.archive.org/web/20210412120844/https://www.bilibili.com/) | 2021 春-春游|
| [2023-03-31](https://web.archive.org/web/20230331001110/https://www.bilibili.com/) | 2023 春|
| [2023-05-08](https://web.archive.org/web/20230508113754/https://www.bilibili.com/) | 海边篝火 |
| [2023-06-12](https://web.archive.org/web/20230612101044/https://www.bilibili.com/) | 洞穴演唱会 |
| [2023-07-18](https://web.archive.org/web/20230718015206/https://www.bilibili.com/) | 2023 夏-潜水|
| [2023-08-13](https://web.archive.org/web/20230805200401/https://www.bilibili.com/) | 2023 夏-旅游|
| [2023-08-21](https://web.archive.org/web/20230905184625/https://www.bilibili.com/) | 2023 夏-旅游|
| [2024-12-26](https://web.archive.org/web/20241226082416/https://www.bilibili.com/) | 2024 冬-滑雪|

[Wayback-Machine]: https://web.archive.org/
