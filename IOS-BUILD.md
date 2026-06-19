# PWA → iOS .ipa 编译指南

## 项目结构

```
project-root/
├── public/                  ← PWA 源码（HTML/JS/CSS/图标）
│   ├── index.html
│   ├── app.js
│   ├── manifest.json
│   └── sw.js
├── ios/                     ← ⭐ iOS 原生项目（Capacitor 生成）
│   └── App/
│       ├── App.xcodeproj/
│       ├── App/
│       │   ├── AppDelegate.swift    ← ⚠️ 需要手动修复
│       │   ├── Info.plist           ← ⚠️ 需要添加 HTTP 允许
│       │   └── Assets.xcassets/
│       └── CapApp-SPM/
├── scripts/
│   ├── serve.js              ← 本地开发服务器
│   └── gen-icons.js          ← 图标生成脚本
├── .github/workflows/
│   └── build-ipa.yml          ← ⭐ CI 编译配置
├── capacitor.config.json
└── package.json
```

---

## 1. 环境初始化（一次性）

```bash
# 安装依赖
npm install @capacitor/cli @capacitor/core @capacitor/ios

# 初始化 Capacitor
npx cap init "应用名" com.yourapp.id --web-dir public

# 添加 iOS 平台
npx cap add ios
```

---

## 2. 每次 `cap add ios` 后必须手动修复

### 2a. Info.plist — 添加 HTTP 允许

**文件：** `ios/App/App/Info.plist`

在 `</dict>` 前插入：

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

### 2b. AppDelegate.swift — 修复 Universal Links API

**文件：** `ios/App/App/AppDelegate.swift`

找到以下代码（Capacitor 8 自动生成）：

```swift
// ❌ 原始代码 —— Xcode 15.4 编译失败
func application(_ application: UIApplication, continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    return ApplicationDelegateProxy.shared.application(
        application, continue: userActivity, restorationHandler: restorationHandler)
}
```

替换为：

```swift
// ✅ 修复后 —— Xcode 15.4 + 16.2 均兼容
func application(_ application: UIApplication, continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    if let url = userActivity.webpageURL {
        return ApplicationDelegateProxy.shared.application(
            application, open: url, options: [:])
    }
    return false
}
```

---

## 3. 编译配置（build-ipa.yml）—— 关键配置

```yaml
name: Build iOS .ipa

on:
  workflow_dispatch:
  push:
    branches: [master]

jobs:
  build:
    runs-on: macos-14              # ⭐ 必须 macos-14，不要用 macos-latest / macos-15

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22          # ⭐ Capacitor 8 需要 Node >= 22

      - run: npm ci
      - run: node scripts/gen-icons.js
      - run: npx cap sync

      - name: Setup Xcode
        uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: '15.4'     # ⭐ 必须 15.4，不要用 16.x

      - name: Build .app
        working-directory: ios/App
        run: |
          xcodebuild -project App.xcodeproj \
            -scheme App \
            -configuration Release \
            -sdk iphoneos \          # ⭐ 不加 -destination 参数
            -derivedDataPath build \
            CODE_SIGNING_ALLOWED=NO \
            build

      - name: Package .ipa           # 直接打包，无需 xcodebuild archive
        run: |
          mkdir -p Payload
          cp -r ios/App/build/Build/Products/Release-iphoneos/App.app Payload/
          zip -r SBA-Monitor.ipa Payload/
          rm -rf Payload

      - name: Upload .ipa
        uses: actions/upload-artifact@v4
        with:
          name: SBA-Monitor-ipa
          path: SBA-Monitor.ipa
```

---

## 4. 完整避坑清单

| 错误做法 | 后果 | 正确做法 |
|:---|---|:---|
| `runs-on: macos-latest` | Xcode 16.2 需额外下载 iOS 18.2 平台，下载失败 | ✅ `macos-14` + Xcode 15.4 |
| `runs-on: macos-15` | 同上一行 | ✅ `macos-14` |
| `xcode-version: '16.2'` | 需装 iOS 18.2 Simulator Runtime，CI 无显示器导致失败 | ✅ `'15.4'` |
| `xcode-version: 'latest'` | 自动选 16.x，同上 | ✅ 固定 `'15.4'` |
| `-destination generic/platform=iOS` | 触发行平台检测 → "Platform Not Installed" | ✅ **不加** `-destination` |
| `-sdk iphonesimulator` | 编译产物只能运行在模拟器，不能安装到真机 | ✅ 用 `-sdk iphoneos` |
| `xcodebuild -downloadPlatform iOS` | CI 无显示器，`Unable to connect to simulator` | ✅ 不用下载，macOS 14 预装 iOS 17 SDK |
| `xcodebuild archive` | 步骤复杂，签名问题多 | ✅ 直接 `xcodebuild build` + 手动 `zip` |
| Capacitor 8 生成的 `AppDelegate` | 含 `restorationHandler` 参数，Swift 5 不支持 | ✅ 改为 `webpageURL` 方式 |
| `node-version: 20` | Capacitor 8 需要 `>=22.0.0` | ✅ `node-version: 22` |
| `actions/checkout@v3` | Node 16 已弃用 | ✅ `@v4` |
| 包名含中文 (如 `SBA监测.ipa`) | 部分工具下载/解压乱码 | ✅ 纯英文 `SBA-Monitor.ipa` |

---

## 5. 每次编译只需

```bash
# 修改 PWA 代码 → 推送触发自动编译
git add -A
git commit -m "update"
git push

# 或手动触发
gh workflow run "Build iOS .ipa"
```

- 从 `git push` 到生成 `.ipa` 约 **45 秒**
- 下载地址：GitHub → Actions → 最新运行记录 → **Artifacts → SBA-Monitor-ipa.zip**

---

## 6. 安装到真机

| 工具 | 平台 | 说明 |
|:---|---|:---|
| [Sideloadly](https://sideloadly.io/) | Windows/Mac | 免费，7天签名 |
| [AltStore](https://altstore.io/) | Windows/Mac | 免费，自动续签 |
| Apple Developer Program | 付费 $99/年 | 一年签名，TestFlight 分发 |

> ⚠️ 免费 Apple ID 签名有效期 **7 天**，到期需重新侧载
