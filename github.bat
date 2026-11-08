@echo off
echo Pilih aksi Git:
echo [1] Push (Upload perubahan)
echo [2] Pull (Download perubahan)
echo.

set /p choice="Masukkan pilihan (1 atau 2): "

if "%choice%"=="1" (
    echo Menjalankan Push...
    git add .
    git commit -m "update"
    git push origin main
) else if "%choice%"=="2" (
    echo Menjalankan Pull...
    git pull origin main
) else (
    echo Pilihan tidak valid!
)

echo.
echo Selesai.
timeout 5