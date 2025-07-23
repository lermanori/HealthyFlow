#!/bin/bash

echo "🧹 Starting rollover tasks cleanup..."
echo "This will remove all existing rolled-over tasks from the database."
echo "The rollover feature will now work virtually (like habits do)."
echo ""

read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cleanup cancelled"
    exit 1
fi

echo "🚀 Running cleanup script..."
node cleanup-rollover-tasks.js

echo ""
echo "✅ Cleanup completed!"
echo "🔄 The rollover feature now works virtually - no more database clutter!" 