@echo off
echo ========================================
echo Aura OS - Setup and Run
echo ========================================

:: Check Dependencies
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed. Please install it from nodejs.org.
    pause
    exit /b 1
)

where rustc >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Rust is not installed. Please install it from rust-lang.org.
    pause
    exit /b 1
)

where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Ollama is not installed. Please install it from ollama.com.
    pause
    exit /b 1
)

echo Checking AI Model (qwen2.5:0.5b)...
ollama list | findstr "qwen2.5:0.5b" >nul
if %errorlevel% neq 0 (
    echo Model not found. Pulling qwen2.5:0.5b...
    ollama pull qwen2.5:0.5b
) else (
    echo Model found.
)

echo Installing Frontend Dependencies...
cd aura-os
call npm install
if %errorlevel% neq 0 (
    echo Error installing dependencies.
    pause
    exit /b 1
)

echo Starting Aura OS...
call npm run tauri dev
pause
