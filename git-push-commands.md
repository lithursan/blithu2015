# Git commands to push updates to GitHub repository
# Run these commands in PowerShell after installing Git

# 1. Initialize git (if not already done)
git init

# 2. Add remote repository (if not already added)
git remote add origin https://github.com/lithursan/blithu2015.git

# 3. Add all changes
git add .

# 4. Commit with message about recent updates
git commit -m "Updated Orders table sticky columns, optimized Create Order modal, enhanced Daily Log data, improved Expenses delete functionality, removed success alerts"

# 5. Push to GitHub
git push -u origin main

# If main branch doesn't exist, try master:
# git push -u origin master