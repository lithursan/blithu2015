@echo off
REM Git Helper Script - Makes Git commands easier to use
REM Usage: git-helper.bat [command]

set GIT_PATH="C:\Program Files\Git\bin\git.exe"

if "%1"=="status" (
    %GIT_PATH% status
) else if "%1"=="add" (
    %GIT_PATH% add .
) else if "%1"=="commit" (
    set /p message="Enter commit message: "
    %GIT_PATH% commit -m "!message!"
) else if "%1"=="push" (
    %GIT_PATH% push
) else if "%1"=="pull" (
    %GIT_PATH% pull
) else if "%1"=="quick" (
    echo Adding all files...
    %GIT_PATH% add .
    set /p message="Enter commit message: "
    %GIT_PATH% commit -m "!message!"
    echo Pushing to GitHub...
    %GIT_PATH% push
    echo Done!
) else (
    echo Usage:
    echo   git-helper status    - Check status
    echo   git-helper add       - Add all files
    echo   git-helper commit    - Commit changes
    echo   git-helper push      - Push to GitHub
    echo   git-helper pull      - Pull from GitHub
    echo   git-helper quick     - Add, commit, and push in one command
)