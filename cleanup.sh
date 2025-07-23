#!/bin/bash

echo "🧹 Cleaning up HealthyFlow project..."

# Remove temporary debug/test files
echo "Removing temporary debug files..."
rm -f find-floating-tasks.cjs
rm -f update-existing-rollovers.cjs
rm -f test-original-date.cjs
rm -f apply-migration.cjs
rm -f test-rollover-fixed.cjs
rm -f check-users.cjs
rm -f test-rollover.cjs
rm -f debug-rollover.js
rm -f get-and-set-jwt.cjs
rm -f migrate-to-supabase.cjs

# Remove legacy SQLite files if they exist
rm -f healthyflow.db
rm -f backend/healthyflow.db

# Remove old init-db.js (replaced by Supabase)
rm -f backend/init-db.js

# Clean up any .log files
rm -f *.log
rm -f backend/*.log

# Clean up any .tmp files
rm -f *.tmp
rm -f backend/*.tmp

echo "✅ Cleanup complete!"
echo ""
echo "📚 Documentation files:"
echo "  - FEATURES.md - Complete features documentation"
echo "  - README_HealthyFlow.md - Architecture overview"
echo "  - README-DEPLOYMENT.md - Deployment guide"
echo "  - ROLLOVER_IMPROVEMENTS.md - Rollover feature details"
echo "  - backend/README-SUPABASE-MIGRATION.md - Database migration guide"
echo ""
echo "🧪 Testing files:"
echo "  - test-voice.html - Voice features testing"
echo "  - test-tts.html - Text-to-speech testing"
echo "  - tests/ - Jest test suite"
echo ""
echo "🔧 Utility files kept:"
echo "  - admin.html - Admin panel"
echo "  - backend/add-demo-user.js - Demo user setup"
echo "  - backend/cleanup-rollover-tasks.js - Database cleanup"
echo "  - backend/run-cleanup.sh - Database cleanup runner"
echo ""
echo "🚀 Project ready for production!" 