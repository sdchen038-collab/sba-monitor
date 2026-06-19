#!/bin/bash
# =============================================================
# SBA监测 iOS .ipa 构建脚本
# 仅在 macOS + Xcode 环境下运行
# =============================================================
set -e

echo "📦 SBA监测 - iOS .ipa 构建"
echo "============================"

# 1. 安装 Node 依赖
echo ""
echo "📥 1/5 安装 Node 依赖..."
npm ci

# 2. 生成图标
echo "📸 2/5 生成应用图标..."
node scripts/gen-icons.js

# 3. 同步 Web 资源到 iOS
echo "🔄 3/5 同步 Web 资源..."
npx cap sync

# 4. 构建 .app
echo "🔨 4/5 构建 .app..."
cd ios/App
xcodebuild -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO \
  build

# 5. 打包 .ipa
echo "📱 5/5 打包 .ipa..."
cd ../..
mkdir -p Payload
cp -r ios/App/build/Build/Products/Release-iphoneos/App.app Payload/
zip -r SBA监测.ipa Payload/
rm -rf Payload

echo ""
echo "✅ 构建完成！输出文件: SBA监测.ipa"
echo "   大小: $(du -h SBA监测.ipa | cut -f1)"
echo ""
echo "⚠️  注意：此 .ipa 为 unsigned (无签名)，"
echo "   只能通过以下方式安装到设备:"
echo "   • 侧载工具: AltStore, SideStore, Sidestore.io"
echo "   • 开发者签名: xcodebuild -allowProvisioningUpdates"
echo "   • Apple Developer Program: 在 Xcode 中签名后导出"
