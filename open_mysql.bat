@echo off
title Mass Mailer MySQL Console
echo ======================================================
echo   Opening MySQL Shell for Mass Mailer Database
echo   Host: 127.0.0.1  ^|  Port: 3307  ^|  DB: mass_mailer_db
echo ======================================================
echo.
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -P 3307 -h 127.0.0.1 mass_mailer_db
pause
