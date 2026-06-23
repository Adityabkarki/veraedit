@echo off
REM ViraEdit - Install Nepali Fonts
REM Installs Noto Sans Devanagari and Mukta fonts.
REM Required for Nepali captions to render correctly.
REM Without them, captions show as boxes.

setlocal
set "FONTS_DIR=%~dp0..\fonts_temp"
set "WIN_FONTS=C:\Windows\Fonts"
set "USER_FONTS=%LOCALAPPDATA%\Microsoft\Windows\Fonts"

echo.
echo Installing Nepali fonts for Devanagari captions...
echo.

REM --- Noto Sans Devanagari Regular ---
if exist "%WIN_FONTS%\NotoSansDevanagari-Regular.ttf" (
    echo [OK] Noto Sans Devanagari Regular already installed
    goto :check_bold
)
if exist "%USER_FONTS%\NotoSansDevanagari-Regular.ttf" (
    echo [OK] Noto Sans Devanagari Regular already installed (user)
    goto :check_bold
)

if not exist "%FONTS_DIR%" mkdir "%FONTS_DIR%"

echo Downloading Noto Sans Devanagari Regular...
curl -L -s -o "%FONTS_DIR%\NotoSansDevanagari-Regular.ttf" "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf"

if exist "%FONTS_DIR%\NotoSansDevanagari-Regular.ttf" (
    copy "%FONTS_DIR%\NotoSansDevanagari-Regular.ttf" "%WIN_FONTS%\" >nul 2>&1
    if %errorlevel%==0 (
        echo [OK] Noto Sans Devanagari Regular installed system-wide
    ) else (
        if not exist "%USER_FONTS%" mkdir "%USER_FONTS%"
        copy "%FONTS_DIR%\NotoSansDevanagari-Regular.ttf" "%USER_FONTS%\" >nul 2>&1
        echo [OK] Noto Sans Devanagari Regular installed for current user
    )
) else (
    echo [WARN] Could not download Noto Sans Devanagari Regular.
    echo        Download manually: https://fonts.google.com/noto/specimen/Noto+Sans+Devanagari
    echo        Double-click the .ttf file to install.
)

:check_bold
REM --- Noto Sans Devanagari Bold ---
if exist "%WIN_FONTS%\NotoSansDevanagari-Bold.ttf" (
    echo [OK] Noto Sans Devanagari Bold already installed
    goto :check_mukta
)
if exist "%USER_FONTS%\NotoSansDevanagari-Bold.ttf" (
    echo [OK] Noto Sans Devanagari Bold already installed (user)
    goto :check_mukta
)

if not exist "%FONTS_DIR%" mkdir "%FONTS_DIR%"
echo Downloading Noto Sans Devanagari Bold...
curl -L -s -o "%FONTS_DIR%\NotoSansDevanagari-Bold.ttf" "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Bold.ttf"

if exist "%FONTS_DIR%\NotoSansDevanagari-Bold.ttf" (
    copy "%FONTS_DIR%\NotoSansDevanagari-Bold.ttf" "%WIN_FONTS%\" >nul 2>&1
    if %errorlevel% neq 0 (
        copy "%FONTS_DIR%\NotoSansDevanagari-Bold.ttf" "%USER_FONTS%\" >nul 2>&1
    )
    echo [OK] Noto Sans Devanagari Bold installed
)

:check_mukta
REM --- Mukta Regular ---
if exist "%WIN_FONTS%\Mukta-Regular.ttf" (
    echo [OK] Mukta Regular already installed
    goto :cleanup
)
if exist "%USER_FONTS%\Mukta-Regular.ttf" (
    echo [OK] Mukta Regular already installed (user)
    goto :cleanup
)

if not exist "%FONTS_DIR%" mkdir "%FONTS_DIR%"
echo Downloading Mukta Regular...
curl -L -s -o "%FONTS_DIR%\Mukta-Regular.ttf" "https://github.com/EkType/Mukta/raw/master/fonts/ttf/Mukta-Regular.ttf"

if exist "%FONTS_DIR%\Mukta-Regular.ttf" (
    copy "%FONTS_DIR%\Mukta-Regular.ttf" "%WIN_FONTS%\" >nul 2>&1
    if %errorlevel%==0 (
        echo [OK] Mukta Regular installed system-wide
    ) else (
        copy "%FONTS_DIR%\Mukta-Regular.ttf" "%USER_FONTS%\" >nul 2>&1
        echo [OK] Mukta Regular installed for current user
    )
) else (
    echo [WARN] Could not download Mukta. Noto Sans Devanagari will be used as fallback.
)

:cleanup
if exist "%FONTS_DIR%" rmdir /s /q "%FONTS_DIR%" >nul 2>&1

echo.
echo Font installation complete.
echo If captions still show boxes, restart ViraEdit.
echo.
