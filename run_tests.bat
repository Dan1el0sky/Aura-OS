@echo off
echo Running Backend Tests...
cd aura-os/src-tauri
cargo test
if %errorlevel% neq 0 (
    echo Backend tests failed!
    pause
    exit /b 1
)
echo Backend tests passed.

echo Running Frontend Check (Build)...
cd ..
call npm run build
if %errorlevel% neq 0 (
    echo Frontend build failed!
    pause
    exit /b 1
)
echo Frontend build passed.

echo All checks passed!
pause
