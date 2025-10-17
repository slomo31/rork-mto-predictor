#!/bin/bash

# Expo SDK 53 Update Script
# This script updates all packages to be compatible with Expo SDK 53

echo "🚀 Starting Expo SDK 53 Update..."
echo ""

# Step 1: Clean existing installations
echo "📦 Step 1/4: Cleaning existing installations..."
rm -rf node_modules .expo .expo-shared bun.lock 2>/dev/null
echo "✅ Cleaned node_modules, .expo, .expo-shared, and bun.lock"
echo ""

# Step 2: Update to SDK 53 packages
echo "📦 Step 2/4: Installing Expo SDK 53 compatible packages..."
npx expo install \
  expo@~53.0.23 \
  expo-blur@~14.1.5 \
  expo-constants@~17.1.7 \
  expo-font@~13.3.2 \
  expo-image@~2.4.1 \
  expo-linear-gradient@~14.1.5 \
  expo-linking@~7.1.7 \
  expo-location@~18.1.6 \
  expo-router@~5.1.7 \
  expo-splash-screen@~0.30.10 \
  expo-symbols@~0.4.5 \
  expo-system-ui@~5.0.11 \
  expo-web-browser@~14.2.0 \
  react-native@0.79.5 \
  react-native-safe-area-context@5.4.0 \
  react-native-screens@~4.11.1

if [ $? -eq 0 ]; then
  echo "✅ Expo packages installed successfully"
else
  echo "❌ Failed to install Expo packages"
  exit 1
fi
echo ""

# Step 3: Reinstall all dependencies
echo "📦 Step 3/4: Reinstalling all dependencies..."
if command -v bun &> /dev/null; then
  echo "Using bun..."
  bun install
else
  echo "Using npm..."
  npm install
fi

if [ $? -eq 0 ]; then
  echo "✅ Dependencies installed successfully"
else
  echo "❌ Failed to install dependencies"
  exit 1
fi
echo ""

# Step 4: Run diagnostics
echo "🔍 Step 4/4: Running Expo Doctor..."
npx expo-doctor

echo ""
echo "✅ Update complete!"
echo ""
echo "Next steps:"
echo "  1. Review any warnings from expo-doctor above"
echo "  2. Start the dev server: npx expo start -c"
echo "  3. Check console for ESPN API status"
echo ""
echo "If ESPN API fails, check FIXES_APPLIED.md for troubleshooting"
