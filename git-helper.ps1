# Git Helper PowerShell Script
# Usage: .\git-helper.ps1 [command]

param(
    [string]$Command
)

$GitPath = "C:\Program Files\Git\bin\git.exe"

function Show-Usage {
    Write-Host "Git Helper - Usage:" -ForegroundColor Green
    Write-Host "  .\git-helper.ps1 status    - Check git status" -ForegroundColor Yellow
    Write-Host "  .\git-helper.ps1 add       - Add all files" -ForegroundColor Yellow
    Write-Host "  .\git-helper.ps1 commit    - Commit changes" -ForegroundColor Yellow
    Write-Host "  .\git-helper.ps1 push      - Push to GitHub" -ForegroundColor Yellow
    Write-Host "  .\git-helper.ps1 pull      - Pull from GitHub" -ForegroundColor Yellow
    Write-Host "  .\git-helper.ps1 quick     - Add, commit, and push in one go" -ForegroundColor Yellow
}

switch ($Command.ToLower()) {
    "status" {
        & $GitPath status
    }
    "add" {
        Write-Host "Adding all files..." -ForegroundColor Green
        & $GitPath add .
        Write-Host "Files added successfully!" -ForegroundColor Green
    }
    "commit" {
        $message = Read-Host "Enter commit message"
        if ($message) {
            & $GitPath commit -m $message
            Write-Host "Changes committed!" -ForegroundColor Green
        } else {
            Write-Host "No message provided. Commit cancelled." -ForegroundColor Red
        }
    }
    "push" {
        Write-Host "Pushing to GitHub..." -ForegroundColor Green
        & $GitPath push
        Write-Host "Push completed!" -ForegroundColor Green
    }
    "pull" {
        Write-Host "Pulling from GitHub..." -ForegroundColor Green
        & $GitPath pull
        Write-Host "Pull completed!" -ForegroundColor Green
    }
    "quick" {
        Write-Host "=== Quick Git Update ===" -ForegroundColor Cyan
        
        Write-Host "1. Adding all files..." -ForegroundColor Yellow
        & $GitPath add .
        
        $message = Read-Host "2. Enter commit message"
        if ($message) {
            Write-Host "3. Committing changes..." -ForegroundColor Yellow
            & $GitPath commit -m $message
            
            Write-Host "4. Pushing to GitHub..." -ForegroundColor Yellow
            & $GitPath push
            
            Write-Host "=== All done! Your changes are now on GitHub ===" -ForegroundColor Green
        } else {
            Write-Host "No message provided. Operation cancelled." -ForegroundColor Red
        }
    }
    default {
        Show-Usage
    }
}